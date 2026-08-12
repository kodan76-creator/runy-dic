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

// ── Оффлайн-кэш рун (общий для всех пользователей) ────────────────────
// Руны одинаковы для всех, поэтому кэшируем в одном ключе, чтобы они
// были доступны без интернета даже при слабом соединении.
const OFFLINE_RUNES_KEY = 'offline_runes'

/** Сохранить руны в офлайн-кэш. */
export const cacheRunesForOffline = (runes) => {
  try {
    localStorage.setItem(OFFLINE_RUNES_KEY, JSON.stringify({
      runes: Array.isArray(runes) ? runes : [],
      savedAt: Date.now(),
    }))
  } catch (e) {
    console.error('cacheRunesForOffline error:', e)
  }
}

/** Получить кэшированные руны (массив или null). */
export const getCachedRunes = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_RUNES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.runes) ? parsed.runes : null
  } catch {
    return null
  }
}

/** Применить одно отложенное изменение к массиву слов (чистая функция).
 *  Используется и для локального кэша, и для воспроизведения очереди при
 *  возврате соединения. Типы: add / update / delete / move. */
export const applyOfflineChange = (arr, change) => {
  const list = Array.isArray(arr) ? [...arr] : []
  if (!change) return list
  switch (change.type) {
    case 'add':
      if (change.word && !list.some(w => w.id === change.word.id)) list.push(change.word)
      break
    case 'update':
      if (change.id != null) {
        const i = list.findIndex(w => w.id === change.id)
        if (i !== -1) list[i] = { ...list[i], ...change.data }
      }
      break
    case 'delete':
      return list.filter(w => w.id !== change.id)
    case 'move': {
      if (change.id == null) break
      const from = list.findIndex(w => w.id === change.id)
      if (from === -1) break
      const [item] = list.splice(from, 1)
      const target = Math.min(Math.max(Number(change.toIndex) || 0, 0), list.length)
      list.splice(target, 0, item)
      break
    }
    case 'reorder': {
      // Полный желаемый порядок id — применяем к массиву, незнакомые
      // слова (добавленные кем-то ещё) дописываем в конец в исходном порядке
      const order = Array.isArray(change.order) ? change.order.map(String) : []
      const byId = new Map(list.map(w => [String(w.id), w]))
      const reordered: any[] = []
      const used = new Set<string>()
      order.forEach(idStr => {
        if (byId.has(idStr) && !used.has(idStr)) {
          reordered.push(byId.get(idStr))
          used.add(idStr)
        }
      })
      list.forEach(w => {
        if (!used.has(String(w.id))) reordered.push(w)
      })
      return reordered
    }
  }
  return list
}

// ── Очередь изменений для синхронизации при возврате сети ────────────
const OFFLINE_QUEUE_KEY = 'offline_queue'

/** Добавить изменение в оффлайн-очередь. change: { type, payload, ... } */
export const enqueueOfflineChange = (change) => {
  try {
    const queue = getOfflineChanges()
    // Уникальный queuedAt (при быстрых изменениях Date.now() может совпасть —
    // иначе removeOfflineChanges по одному времени удалит оба изменения)
    let ts = change?.queuedAt != null ? change.queuedAt : Date.now()
    while (queue.some(c => c.queuedAt === ts)) ts += 1
    queue.push({ ...change, queuedAt: ts })
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
