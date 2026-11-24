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

export const getHeaders = (includeAuth = true): Record<string, string> => ({
  ...(includeAuth && TOKEN ? { 'Authorization': `token ${TOKEN}` } : {}),
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

// ── 🌐 Сеть: таймаут, повтор при обрыве, тихие логи ───────────────────
// GitHub API может быть недоступен (нет сети, ERR_TIMED_OUT, блокировка).
// Приложение не должно из-за этого сыпать ошибками в консоль и бесконечно
// ждать ответа: чтение файлов работает на локальных кэшах (api/offline).
const FETCH_TIMEOUT_MS = 15000
const NETWORK_RETRY_DELAY_MS = 600
const FAILURE_LOG_THROTTLE_MS = 120000

/** Есть ли сеть по данным браузера (в оффлайне запросы к GitHub бессмысленны). */
export const isBrowserOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false

/** Сетевой сбой (обрыв/таймаут), а не ответ сервера с ошибкой. */
export const isNetworkFetchError = (error: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return true
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')) return true
  const msg = error instanceof Error ? error.message : String(error || '')
  return /Failed to fetch|NetworkError|Load failed|ERR_|aborted|timed out/i.test(msg)
}

/** fetch с таймаутом: не даём запросу висеть бесконечно (ERR_TIMED_OUT). */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** fetch к GitHub: один повтор при обрыве сети (короткий сетевой «чих»). */
export const githubFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  if (isBrowserOffline()) throw new TypeError('Failed to fetch')
  try {
    return await fetchWithTimeout(url, options)
  } catch (error) {
    if (!isNetworkFetchError(error) || isBrowserOffline()) throw error
    await new Promise((res) => setTimeout(res, NETWORK_RETRY_DELAY_MS))
    return await fetchWithTimeout(url, options)
  }
}

// Сетевые сбои логируем не чаще одного раза на файл в 2 минуты: иначе
// минутный опрос users.json засоряет консоль одинаковыми ошибками.
const lastFailureLogAt = new Map<string, number>()

export const warnFetchFailure = (fileName: string, error: unknown, kind = 'Fetch'): void => {
  const now = Date.now()
  const last = lastFailureLogAt.get(fileName) || 0
  if (now - last < FAILURE_LOG_THROTTLE_MS) return
  lastFailureLogAt.set(fileName, now)
  const msg = error instanceof Error ? error.message : String(error || '')
  if (isNetworkFetchError(error)) {
    console.warn(`${kind} ${fileName}: нет связи с GitHub — работаем на локальных данных (${msg})`)
  } else {
    console.warn(`${kind} ${fileName} error: ${msg}`)
  }
}

// Быстрые base64-преобразования через TypedArray: deprecated escape/unescape
// и построчный String.fromCharCode тормозили на 1 МБ словаре.
const base64ToBytes = (str: string): Uint8Array => {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const utf8ToBase64 = (str: string): string =>
  bytesToBase64(new TextEncoder().encode(str))

export const base64ToUtf8 = (str: string): string =>
  new TextDecoder().decode(base64ToBytes(str))

// Получить SHA файла без декодирования контента (для бинарных файлов)
export const getGitHubFileSha = async (filePath: string): Promise<string | null> => {
  if (isBrowserOffline()) return null
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    const resp = await githubFetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.sha || null
  } catch {
    return null
  }
}

// GitHub Contents API не отдаёт содержимое файлов больше 1 МБ: в ответе есть
// sha и size, но content пустой (encoding: "none"). Такие файлы (например,
// зашифрованный dictionary.json) читаем через Git Blob API — он поддерживает
// блобы до 100 МБ и возвращает тот же контент в base64.
const fetchLargeBlobContent = async (sha: string, fileName: string): Promise<string | null> => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs/${sha}`
    const response = await githubFetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!response.ok) return null
    const blob = await response.json()
    if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') return null
    return base64ToUtf8(blob.content)
  } catch (error) {
    warnFetchFailure(fileName, error, 'FetchBlob')
    return null
  }
}

// ✅ Всегда возвращаем { data, sha, ok, exists }
export const fetchGitHubFile = async (fileName: string): Promise<GitHubFileResult<any[]>> => {
  // Сети нет — GitHub API недоступен: читатели сами возьмут локальный кэш,
  // поэтому не шумим в консоль и не ждём таймаут
  if (isBrowserOffline()) return { data: [], sha: null, ok: false, exists: null }
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`
    const response = await githubFetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!response.ok) {
      if (response.status === 404) return { data: [], sha: null, ok: true, exists: false }
      const errText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errText}`)
    }

    const fileData = await response.json()
    const fileSha: string | null = fileData.sha || null

    let raw: string
    if (fileData.content) {
      raw = base64ToUtf8(fileData.content)
    } else if (fileSha) {
      // Файл >1 МБ: contents API вернул только sha — читаем блоб целиком
      const blobContent = await fetchLargeBlobContent(fileSha, fileName)
      if (blobContent === null) return { data: [], sha: fileSha, ok: false, exists: true }
      raw = blobContent
    } else {
      return { data: [], sha: null, ok: true, exists: false }
    }

    const cleaned = raw.replace(/^\uFEFF/, '').trim()

    // 🔐 Расшифровка: если данные зашифрованы — расшифровываем
    let textToParse = cleaned
    if (isEncrypted(cleaned)) {
      try {
        textToParse = await decrypt(cleaned)
      } catch (decErr) {
        console.error(`Decrypt ${fileName} error:`, decErr)
        // Файл зашифрован, но ключ не подошёл. Попробуем прочитать как есть —
        // возможно, файл записан открытым JSON (без префикса ENC:v1:) или
        // зашифрован другим ключом. Если это валидный JSON — вернём как есть.
        try {
          const fallback = JSON.parse(cleaned)
          if (Array.isArray(fallback)) {
            console.warn(`${fileName}: зашифрован, но читается как открытый JSON (ключ не совпал?)`)
            return { data: fallback, sha: fileSha, ok: true, exists: true, encrypted: false }
          }
        } catch { /* не JSON — оставляем ошибку расшифровки */ }
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

    // ✅ Возвращаем { data, sha, ok, exists, encrypted }.
    // encrypted используется при записи: не нужно повторно скачивать тот же
    // 1 МБ файл только чтобы узнать, в каком формате его сохранить.
    return {
      data: Array.isArray(content) ? content : [],
      sha: fileSha,
      ok: true,
      exists: true,
      encrypted: isEncrypted(cleaned),
    }
  } catch (error) {
    // Сетевой сбой → тихий троттлинг-лог (без стека и без спама раз в минуту)
    warnFetchFailure(fileName, error)
    // Сетевая/API-ошибка — существование файла неизвестно
    return { data: [], sha: null, ok: false, exists: null }
  }
}

// Сырой fetch (без расшифровки) — для миграции и проверки статуса шифрования
export const fetchGitHubFileRaw = async (fileName: string): Promise<GitHubRawResult> => {
  if (isBrowserOffline()) return { data: null, sha: null }
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`
    const response = await githubFetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!response.ok) {
      if (response.status === 404) return { data: null, sha: null }
      throw new Error(`HTTP ${response.status}`)
    }
    const fileData = await response.json()
    const fileSha: string | null = fileData.sha || null
    if (!fileSha) return { data: null, sha: null }

    // ⚠️ SHA возвращается даже для файлов >1 МБ, у которых contents API не
    // отдаёт content. Возвращаем sha в любом случае: иначе «Безопасность»
    // показывает «не найден», а запись может затереть существующий файл.
    let raw: string | null = null
    if (fileData.content) {
      raw = base64ToUtf8(fileData.content)
    } else {
      raw = await fetchLargeBlobContent(fileSha, fileName)
    }
    if (raw === null) return { data: null, sha: fileSha }
    return { data: raw.replace(/^\uFEFF/, '').trim(), sha: fileSha }
  } catch (error) {
    warnFetchFailure(fileName, error, 'FetchRaw')
    return { data: null, sha: null }
  }
}

