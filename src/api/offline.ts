// src/api/offline.ts
// Оффлайн-режим: кэш пользователей для входа без интернета и очередь изменений.

const OFFLINE_USERS_KEY = 'offline_users'

/** Есть ли интернет-соединение (по данным браузера). */
export const isOnline = (): boolean =>
  typeof navigator !== 'undefined' ? navigator.onLine : true

// SHA-256 (аналог hashPassword из auth.ts, чтобы не создавать циклический импорт)
const sha256 = async (password) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Кэш пользователей для оффлайн-входа ──────────────────────────────
// После успешного онлайн-входа сохраняем пользователя и хэш пароля,
// чтобы при отсутствии сети можно было войти по локальной копии.

/** Сохранить пользователя для оффлайн-входа. */
export const cacheUserForOffline = (user, passwordHash: string) => {
  if (!user?.email) return
  try {
    const map = JSON.parse(localStorage.getItem(OFFLINE_USERS_KEY) || '{}')
    map[String(user.email).toLowerCase()] = { user, passwordHash }
    localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(map))
  } catch (e) {
    console.error('cacheUserForOffline error:', e)
  }
}

/** Удалить пользователя из оффлайн-кэша. */
export const removeCachedUser = (email: string) => {
  try {
    const map = JSON.parse(localStorage.getItem(OFFLINE_USERS_KEY) || '{}')
    delete map[String(email || '').toLowerCase()]
    localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(map))
  } catch (e) {
    console.error('removeCachedUser error:', e)
  }
}

/** Получить кэшированного пользователя по email (или null). */
export const getCachedOfflineUser = (email) => {
  try {
    const map = JSON.parse(localStorage.getItem(OFFLINE_USERS_KEY) || '{}')
    return map[String(email || '').toLowerCase()] || null
  } catch {
    return null
  }
}

/** Проверить пароль по оффлайн-кэшу (без обращения к серверу). */
export const verifyUserOffline = async (email, password) => {
  if (!email || !password) return null
  const cached = getCachedOfflineUser(email)
  if (!cached?.user) return null
  try {
    const inputHash = await sha256(password)
    if (inputHash !== cached.passwordHash) return null
    return { ...cached.user, offline: true }
  } catch (e) {
    console.error('verifyUserOffline error:', e)
    return null
  }
}

// ── Оффлайн-кэш словаря ──────────────────────────────────────────────
// Единый кэш личного словаря: ключ `offline_dict:<email>`, значение —
// { words, categories, savedAt }. Используется на странице пользователя
// (Home) и в админ-панели для просмотра/редактирования личного словаря
// без интернета.

/** Сохранить словарь пользователя в оффлайн-кэш (слова и/или категории). */
export const cacheDictionaryForOffline = (email, words?, categories?) => {
  if (!email) return
  try {
    const key = `offline_dict:${String(email).toLowerCase()}`
    const prev = JSON.parse(localStorage.getItem(key) || '{}')
    const next = { ...prev, savedAt: Date.now() }
    if (words !== undefined) next.words = Array.isArray(words) ? words : []
    if (categories !== undefined) next.categories = Array.isArray(categories) ? categories : []
    localStorage.setItem(key, JSON.stringify(next))
  } catch (e) {
    console.error('cacheDictionaryForOffline error:', e)
  }
}

/** Получить кэшированный словарь пользователя (массив слов или null). */
export const getCachedDictionary = (email) => {
  try {
    const key = `offline_dict:${String(email || '').toLowerCase()}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.words) ? parsed.words : null
  } catch {
    return null
  }
}

/** Получить кэшированные категории пользователя (массив или null). */
export const getCachedCategories = (email) => {
  try {
    const key = `offline_dict:${String(email || '').toLowerCase()}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.categories) ? parsed.categories : null
  } catch {
    return null
  }
}

// ── Очередь изменений для синхронизации при возврате сети ────────────
const OFFLINE_QUEUE_KEY = 'offline_queue'

/** Добавить изменение в оффлайн-очередь. change: { type, payload, ... } */
export const enqueueOfflineChange = (change) => {
  try {
    const queue = getOfflineChanges()
    queue.push({ ...change, queuedAt: Date.now() })
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    console.error('enqueueOfflineChange error:', e)
  }
}

/** Прочитать все отложенные изменения. */
export const getOfflineChanges = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

/** Удалить выполненные изменения из очереди. */
export const removeOfflineChanges = (queuedAtList: number[]) => {
  try {
    const keep = getOfflineChanges().filter((c) => !queuedAtList.includes(c.queuedAt))
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(keep))
  } catch (e) {
    console.error('removeOfflineChanges error:', e)
  }
}
