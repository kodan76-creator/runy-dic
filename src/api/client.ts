// src/api/client.js
// Ядро работы с GitHub Contents API: заголовки, чтение/запись файлов,
// сериализация записей в один файл и обработка ошибок (409/422).
import { encrypt, decrypt, isEncrypted } from '../cryptoUtil'
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  TOKEN,
} from './constants'
import type { GitHubFileResult, GitHubRawResult } from '../types'

export const getHeaders = (): Record<string, string> => ({
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

export const utf8ToBase64 = (str: string): string => btoa(unescape(encodeURIComponent(str)))
export const base64ToUtf8 = (str: string): string => decodeURIComponent(escape(atob(str)))

// Получить SHA файла без декодирования контента (для бинарных файлов)
export const getGitHubFileSha = async (filePath: string): Promise<string | null> => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    const resp = await fetch(url, { headers: getHeaders() })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.sha || null
  } catch {
    return null
  }
}

// ✅ Всегда возвращаем { data, sha, ok, exists }
export const fetchGitHubFile = async (fileName: string): Promise<GitHubFileResult<any[]>> => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`
    const response = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!response.ok) {
      if (response.status === 404) return { data: [], sha: null, ok: true, exists: false }
      const errText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errText}`)
    }

    const fileData = await response.json()
    const fileSha = fileData.sha || null
    if (!fileData.content) return { data: [], sha: fileSha, ok: true, exists: Boolean(fileSha) }

    const raw = base64ToUtf8(fileData.content)
    const cleaned = raw.replace(/^\uFEFF/, '').trim()

    // 🔐 Расшифровка: если данные зашифрованы — расшифровываем
    let textToParse = cleaned
    if (isEncrypted(cleaned)) {
      try {
        textToParse = await decrypt(cleaned)
      } catch (decErr) {
        console.error(`Decrypt ${fileName} error:`, decErr)
        // Файл существует, но не читается — не теряем факт его существования,
        // чтобы запись не превратилась в "HTTP 422: sha wasn't supplied" и не затёрла данные
        return { data: [], sha: null, ok: false, exists: true }
      }
    }

    // Исправление двойного кодирования: если расшифрованный результат — JSON-строка
    if (typeof textToParse === 'string' && textToParse.startsWith('"')) {
      try {
        const inner = JSON.parse(textToParse)
        if (typeof inner === 'string') textToParse = inner
      } catch { /* оставляем как есть */ }
    }

    let content = []
    try {
      content = textToParse ? JSON.parse(textToParse) : []
    } catch (parseErr) {
      console.error(`Parse ${fileName} error:`, parseErr)
      return { data: [], sha: null, ok: false, exists: true }
    }

    // ✅ Возвращаем { data, sha, ok, exists }
    return { data: Array.isArray(content) ? content : [], sha: fileSha, ok: true, exists: true }
  } catch (error) {
    console.error(`Fetch ${fileName} error:`, error)
    // Сетевая/API-ошибка — существование файла неизвестно
    return { data: [], sha: null, ok: false, exists: null }
  }
}

// Сырой fetch (без расшифровки) — для миграции и проверки статуса шифрования
export const fetchGitHubFileRaw = async (fileName: string): Promise<GitHubRawResult> => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`
    const response = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!response.ok) {
      if (response.status === 404) return { data: null, sha: null }
      throw new Error(`HTTP ${response.status}`)
    }
    const fileData = await response.json()
    if (!fileData.content) return { data: null, sha: null }
    const raw = base64ToUtf8(fileData.content)
    return { data: raw.replace(/^\uFEFF/, '').trim(), sha: fileData.sha }
  } catch (error) {
    console.error(`FetchRaw ${fileName} error:`, error)
    return { data: null, sha: null }
  }
}

export const updateGitHubFile = async (fileName: string, newData: unknown, currentSha?: string | null): Promise<any> => {
  try {
    // Узнаём текущее состояние файла: существует ли он и в каком формате (зашифрован/открытый).
    // Это нужно, чтобы НЕ «самошифровать» файлы при обычных записях:
    // открытый файл → пишем открытым, зашифрованный → шифруем.
    const { data, sha } = await fetchGitHubFileRaw(fileName)

    // ⚠️ Защита от "HTTP 422: Invalid request. \"sha\" wasn't supplied.":
    // если sha не передан, но файл уже существует на GitHub — значит, чтение не удалось.
    // Не пишем вслепую: иначе GitHub вернёт 422 или мы затёрли бы существующие данные.
    if (!currentSha && sha) {
      throw new Error(`Не удалось прочитать файл "${fileName}" перед записью. Обновите страницу и попробуйте ещё раз.`)
    }

    // 🔐 Сохраняем текущий формат файла при записи.
    // Если файл существует — берём его формат; если новый — шифруем (безопасно по умолчанию).
    const shouldEncrypt = sha ? isEncrypted(data) : true

    // 📄 Пишем красиво (отступ 2 пробела), чтобы JSON был читаемым,
    // а не в одну строку.
    const payload = JSON.stringify(newData, null, 2)
    const content = shouldEncrypt ? utf8ToBase64(await encrypt(payload)) : utf8ToBase64(payload)
    const body: Record<string, string> = { message: `Update ${fileName}`, content, branch: GITHUB_BRANCH }
    if (currentSha) body.sha = currentSha
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )

    if (!response.ok) {
      const err: any = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status}: ${err.message || response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Update ${fileName} error:`, error)
    throw error
  }
}

// 🔒 Сериализация записей в один файл.
// GitHub Contents API НЕ поддерживает параллельные запросы к одному файлу —
// одновременные GET→PUT гонятся и возвращают 409/422. Очередь выполняет
// записи в файл строго по одной (последовательно), как рекомендует GitHub.
const writeQueues = new Map() // fileName -> Promise-хвост очереди

export const withWriteLock = <T>(fileName: string, task: () => Promise<T>): Promise<T> => {
  const prev = writeQueues.get(fileName) || Promise.resolve()
  const next = prev.then(task, task)
  // Хвост не должен "ломаться" при ошибке задачи
  writeQueues.set(fileName, next.catch(() => {}))
  return next
}

// Проверка: конфликт версий / анти-спам — такие ошибки стоит повторить
export const isRetryableGitHubError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes('409') || msg.includes('422') || msg.includes('Conflict') || msg.includes('sha was supposed')
}