export interface UpdateFileOptions {
  /** Формат уже прочитанного файла. Если задан — повторное чтение перед записью не нужно. */
  encrypted?: boolean
  /** Отступ JSON. Для больших словарей компактная запись заметно быстрее. */
  pretty?: boolean
}

export const updateGitHubFile = async (
  fileName: string,
  newData: unknown,
  currentSha?: string | null,
  options: UpdateFileOptions = {}
): Promise<any> => {
  const { encrypted: knownEncrypted, pretty = true } = options
  let attempts = 0
  const maxAttempts = 4
  let workingSha = currentSha || null

  // При knownEncrypted формат уже известен из того же чтения, из которого
  // взяты данные и sha. Повторно скачивать 1 МБ блоб только для isEncrypted() —
  // лишняя сетевая задержка на каждое сохранение/перемещение.
  const refreshSha = async (): Promise<string | null> => {
    if (knownEncrypted === undefined) {
      const { sha } = await fetchGitHubFileRaw(fileName)
      return sha
    }
    return getGitHubFileSha(fileName)
  }

  while (attempts < maxAttempts) {
    try {
      if (!TOKEN) {
        throw new Error('Не задан VITE_GITHUB_TOKEN. Добавьте токен GitHub в .env и перезапустите приложение.')
      }

      // 🔐 Сохраняем текущий формат файла при записи: открытый файл пишем
      // открытым, зашифрованный — зашифрованным. Формат либо передан вызывающим,
      // либо определяется из файла (старый путь).
      let shouldEncrypt: boolean
      if (knownEncrypted !== undefined) {
        shouldEncrypt = knownEncrypted
      } else {
        const { data, sha } = await fetchGitHubFileRaw(fileName)

        // ⚠️ Защита от "HTTP 422: Invalid request. \"sha\" wasn't supplied.":
        // если sha не передан, но файл уже существует на GitHub — значит, чтение не удалось.
        // Не пишем вслепую: иначе GitHub вернёт 422 или мы затёрли бы существующие данные.
        if (!workingSha && sha) {
          throw new Error(`Не удалось прочитать файл "${fileName}" перед записью. Обновите страницу и попробуйте ещё раз.`)
        }
        // sha есть, а содержимое прочитать не удалось (например, не открылся
        // большой блоб) — писать нельзя: можно потерять данные или записать
        // открытый JSON вместо зашифрованного.
        if (sha && data == null) {
          throw new Error(`Не удалось прочитать файл "${fileName}" перед записью. Обновите страницу и попробуйте ещё раз.`)
        }
        shouldEncrypt = sha ? isEncrypted(data) : true
      }

      const payload = JSON.stringify(newData, null, pretty ? 2 : 0)
      const content = shouldEncrypt ? utf8ToBase64(await encrypt(payload)) : utf8ToBase64(payload)
      const body: Record<string, string> = { message: `Update ${fileName}`, content, branch: GITHUB_BRANCH }
      if (workingSha) body.sha = workingSha

      const response = await githubFetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
        { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
      )

      if (!response.ok) {
        const err: any = await response.json().catch(() => ({}))
        const msg = `HTTP ${response.status}: ${err.message || response.statusText}`
        if (isRetryableGitHubError(msg) && attempts < maxAttempts - 1) {
          attempts++
          const latestSha = await refreshSha()
          if (latestSha) workingSha = latestSha
          await new Promise(res => setTimeout(res, 300 + attempts * 250))
          continue
        }
        throw new Error(msg)
      }

      return await response.json()
    } catch (error) {
      // 🌐 Сетевые сбои и конфликты (409/422) — тихий троттлинг-лог вместо
      // console.error: запись повторяется, а консоль не засоряется
      warnFetchFailure(fileName, error, 'Update')
      if (isRetryableGitHubError(error) && attempts < maxAttempts - 1) {
        attempts++
        const latestSha = await refreshSha()
        if (latestSha) workingSha = latestSha
        await new Promise(res => setTimeout(res, 300 + attempts * 250))
        continue
      }
      throw error
    }
  }

  throw new Error(`Остановлена попытка обновить ${fileName}: конфликт версий после нескольких попыток`)
}

