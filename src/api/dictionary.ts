// src/api/dictionary.js
// Работа со словарём: общий (dictionary.json) и личные словари пользователей
import { DATA_FILE, FAVORITES_FILE } from './constants'
import {
  fetchGitHubFile,
  updateGitHubFile,
  isRetryableGitHubError,
} from './client'
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from '../dictionaryAccess'
import {
  isOnline,
  enqueueOfflineChange,
  getOfflineChanges,
  removeOfflineChanges,
  applyOfflineChange,
  getCachedDictionary,
  cacheDictionaryForOffline,
} from './offline'

const getDictionaryFileName = (user) => resolveDictionaryFile(user)

export const getDictionary = async (user) => {
  try {
    // If the user is a paid regular user, return merged view of shared dictionary and personal file
    if (user && typeof user === 'object' && user.role === 'user' && user.paid) {
      const shared = await fetchGitHubFile(DATA_FILE)
      const personalName = getDictionaryFileNameForEmail(user.email)
      const personal = await fetchGitHubFile(personalName)
      const sharedArr = Array.isArray(shared.data) ? shared.data.map(item => ({ ...item, __dictionarySource: 'shared' })) : []
      const personalArr = Array.isArray(personal.data) ? personal.data.map(item => ({ ...item, __dictionarySource: 'personal' })) : []

      // Merge with deduplication by id when available, otherwise by word+translation
      const map = new Map()
      const add = (it) => {
        if (!it) return
        const key = it.id ? `id:${it.id}` : `w:${String(it.word||'')}_t:${String(it.translation||'')}`
        if (!map.has(key)) map.set(key, it)
      }
      sharedArr.forEach(add)
      personalArr.forEach(add)
      // ok = оба источника доступны. При слабом интернете один из запросов
      // может вернуть ok:false (пустые данные) — тогда вызывающий упадёт
      // на офлайн-кэш, а полученные частично данные всё равно покажет.
      const ok = shared.ok !== false && personal.ok !== false
      return { data: Array.from(map.values()), sha: shared.sha || personal.sha || null, ok, exists: shared.exists ?? personal.exists ?? null }
    }

    const fileName = getDictionaryFileName(user)
    return fetchGitHubFile(fileName)
  } catch (e) {
    console.error('getDictionary error:', e)
    return { data: [], sha: null, ok: false, exists: null }
  }
}

export const updateDictionary = async (newData, currentSha, user) => {
  const fileName = getDictionaryFileName(user)
  return updateGitHubFile(fileName, newData, currentSha)
}

// Импорт словаря из файла: заменяет содержимое целевого файла (общий словарь
// для админа, личный файл — для обычного пользователя). С повторами при
// временных сбоях, как у addWord.
export const importDictionary = async (newData, user = null) => {
  const fileName = getWriteFileName(user)
  const arr = Array.isArray(newData) ? newData : []
  const maxRetries = 4
  let lastError = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { sha, exists, ok } = await fetchGitHubFile(fileName)
      if (exists === true && !ok) {
        throw new Error(`Не удалось прочитать файл словаря (${fileName}). Обновите страницу и попробуйте ещё раз.`)
      }
      await updateGitHubFile(fileName, arr, sha)
      return arr
    } catch (error) {
      lastError = error
      const retryable = isRetryableGitHubError(error) ||
        /Failed to fetch|NetworkError|Не удалось прочитать/.test(error?.message || String(error))
      if (retryable && attempt < maxRetries - 1) {
        console.warn(`importDictionary: ${error.message || error}, повторная попытка ${attempt + 1}/${maxRetries}`)
        await new Promise(res => setTimeout(res, 400 + attempt * 300))
        continue
      }
      throw error
    }
  }
  throw lastError
}

// Переводит техническую ошибку импорта в понятное пользователю сообщение
// с рекомендацией по исправлению.
export const humanizeImportError = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error)
  const m = msg.toLowerCase()
  if (m.includes('409') || m.includes('conflict') || m.includes('sha was supposed') || m.includes('sha wasn')) {
    return '⚠️ Конфликт записи: кто-то другой одновременно изменил словарь. Обновите страницу (🔄) и повторите импорт.'
  }
  if (m.includes('401') || m.includes('403') || m.includes('bad credentials') || m.includes('token') || m.includes('forbidden')) {
    return '❌ Нет доступа к GitHub. Проверьте токен доступа (VITE_GITHUB_TOKEN) и права на редактирование репозитория.'
  }
  if (m.includes('422')) {
    return '❌ Ошибка записи на GitHub (422). Обновите страницу (🔄) и повторите импорт.'
  }
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('timeout')) {
    return '❌ Нет соединения с GitHub. Проверьте интернет-соединение и повторите импорт.'
  }
  if (m.includes('не удалось прочитать') || m.includes('read')) {
    return '⚠️ Не удалось прочитать текущий словарь на сервере. Обновите страницу (🔄) и повторите импорт.'
  }
  return `❌ ${msg || 'Неизвестная ошибка при импорте'}`
}

