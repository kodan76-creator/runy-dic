// src/api/logs.js
// Работа с логами действий (logs.json)
import { LOGS_FILE } from './constants'
import {
  fetchGitHubFile,
  updateGitHubFile,
  withWriteLock,
  isRetryableGitHubError,
} from './client'

export const getLogs = async () => {
  const { data } = await fetchGitHubFile(LOGS_FILE)
  return Array.isArray(data) ? data : []
}

// ✅ Сериализованные записи + повторные попытки (Retry) для 409 и 422
export const addLog = async (logData) => {
  const newLog = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...logData }
  const maxRetries = 4

  return withWriteLock(LOGS_FILE, async () => {
    let retries = 0
    while (retries < maxRetries) {
      try {
        // 1. Получаем актуальные данные и sha
        const { data: logs, sha } = await fetchGitHubFile(LOGS_FILE)
        const arr = Array.isArray(logs) ? logs : []
        // 🧹 Автоочистка: если накопилось 999+ записей — удаляем 100 самых старых.
        // Самые старые логи находятся в конце массива (новые дописываются в начало).
        const trimmed = arr.length >= 999 ? arr.slice(0, arr.length - 100) : arr
        const updated = [newLog, ...trimmed].slice(0, 1000) // Ограничиваем до 1000 записей

        // 2. Пытаемся обновить
        await updateGitHubFile(LOGS_FILE, updated, sha)
        return newLog // Успех
      } catch (error) {
        // 3. Конфликт версий / анти-спам (409/422) — ждем и пробуем снова
        if (isRetryableGitHubError(error) && retries < maxRetries - 1) {
          retries++
          console.warn(`Log update conflict, retrying ${retries}/${maxRetries}...`)
          await new Promise(res => setTimeout(res, 400 + retries * 300))
        } else {
          console.error('addLog error:', error)
          return null
        }
      }
    }
    return null
  })
}

export const clearLogs = async () => {
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
