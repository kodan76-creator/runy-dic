// src/api/dictionary.js
// Работа со словарём: общий (dictionary.json) и личные словари пользователей
import { DATA_FILE, FAVORITES_FILE } from './constants'
import {
  fetchGitHubFile,
  updateGitHubFile,
  isRetryableGitHubError,
} from './client'
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from '../dictionaryAccess'

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
      return { data: Array.from(map.values()), sha: shared.sha || personal.sha || null }
    }

    const fileName = getDictionaryFileName(user)
    return fetchGitHubFile(fileName)
  } catch (e) {
    console.error('getDictionary error:', e)
    return { data: [], sha: null }
  }
}

export const updateDictionary = async (newData, currentSha, user) => {
  const fileName = getDictionaryFileName(user)
  return updateGitHubFile(fileName, newData, currentSha)
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

export const moveWordUp = async (id, user = null) => {
  const fileName = getWriteFileName(user)
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