// Нормализует id импортируемых слов:
//  - пустой/отсутствующий id → автоподстановка: текущая дата+время в unix (мс),
//    как делает addWord (Date.now()). Уникален в партии.
//  - есть id, но он не равен (baseId+1) → назначаем baseId+1 (last+1).
// Это НЕ ошибка — просто исправляем и продолжаем.
export const normalizeImportIds = (words: any[], baseId: number = 0): any[] => {
  let next = baseId
  const now = Date.now()
  let tsOffset = 0
  return (Array.isArray(words) ? words : []).map(w => {
    const cur = w && w.id != null && String(w.id) !== '' ? String(w.id) : ''
    if (cur === '') {
      const ts = String(now + tsOffset)
      tsOffset += 1
      return { ...w, id: ts }
    }
    next += 1
    if (cur !== String(next)) {
      return { ...w, id: String(next) }
    }
    return { ...w, id: cur }
  })
}

const getWriteFileName = (userOrEmail) => {
  // Determine file to write to. Users always write to their personal file; admins write to shared DATA_FILE.
  if (!userOrEmail) return 'user.json'
  if (typeof userOrEmail === 'string') return getDictionaryFileNameForEmail(userOrEmail)
  if (userOrEmail.role === 'admin') return DATA_FILE
  if (userOrEmail.role === 'user') return getDictionaryFileNameForEmail(userOrEmail.email || '')
  // Fallback
  return 'user.json'
}

export const ensureUserDictionaryFile = async (userOrEmail) => {
  const fileName = getWriteFileName(userOrEmail)

  if (fileName === DATA_FILE) {
    return { fileName, exists: true, created: false }
  }

  const { sha } = await fetchGitHubFile(fileName)
  if (sha) {
    return { fileName, exists: true, created: false }
  }

  await updateGitHubFile(fileName, [], null)
  return { fileName, exists: false, created: true }
}

export const addWord = async (wordData, userEmail, user = null) => {
  const target = user || userEmail
  const fileName = getWriteFileName(target)
  const newWord = { ...wordData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }

  // 🌐 Оффлайн: применяем изменение к кэшу и ставим в очередь,
  // чтобы при возврате сети синхронизировать (flushOfflineChanges)
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'add', fileName, word: newWord })
    const email = getCacheEmail(target)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'add', word: newWord }))
      }
    }
    return newWord
  }

  // Повторные попытки при временных сбоях чтения (rate-limit, конфликт версий),
  // чтобы операция не падала с "HTTP 422: sha wasn't supplied"
  const maxRetries = 4
  let lastError = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data: dict, sha, exists, ok } = await fetchGitHubFile(fileName)
      // Файл существует, но не читается — прерываем, чтобы не потерять данные
      if (exists === true && !ok) {
        throw new Error(`Не удалось прочитать файл словаря (${fileName}). Обновите страницу и попробуйте ещё раз.`)
      }
      await updateGitHubFile(fileName, [...(Array.isArray(dict) ? dict : []), newWord], sha)
      return newWord
    } catch (error) {
      lastError = error
      const retryable = isRetryableGitHubError(error) ||
        /Failed to fetch|NetworkError|Не удалось прочитать/.test(error?.message || String(error))
      if (retryable && attempt < maxRetries - 1) {
        console.warn(`addWord: ${error.message || error}, повторная попытка ${attempt + 1}/${maxRetries}`)
        await new Promise(res => setTimeout(res, 400 + attempt * 300))
        continue
      }
      throw error
    }
  }
  throw lastError
}

export const updateWord = async (id, updatedData, user = null) => {
  const fileName = getWriteFileName(user)

  // 🌐 Оффлайн: применяем к кэшу + ставим в очередь на синхронизацию
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'update', fileName, id, data: updatedData })
    const email = getCacheEmail(user)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'update', id, data: updatedData }))
      }
    }
    return { id, ...updatedData }
  }

  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? dict : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx === -1) {
    throw new Error('Запись не найдена или доступ запрещён')
  }
  arr[idx] = { ...arr[idx], ...updatedData }
  await updateGitHubFile(fileName, arr, sha)
  return arr[idx]
}