// 🛡️ Безопасная запись с бэкапом, верификацией и автооткатом.
// Перед записью сохраняет текущее состояние файла. После успешной PUT-запроса
// сразу читает файл обратно и проверяет валидатором (по умолчанию: ok && Array.isArray(data)).
// Если проверка не прошла — откатывает файл на бэкап и выбрасывает ошибку.
// Это защищает от случая, когда импорт/редактирование пишет файл в неверном формате
// (например, открытый JSON вместо зашифрованного ENC:v1:), и словарь перестаёт загружаться.
export const safeUpdateGitHubFile = async (
  fileName: string,
  newData: unknown,
  currentSha?: string | null,
  options?: { verify?: boolean; validator?: (result: GitHubFileResult) => boolean }
): Promise<any> => {
  const { verify = true, validator = (r: GitHubFileResult) => r.ok && Array.isArray(r.data) } = options || {}

  // 💾 Бэкап текущего состояния для возможного отката
  let oldSha: string | null = null
  let oldData: any = null
  try {
    const current = await fetchGitHubFile(fileName)
    oldSha = current.sha
    oldData = current.data
  } catch (e) {
    console.warn(`safeUpdateGitHubFile: бэкап не удался для ${fileName}`, e)
  }

  // 📝 Запись
  const result = await updateGitHubFile(fileName, newData, currentSha)

  if (!verify) return result

  // 🔍 Верификация: читаем файл обратно и проверяем
  try {
    const verifyResult = await fetchGitHubFile(fileName)
    if (!validator(verifyResult)) {
      console.warn(`safeUpdateGitHubFile: верификация не прошла для ${fileName}`, verifyResult)
      if (oldSha != null && oldData != null) {
        try {
          const raw = await fetchGitHubFileRaw(fileName)
          const rollbackSha = raw.sha || oldSha
          await updateGitHubFile(fileName, oldData, rollbackSha)
        } catch (rollbackErr) {
          throw new Error(
            `Запись отменена: файл ${fileName} не прошел проверку. Откат не удался: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
          )
        }
      }
      throw new Error(
        `Запись отменена: файл ${fileName} не прошел проверку после записи. Данные откатаны на предыдущую версию.`
      )
    }
  } catch (e) {
    if (e.message && (e.message.includes('Запись отменена') || e.message.includes('не прошел проверку'))) throw e
    // Ошибка при самом чтении для верификации (сеть) — тоже пробуем откат
    if (oldSha != null && oldData != null) {
      try {
        const raw = await fetchGitHubFileRaw(fileName)
        const rollbackSha = raw.sha || oldSha
        await updateGitHubFile(fileName, oldData, rollbackSha)
      } catch {
        // откат не удался — пробрасываем исходную ошибку записи ниже
      }
    }
    throw e
  }

  return result
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
