// src/api/logs.js
// Работа с логами действий (logs.json)
import { LOGS_FILE } from './constants'
import {
  fetchGitHubFile,
  updateGitHubFile,
  withWriteLock,
  isRetryableGitHubError,
  isBrowserOffline,
} from './client'

export const getLogs = async () => {
  const { data } = await fetchGitHubFile(LOGS_FILE)
  return Array.isArray(data) ? data : []
}

// 📦 Батчинг записей: все события за короткое окно уходят ОДНИМ обновлением
// logs.json. Иначе каждая запись (поиск, воспроизведение аудио) делает
// GET→PUT, и параллельные записи с других устройств конфликтуют — GitHub
// отвечает 409 Conflict, а консоль заполняется ошибками.
const LOG_BATCH_DELAY_MS = 4000
const MAX_WRITE_RETRIES = 3
const MAX_PENDING_LOGS = 200

let pendingLogs: any[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null
let lifecycleBound = false

// Новые записи — в начало файла, старые в конце (как было и раньше)
const buildUpdatedLogs = (existing: any[], batch: any[]) => {
  const arr = Array.isArray(existing) ? existing : []
  // 🧹 Автоочистка: если накопилось 999+ записей — удаляем 100 самых старых
  const trimmed = arr.length >= 999 ? arr.slice(0, arr.length - 100) : arr
  return [...[...batch].reverse(), ...trimmed].slice(0, 1000)
}

/** Записать все накопленные логи одним обновлением logs.json. */
export const flushPendingLogs = async (): Promise<void> => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (flushing) return flushing
  // Нет сети — не мучаем GitHub запросами, запишем когда связь появится
  if (isBrowserOffline() || pendingLogs.length === 0) return
  const batch = pendingLogs
  pendingLogs = []
  flushing = (async () => {
    try {
      await withWriteLock(LOGS_FILE, async () => {
        let retries = 0
        while (retries < MAX_WRITE_RETRIES) {
          try {
            const { data: logs, sha } = await fetchGitHubFile(LOGS_FILE)
            await updateGitHubFile(LOGS_FILE, buildUpdatedLogs(logs, batch), sha)
            return
          } catch (error) {
            // Конфликт версий / анти-спам (409/422) — ждём и пробуем снова
            if (isRetryableGitHubError(error) && retries < MAX_WRITE_RETRIES - 1) {
              retries++
              await new Promise(res => setTimeout(res, 400 + retries * 300))
              continue
            }
            throw error
          }
        }
      })
    } catch {
      // Логи — вспомогательные данные: сбой записи не ломает приложение,
      // а сами записи возвращаем в буфер и допишем при следующей попытке
      pendingLogs = [...batch, ...pendingLogs].slice(-MAX_PENDING_LOGS)
      console.warn(`addLog: ${batch.length} записей отложено (нет связи с GitHub)`)
    } finally {
      flushing = null
    }
  })()
  return flushing
}

const scheduleFlush = () => {
  if (flushTimer || flushing) return
  flushTimer = setTimeout(() => { flushTimer = null; flushPendingLogs() }, LOG_BATCH_DELAY_MS)
}

// Пишем логи сразу, когда связь вернулась или вкладку закрывают/сворачивают
const bindLifecycleFlush = () => {
  if (lifecycleBound || typeof window === 'undefined') return
  lifecycleBound = true
  window.addEventListener('online', () => { flushPendingLogs() })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingLogs()
    })
  }
}

// ✅ Запись события в батч (само обновление файла — через flushPendingLogs)
export const addLog = async (logData) => {
  const newLog = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...logData }
  pendingLogs.push(newLog)
  // Ограничиваем буфер, чтобы долгая оффлайн-сессия не копила память
  if (pendingLogs.length > MAX_PENDING_LOGS) pendingLogs = pendingLogs.slice(-MAX_PENDING_LOGS)
  bindLifecycleFlush()
  scheduleFlush()
  return newLog
}

export const clearLogs = async () => {
  pendingLogs = []
  return withWriteLock(LOGS_FILE, async () => {
    const { sha } = await fetchGitHubFile(LOGS_FILE)
    await updateGitHubFile(LOGS_FILE, [], sha)
  })
}

// 🔍 ЛОГИРОВАНИЕ действий пользователя
export const logSearch = async (term, userEmail) => {
  if (!term?.trim()) return
  addLog({ action: 'search', userEmail, details: `Поиск: "${term}"` }).catch(() => {})
}

export const logAudioPlay = async (file, userEmail) => {
  if (!file) return
  addLog({ action: 'audio_played', userEmail, details: `Аудио: ${file}` }).catch(() => {})
}