export const deleteWord = async (id, user = null) => {
  const fileName = getWriteFileName(user)

  // 🌐 Оффлайн: применяем к кэшу + ставим в очередь на синхронизацию
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'delete', fileName, id })
    const email = getCacheEmail(user)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'delete', id }))
      }
    }
    return { id }
  }

  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? dict : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx === -1) {
    throw new Error('Запись не найдена или доступ запрещён')
  }
  const removed = arr.splice(idx, 1)
  await updateGitHubFile(fileName, arr, sha)

  // Удалить ID из всех списков избранного в favorites.json
  try {
    const idStr = String(id)
    const { data: favData, sha: favSha } = await fetchGitHubFile(FAVORITES_FILE)
    if (Array.isArray(favData)) {
      let changed = false
      const updated = favData.map(entry => {
        if (Array.isArray(entry.favorites) && entry.favorites.includes(idStr)) {
          changed = true
          return { ...entry, favorites: entry.favorites.filter(f => f !== idStr) }
        }
        return entry
      })
      if (changed) {
        await updateGitHubFile(FAVORITES_FILE, updated, favSha)
      }
    }
  } catch (e) {
    console.error('Failed to remove word from favorites after deletion:', e)
  }

  return removed[0]
}

// 🌐 Оффлайн-перемещение: применяем к кэшу и ставим в очередь как
// полный порядок id (reorder) — так перемещение воспроизводится
// надёжно при синхронизации, независимо от исходного порядка на сервере
const applyOfflineMove = (fileName, user, reorderArr) => {
  enqueueOfflineChange({ type: 'reorder', fileName, order: reorderArr.map(w => w.id) })
  const email = getCacheEmail(user)
  if (email) {
    const cached = getCachedDictionary(email)
    if (Array.isArray(cached)) {
      cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'reorder', order: reorderArr.map(w => w.id) }))
    }
  }
  return true
}

// 🌐 Получить email для оффлайн-кэша из user (объект пользователя или строка)
const getCacheEmail = (user) => {
  if (!user) return null
  return typeof user === 'string' ? user : (user.email || null)
}

// 🌐 При отсутствии сети читаем список из кэша для проверки позиции/перемещения
const getCachedArray = (user) => {
  const email = getCacheEmail(user)
  if (!email) return []
  const cached = getCachedDictionary(email)
  return Array.isArray(cached) ? cached : []
}

export const moveWordUp = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx <= 0) return false
    const reordered = [...arr]
    ;[reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]]
    return applyOfflineMove(fileName, user, reordered)
  }
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? [...dict] : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx <= 0) return false
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  await updateGitHubFile(fileName, arr, sha)
  return true
}

export const moveWordDown = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1 || idx >= arr.length - 1) return false
    const reordered = [...arr]
    ;[reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]]
    return applyOfflineMove(fileName, user, reordered)
  }
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? [...dict] : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx === -1 || idx >= arr.length - 1) return false
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  await updateGitHubFile(fileName, arr, sha)
  return true
}

export const moveWordToTop = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx <= 0) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.unshift(item)
    return applyOfflineMove(fileName, user, reordered)
  }
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? [...dict] : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx <= 0) return false
  const [item] = arr.splice(idx, 1)
  arr.unshift(item)
  await updateGitHubFile(fileName, arr, sha)
  return true
}

export const moveWordToBottom = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1 || idx >= arr.length - 1) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.push(item)
    return applyOfflineMove(fileName, user, reordered)
  }
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? [...dict] : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx === -1 || idx >= arr.length - 1) return false
  const [item] = arr.splice(idx, 1)
  arr.push(item)
  await updateGitHubFile(fileName, arr, sha)
  return true
}

// Переместить карточку на указанную позицию (1-индексная)
export const moveWordToPosition = async (id, position, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1) throw new Error('Запись не найдена или доступ запрещён')
    const target = Math.min(Math.max(parseInt(position, 10) - 1, 0), arr.length - 1)
    if (idx === target) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(target, 0, item)
    return applyOfflineMove(fileName, user, reordered)
  }
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const arr = Array.isArray(dict) ? [...dict] : []
  const idx = arr.findIndex(w => w.id === id)
  if (idx === -1) throw new Error('Запись не найдена или доступ запрещён')
  const target = Math.min(Math.max(parseInt(position, 10) - 1, 0), arr.length - 1)
  if (idx === target) return false
  const [item] = arr.splice(idx, 1)
  arr.splice(target, 0, item)
  await updateGitHubFile(fileName, arr, sha)
  return true
}

// 🌐 Синхронизация: воспроизводит все отложенные оффлайн-изменения для
// указанного файла на GitHub. Вызывается при возврате соединения.
export const flushOfflineChanges = async (user: any = null) => {
  const fileName = getWriteFileName(user)
  const all = getOfflineChanges()
  const mine = all.filter(c => c.fileName === fileName)
  if (mine.length === 0) return 0

  const { data: dict, sha, ok } = await fetchGitHubFile(fileName)
  if (!ok) throw new Error('Не удалось прочитать файл для синхронизации')
  let arr = Array.isArray(dict) ? [...dict] : []
  const applied: number[] = []
  for (const change of mine) {
    const before = JSON.stringify(arr)
    arr = applyOfflineChange(arr, change)
    if (JSON.stringify(arr) !== before) applied.push(change.queuedAt)
  }
  await updateGitHubFile(fileName, arr, sha)
  removeOfflineChanges(applied)
  return applied.length
}
