// src/githubApi.js
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from './dictionaryAccess'
import { encrypt, decrypt, isEncrypted } from './cryptoUtil'

const GITHUB_OWNER = 'kodan76-creator'
const GITHUB_REPO = 'runy-dic'
const GITHUB_BRANCH = 'main'
const DATA_FILE = 'dictionary.json'
const ADMINS_FILE = 'admins.json'
const USERS_FILE = 'users.json'
const LOGS_FILE = 'logs.json'
const CATEGORIES_FILE = 'categories.json'
const FAVORITES_FILE = 'favorites.json'
const QUEUE_FILE = 'favorites_queue.json'
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN
const getHeaders = () => ({
'Authorization': `token ${TOKEN}`,
'Accept': 'application/vnd.github.v3+json',
'Content-Type': 'application/json',
})
const getDictionaryFileName = (user) => resolveDictionaryFile(user)
export const hashPassword = async (password) => {
try {
const encoder = new TextEncoder()
const data = encoder.encode(password)
const hashBuffer = await crypto.subtle.digest('SHA-256', data)
const hashArray = Array.from(new Uint8Array(hashBuffer))
return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
} catch (e) {
console.error('Hash error:', e)
throw e
}
}
const utf8ToBase64 = (str) => btoa(unescape(encodeURIComponent(str)))
const base64ToUtf8 = (str) => decodeURIComponent(escape(atob(str)))

// 📁 Создание папки пользователя в public/audio/
export const emailToFolderName = (email) => {
  return String(email || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')
}

// Получить SHA файла без декодирования контента (для бинарных файлов)
const getGitHubFileSha = async (filePath) => {
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

export const ensureUserAudioFolder = async (userEmail) => {
  if (!userEmail) return
  const folder = emailToFolderName(userEmail)
  const filePath = `public/audio/${folder}/.gitkeep`
  try {
    const { sha } = await fetchGitHubFile(filePath)
    if (sha) return { created: false, folder } // уже существует
    // Файл не найден — создаём
    await updateGitHubFile(filePath, [], null)
    return { created: true, folder }
  } catch (e) {
    console.error('ensureUserAudioFolder error:', e)
    return { created: false, folder, error: e.message }
  }
}

// 🎵 Загрузка MP3-файла в папку пользователя
export const uploadAudioFile = async (file, userEmail, rootUpload = false) => {
  if (!file || !userEmail) throw new Error('Файл или пользователь не указаны')
  if (!file.name.toLowerCase().endsWith('.mp3')) throw new Error('Допускаются только MP3-файлы')

  const folder = emailToFolderName(userEmail)
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const filePath = rootUpload ? `public/audio/${safeName}` : `public/audio/${folder}/${safeName}`

  // Получаем SHA, если файл уже существует (для перезаписи)
  const existingSha = await getGitHubFileSha(filePath)

  // Читаем файл как base64
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  // Загружаем через GitHub API (напрямую, минуя updateGitHubFile, т.к. content уже base64)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
  const body = {
    message: `Upload audio: ${safeName}${rootUpload ? '' : ' for ' + folder}`,
    content: base64,
    branch: GITHUB_BRANCH
  }
  if (existingSha) body.sha = existingSha  // если файл есть — перезаписываем
  const response = await fetch(url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Ошибка загрузки: ${err.message || response.statusText}`)
  }

  return { path: safeName, folder: rootUpload ? '' : folder, name: safeName }
}

// 🗑️ Удаление аудиофайла из папки пользователя
export const deleteAudioFile = async (fileName, userEmail, rootUpload = false) => {
  if (!fileName || !userEmail) throw new Error('Имя файла или пользователь не указаны')
  const folder = emailToFolderName(userEmail)
  const filePath = rootUpload ? `public/audio/${fileName}` : `public/audio/${folder}/${fileName}`

  let retries = 0
  const maxRetries = 5

  while (retries < maxRetries) {
    // Получаем SHA напрямую через API (без декодирования бинарного контента)
    const sha = await getGitHubFileSha(filePath)
    if (!sha) throw new Error('Файл не найден')

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
    const body = { message: `Delete audio: ${fileName}${rootUpload ? '' : ' from ' + folder}`, sha, branch: GITHUB_BRANCH }
    const response = await fetch(url, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify(body) })
    if (response.ok) return { deleted: true, name: fileName }

    const err = await response.json().catch(() => ({}))
    const errMsg = err.message || response.statusText
    if (response.status === 409 || errMsg.includes('Conflict')) {
      retries++
      console.warn(`Delete audio conflict, retrying ${retries}/${maxRetries}...`)
      await new Promise(res => setTimeout(res, 500 + retries * 300))
    } else {
      throw new Error(`Ошибка удаления: ${errMsg}`)
    }
  }
  throw new Error('Ошибка удаления: конфликт версий, попробуйте позже')
}

// ✅ ИСПРАВЛЕНО: Всегда возвращаем { data, sha }
const fetchGitHubFile = async (fileName) => {
try {
const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`
const response = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
if (!response.ok) {
  if (response.status === 404) return { data: [], sha: null }
  const errText = await response.text().catch(() => '')
  throw new Error(`HTTP ${response.status}: ${errText}`)
}

const fileData = await response.json()
if (!fileData.content) return { data: [], sha: null }

let raw = base64ToUtf8(fileData.content)
const cleaned = raw.replace(/^\uFEFF/, '').trim()

// 🔐 Расшифровка: если данные зашифрованы — расшифровываем
let textToParse = cleaned
if (isEncrypted(cleaned)) {
  try {
    textToParse = await decrypt(cleaned)
  } catch (decErr) {
    console.error(`Decrypt ${fileName} error:`, decErr)
    textToParse = cleaned
  }
}

// Исправление двойного кодирования: если расшифрованный результат — JSON-строка
if (typeof textToParse === 'string' && textToParse.startsWith('"')) {
  try {
    const inner = JSON.parse(textToParse)
    if (typeof inner === 'string') textToParse = inner
  } catch { /* оставляем как есть */ }
}

const content = textToParse ? JSON.parse(textToParse) : []

// ✅ ИСПРАВЛЕНО: Возвращаем { data, sha }
return { data: Array.isArray(content) ? content : [], sha: fileData.sha }
} catch (error) {
console.error(`Fetch ${fileName} error:`, error)
return { data: [], sha: null }
}
}
const updateGitHubFile = async (fileName, newData, currentSha) => {
try {
// 🔐 Шифрование: зашифровываем JSON перед записью
const encrypted = await encrypt(JSON.stringify(newData))
const content = utf8ToBase64(encrypted)
const body = { message: `Update ${fileName}`, content, branch: GITHUB_BRANCH }
if (currentSha) body.sha = currentSha
const response = await fetch(
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
  { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
)

if (!response.ok) {
  const err = await response.json().catch(() => ({}))
  throw new Error(`HTTP ${response.status}: ${err.message || response.statusText}`)
}
return await response.json()
} catch (error) {
console.error(`Update ${fileName} error:`, error)
throw error
}
}
// 🔐 АДМИНЫ
export const getAdmins = async () => {
const { data } = await fetchGitHubFile(ADMINS_FILE)
return Array.isArray(data) ? data : []
}
export const verifyAdmin = async (email, password) => {
try {
if (!email || !password) return null
const users = await getUsers()
const user = users.find(u => u?.email?.toLowerCase() === email?.toLowerCase())
if (user?.role === 'admin') {
  const inputHash = await hashPassword(password)
  if (inputHash === user.passwordHash) {
    ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on admin login:', e))
    ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on admin login:', e))
    const { passwordHash: _, ...safeUser } = user
    return { ...safeUser, role: 'admin', loginAt: new Date().toISOString() }
  }
}
const admins = await getAdmins()
const admin = admins.find(a => a?.email?.toLowerCase() === email?.toLowerCase())
if (!admin) return null
const inputHash = await hashPassword(password)
if (inputHash !== admin.passwordHash) return null
ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on admin login:', e))
ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on admin login:', e))
return { email: admin.email, role: 'admin', loginAt: new Date().toISOString() }
} catch (e) {
console.error('verifyAdmin error:', e)
return null
}
}
// 👥 ПОЛЬЗОВАТЕЛИ
export const getUsers = async () => {
const { data } = await fetchGitHubFile(USERS_FILE)
return Array.isArray(data) ? data : []
}
export const registerUser = async (email, password) => {
const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
if (users.some(u => u?.email?.toLowerCase() === email?.toLowerCase())) {
throw new Error('Пользователь с таким email уже существует')
}
const passwordHash = await hashPassword(password)
const newUser = {
id: Date.now().toString(),
email,
passwordHash,
createdAt: new Date().toISOString(),
role: 'user',
paid: false,
paidAt: null,
paidBy: null,
unpaidAt: null,
unpaidBy: null,
isBlocked: false,
blockedAt: null,
blockedBy: null
}
await updateGitHubFile(USERS_FILE, [...users, newUser], sha)
addLog({ action: 'register', userEmail: email, details: 'Регистрация' }).catch(() => {})
ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on register:', e))
ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on register:', e))
const { passwordHash: _, ...safeUser } = newUser
// ✅ Возвращаем с role: 'user'
return { ...safeUser, role: 'user' }
}
export const verifyUser = async (email, password) => {
try {
if (!email || !password) return null
const users = await getUsers()
const user = users.find(u => u?.email?.toLowerCase() === email?.toLowerCase())
if (!user) return null
if (user.isBlocked) throw new Error('Аккаунт заблокирован. Для разблокировки обратитесь к администратору.')
const inputHash = await hashPassword(password)
if (inputHash !== user.passwordHash) return null

addLog({ action: 'login', userEmail: email, details: 'Вход' }).catch(() => {})
ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on login:', e))
ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on login:', e))

const { passwordHash: _, ...safeUser } = user
return { ...safeUser, role: user.role || 'user' }
} catch (e) {
console.error('verifyUser error:', e)
throw e
}
}
export const logoutUser = async (userEmail) => {
if (userEmail) addLog({ action: 'logout', userEmail, details: 'Выход' }).catch(() => {})
}
export const blockUser = async (userId, adminEmail) => {
const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
const updated = users.map(u =>
u.id === userId ? { ...u, isBlocked: true, blockedAt: new Date().toISOString(), blockedBy: adminEmail } : u
)
await updateGitHubFile(USERS_FILE, updated, sha)
addLog({ action: 'user_blocked', userEmail: users.find(u => u.id === userId)?.email, adminEmail }).catch(() => {})
}
export const unblockUser = async (userId, adminEmail) => {
const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
const updated = users.map(u =>
u.id === userId ? { ...u, isBlocked: false, blockedAt: null, blockedBy: null } : u
)
await updateGitHubFile(USERS_FILE, updated, sha)
addLog({ action: 'user_unblocked', userEmail: users.find(u => u.id === userId)?.email, adminEmail }).catch(() => {})
}
export const updateUser = async (userId, updatedData, adminEmail) => {
const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
const user = users.find(u => u.id === userId)
if (!user) throw new Error('Пользователь не найден')

const email = String(updatedData.email || '').trim()
if (!email) throw new Error('Email не может быть пустым')
if (!['admin', 'user'].includes(updatedData.role)) throw new Error('Некорректная роль пользователя')

const duplicate = users.find(u =>
u.id !== userId && String(u?.email || '').toLowerCase() === email.toLowerCase()
)
if (duplicate) throw new Error('Пользователь с таким email уже существует')

const paid = Boolean(updatedData.paid)
const now = new Date().toISOString()
const updated = users.map(u => {
  if (u.id !== userId) return u

  const previousPaid = Boolean(u.paid)
  const next = {
    ...u,
    email,
    role: updatedData.role,
    paid,
  }

  if (previousPaid !== paid) {
    if (paid) {
      next.paidAt = now
      next.paidBy = adminEmail
      next.unpaidAt = u.unpaidAt || null
      next.unpaidBy = u.unpaidBy || null
    } else {
      next.unpaidAt = now
      next.unpaidBy = adminEmail
      next.paidAt = u.paidAt || null
      next.paidBy = u.paidBy || null
    }
  }

  return next
})
await updateGitHubFile(USERS_FILE, updated, sha)
addLog({
  action: 'user_updated',
  userEmail: email,
  adminEmail,
  details: `role=${updatedData.role}, paid=${paid}, paidAt=${updated.find(u => u.id === userId)?.paidAt || '-'}, unpaidAt=${updated.find(u => u.id === userId)?.unpaidAt || '-'}`
}).catch(() => {})

const changed = updated.find(u => u.id === userId)
const { passwordHash: _, ...safeUser } = changed
return safeUser
}
export const deleteUser = async (userId, adminEmail) => {
const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
const user = users.find(u => u.id === userId)
const filtered = users.filter(u => u.id !== userId)
await updateGitHubFile(USERS_FILE, filtered, sha)
addLog({ action: 'user_deleted', userEmail: user?.email, adminEmail }).catch(() => {})
}
// 📊 ЛОГИ
export const getLogs = async () => {
const { data } = await fetchGitHubFile(LOGS_FILE)
return Array.isArray(data) ? data : []
}

// ✅ ИСПРАВЛЕНО: Добавлена логика повторных попыток (Retry) для ошибки 409 Conflict
export const addLog = async (logData) => {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      // 1. Получаем актуальные данные и sha
      const { data: logs, sha } = await fetchGitHubFile(LOGS_FILE)
      const newLog = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...logData }
      const updated = [newLog, ...logs].slice(0, 1000) // Ограничиваем до 1000 записей
      
      // 2. Пытаемся обновить
      await updateGitHubFile(LOGS_FILE, updated, sha)
      return newLog // Успех
    } catch (error) {
      // 3. Если ошибка "Conflict" (409), ждем и пробуем снова
      if (error.message.includes('409') || error.message.includes('Conflict')) {
        retries++;
        console.warn(`Log update conflict, retrying ${retries}/${maxRetries}...`);
        // Ждем 500мс + добавочное время для каждой попытки
        await new Promise(res => setTimeout(res, 500 + retries * 200)); 
      } else {
        // Если ошибка другая — сразу выбрасываем
        console.error('addLog error:', error)
        return null
      }
    }
  }
  console.error('Failed to add log after retries')
  return null
}

export const clearLogs = async () => {
const { sha } = await fetchGitHubFile(LOGS_FILE)
await updateGitHubFile(LOGS_FILE, [], sha)
}
// 📚 СЛОВАРЬ
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
  const { data: dict, sha } = await fetchGitHubFile(fileName)
  const newWord = { ...wordData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
  await updateGitHubFile(fileName, [...(Array.isArray(dict) ? dict : []), newWord], sha)
  return newWord
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

// КАТЕГОРИИ
export const getCategories = async () => fetchGitHubFile(CATEGORIES_FILE)
export const addCategory = async (categoryData, userEmail) => {
  const { data: cats, sha } = await getCategories()
  const newCat = { ...categoryData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
  await updateGitHubFile(CATEGORIES_FILE, [newCat, ...cats], sha)
  return newCat
}
export const updateCategory = async (id, updatedData) => {
  const { data: cats, sha } = await getCategories()
  const updated = cats.map(c => c.id === id ? { ...c, ...updatedData } : c)
  await updateGitHubFile(CATEGORIES_FILE, updated, sha)
}
export const deleteCategory = async (id) => {
  const { data: cats, sha } = await getCategories()
  const filtered = cats.filter(c => c.id !== id)
  await updateGitHubFile(CATEGORIES_FILE, filtered, sha)
}
export const moveCategoryUp = async (id) => {
  const { data: cats, sha } = await getCategories()
  const idx = cats.findIndex(c => c.id === id)
  if (idx <= 0) return // already first
  const arr = [...cats]
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  await updateGitHubFile(CATEGORIES_FILE, arr, sha)
}
export const moveCategoryDown = async (id) => {
  const { data: cats, sha } = await getCategories()
  const idx = cats.findIndex(c => c.id === id)
  if (idx === -1 || idx >= cats.length - 1) return // already last
  const arr = [...cats]
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  await updateGitHubFile(CATEGORIES_FILE, arr, sha)
}
export const moveCategoryToTop = async (id) => {
  const { data: cats, sha } = await getCategories()
  const idx = cats.findIndex(c => c.id === id)
  if (idx <= 0) return // already first
  const arr = [...cats]
  const [item] = arr.splice(idx, 1)
  arr.unshift(item)
  await updateGitHubFile(CATEGORIES_FILE, arr, sha)
}
// 🔍 ЛОГИРОВАНИЕ
export const logSearch = async (term, userEmail) => {
if (!term?.trim()) return
addLog({ action: 'search', userEmail, details: `Поиск: "${term}"` }).catch(() => {})
}

export const logAudioPlay = async (file, userEmail) => {
if (!file) return
addLog({ action: 'audio_played', userEmail, details: `Аудио: ${file}` }).catch(() => {})
}

// FAVORITES per-user stored in FAVORITES_FILE
export const getFavoritesForUser = async (userEmail) => {
  if (!userEmail) return []
  try {
    const { data } = await fetchGitHubFile(FAVORITES_FILE)
    if (!Array.isArray(data)) return []
    const rec = data.find(r => String(r.userEmail).toLowerCase() === String(userEmail).toLowerCase())
    return rec && Array.isArray(rec.favorites) ? rec.favorites : []
  } catch (e) {
    console.error('getFavoritesForUser error:', e)
    return []
  }
}

export const updateFavoritesForUser = async (userEmail, favoritesArray, clientUpdatedAt = null) => {
  if (!userEmail) throw new Error('userEmail required')

  const toTs = (s) => { const t = Date.parse(s); return isNaN(t) ? 0 : t }
  const maxRetries = 5
  const baseDelay = 400

  // helper: append an entry to queue file (persist intent)
  const enqueueToQueue = async (entry) => {
    let attempts = 0
    while (attempts < 3) {
      try {
        const { data: qdata, sha: qsha } = await fetchGitHubFile(QUEUE_FILE)
        const qarr = Array.isArray(qdata) ? qdata : []
        qarr.push(entry)
        await updateGitHubFile(QUEUE_FILE, qarr, qsha)
        return true
      } catch (e) {
        if (e.message && (e.message.includes('409') || e.message.includes('Conflict'))) {
          attempts++
          await new Promise(res => setTimeout(res, 200 + attempts * 150))
          continue
        }
        console.error('enqueueToQueue error:', e)
        return false
      }
    }
    console.error('Failed to enqueue after attempts')
    return false
  }

  let retries = 0
  while (retries < maxRetries) {
    try {
      // load favorites and queue
      const { data: all, sha } = await fetchGitHubFile(FAVORITES_FILE)
      const { data: qdata, sha: qsha } = await fetchGitHubFile(QUEUE_FILE)
      const arr = Array.isArray(all) ? all : []
      const queueArr = Array.isArray(qdata) ? qdata : []

      // First: process persistent queue (if any)
      if (queueArr.length > 0) {
        for (const q of queueArr) {
          try {
            const qUser = String(q.userEmail).toLowerCase()
            const qFavs = Array.isArray(q.favorites) ? q.favorites.map(String) : []
            const qTs = toTs(q.updatedAt || q.createdAt || new Date().toISOString())
            const idx = arr.findIndex(r => String(r.userEmail).toLowerCase() === qUser)
            if (idx === -1) {
              arr.push({ userEmail: q.userEmail, favorites: qFavs, updatedAt: q.updatedAt || q.createdAt })
            } else {
              const serverTs = toTs(arr[idx].updatedAt)
              if (qTs >= serverTs) {
                // queued intent is newer -> apply
                arr[idx] = { ...arr[idx], favorites: qFavs, updatedAt: q.updatedAt || q.createdAt }
              } else {
                // server newer -> keep server (skip)
              }
            }
          } catch (e) {
            console.warn('Failed to apply queued entry, skipping', e)
          }
        }
        // write merged favorites and clear queue in one go
        try {
          await updateGitHubFile(FAVORITES_FILE, arr, sha)
          await updateGitHubFile(QUEUE_FILE, [], qsha)
        } catch (e) {
          if (e.message && (e.message.includes('409') || e.message.includes('Conflict'))) {
            // conflict - retry outer loop
            retries++
            await new Promise(res => setTimeout(res, baseDelay * retries + Math.random() * 200))
            continue
          }
          console.error('Failed to flush queue to server:', e)
          // if cannot flush queue, proceed to try processing current request locally (will enqueue on failure)
        }
      }

      // Refresh server state (in case queue write changed it)
      const latest = await fetchGitHubFile(FAVORITES_FILE)
      let latestArr = Array.isArray(latest.data) ? latest.data : []
      let latestSha = latest.sha

      // Now apply current client request with timestamp-aware merge
      const normalized = (favoritesArray || []).map(String)
      const idx = latestArr.findIndex(r => String(r.userEmail).toLowerCase() === String(userEmail).toLowerCase())
      const now = clientUpdatedAt || new Date().toISOString()

      if (idx === -1) {
        latestArr.push({ userEmail, favorites: normalized, updatedAt: now })
      } else {
        const serverTs = toTs(latestArr[idx].updatedAt)
        const clientTs = toTs(now)
        if (clientTs >= serverTs) {
          // client is newer -> accept client's state
          latestArr[idx] = { ...latestArr[idx], favorites: normalized, updatedAt: now }
        } else {
          // server is newer -> keep server, but merge additions to avoid losing them
          const serverFavs = Array.isArray(latestArr[idx].favorites) ? latestArr[idx].favorites.map(String) : []
          const merged = Array.from(new Set([...serverFavs, ...normalized]))
          latestArr[idx] = { ...latestArr[idx], favorites: merged, updatedAt: latestArr[idx].updatedAt }
        }
      }

      // Try write
      await updateGitHubFile(FAVORITES_FILE, latestArr, latestSha)
      return true
    } catch (error) {
      if (error.message && (error.message.includes('409') || error.message.includes('Conflict'))) {
        retries++
        console.warn(`Favorites update conflict, attempt ${retries}`)
        await new Promise(res => setTimeout(res, baseDelay * retries + Math.random() * 200))
        continue
      }
      console.error('updateFavoritesForUser error:', error)
      // persist intent to queue so another client can apply it later
      const entry = { id: Date.now().toString() + Math.floor(Math.random()*1000), userEmail, favorites: (favoritesArray||[]).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
      try {
        await enqueueToQueue(entry)
        console.warn('Saved favorites update intent to queue for later processing')
      } catch (e) {
        console.error('Failed to persist favorites intent to queue:', e)
      }
      return false
    }
  }

  // exhausted retries -> persist intent
  const entry = { id: Date.now().toString() + Math.floor(Math.random()*1000), userEmail, favorites: (favoritesArray||[]).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
  try {
    await enqueueToQueue(entry)
    console.warn('Saved favorites update intent to queue after retries exhausted')
  } catch (e) {
    console.error('Failed to persist favorites intent to queue after retries:', e)
  }
  return false
}

// 🔐 МИГРАЦИЯ: Зашифровать все существующие JSON-файлы
// Вызывать из консоли: await migrateAllFiles()
export const migrateAllFiles = async () => {
  const filesToMigrate = [
    DATA_FILE,
    ADMINS_FILE,
    USERS_FILE,
    LOGS_FILE,
    CATEGORIES_FILE,
    FAVORITES_FILE,
    QUEUE_FILE,
    // Персональные словари
    'kodan76.json',
    'ya.kodan76.json',
    'winx0212.json',
    'test.json',
    'test2.json',
    'dictionary.json2'
  ]

  const results = []
  for (const fileName of filesToMigrate) {
    try {
      console.log(`🔄 Проверяю ${fileName}...`)
      const { data, sha } = await fetchGitHubFileRaw(fileName)
      if (!sha) {
        console.log(`⏭️ ${fileName}: не найден, пропускаю`)
        results.push({ file: fileName, status: 'not_found' })
        continue
      }

      // Проверяем, зашифрован ли уже
      if (isEncrypted(data)) {
        console.log(`✅ ${fileName}: уже зашифрован`)
        results.push({ file: fileName, status: 'already_encrypted' })
        continue
      }

      // Зашифровываем и записываем (data — уже строка, НЕ нужно оборачивать в JSON.stringify)
      const encrypted = await encrypt(data)
      const content = utf8ToBase64(encrypted)
      const body = { message: `🔐 Encrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
        { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.message || response.statusText)
      }
      console.log(`🔐 ${fileName}: зашифрован`)
      results.push({ file: fileName, status: 'encrypted' })
    } catch (e) {
      console.error(`❌ ${fileName}: ошибка —`, e.message)
      results.push({ file: fileName, status: 'error', error: e.message })
    }
  }

  console.log('\n📊 Результат миграции:')
  console.table(results)
  return results
}

// Сытой fetch (без расшифровки) — для миграции
const fetchGitHubFileRaw = async (fileName) => {
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

// 🔐 Расшифровать один файл
export const decryptFile = async (fileName) => {
  try {
    const { data, sha } = await fetchGitHubFileRaw(fileName)
    if (!sha) return { file: fileName, status: 'not_found' }
    if (!isEncrypted(data)) {
      // Проверяем, не имеет ли файл двойное кодирование без шифрования
      if (data.startsWith('"')) {
        try {
          const inner = JSON.parse(data)
          if (typeof inner === 'string') {
            // Двойное кодирование без шифрования — восстанавливаем
            const parsed = JSON.parse(inner)
            const formatted = JSON.stringify(parsed, null, 2)
            const content = utf8ToBase64(formatted)
            const body = { message: `🔧 Repair ${fileName} (fix double-encoding)`, content, sha, branch: GITHUB_BRANCH }
            const response = await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
              { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
            )
            if (!response.ok) throw new Error('Failed to repair')
            return { file: fileName, status: 'repaired' }
          }
        } catch { /* не двойное кодирование — пропускаем */ }
      }
      return { file: fileName, status: 'not_encrypted' }
    }

    let decrypted = await decrypt(data)

    // Исправление двойного кодирования: если результат — JSON-строка (начинается с "),
    // распарсить её чтобы получить настоящий JSON
    if (typeof decrypted === 'string' && decrypted.startsWith('"')) {
      try {
        const parsed = JSON.parse(decrypted)
        if (typeof parsed === 'string') {
          decrypted = parsed // был двойной stringify — берём распарсенную строку
        }
      } catch { /* не строка — оставляем как есть */ }
    }

    // Проверяем, что расшифрованные данные — валидный JSON
    const parsed = JSON.parse(decrypted)
    // Форматируем красиво для консистентности
    const formatted = Array.isArray(parsed) ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed, null, 2)

    const content = utf8ToBase64(formatted)
    const body = { message: `🔓 Decrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || response.statusText)
    }
    return { file: fileName, status: 'decrypted' }
  } catch (e) {
    console.error(`DecryptFile ${fileName} error:`, e)
    return { file: fileName, status: 'error', error: e.message }
  }
}

// 🔐 Проверить статус шифрования всех файлов
const KNOWN_FILES = [
  DATA_FILE, ADMINS_FILE, USERS_FILE, LOGS_FILE,
  CATEGORIES_FILE, FAVORITES_FILE, QUEUE_FILE
]

export const checkFilesEncryptionStatus = async () => {
  // Сначала сканируем known файлы + ищем персональные словари в favorites
  let personalFiles = []
  try {
    const { data: favData } = await fetchGitHubFileRaw(FAVORITES_FILE)
    if (favData && isEncrypted(favData)) {
      // Favorites зашифрован — расшифруем чтобы прочитать список пользователей
      const decrypted = await decrypt(favData)
      const parsed = JSON.parse(decrypted)
      if (Array.isArray(parsed)) {
        personalFiles = parsed.map(r => getDictionaryFileNameForEmail(r.userEmail)).filter(Boolean)
      }
    } else if (favData) {
      const parsed = JSON.parse(favData)
      if (Array.isArray(parsed)) {
        personalFiles = parsed.map(r => getDictionaryFileNameForEmail(r.userEmail)).filter(Boolean)
      }
    }
  } catch { /* ignore */ }

  const allFiles = [...new Set([...KNOWN_FILES, ...personalFiles])]
  const results = []

  for (const fileName of allFiles) {
    try {
      const { data, sha } = await fetchGitHubFileRaw(fileName)
      if (!sha) {
        results.push({ file: fileName, encrypted: null, status: 'not_found', broken: false })
        continue
      }
      const encrypted = isEncrypted(data)
      // Проверяем двойное кодирование: файл не зашифрован, но начинается с "
      let broken = false
      if (!encrypted && data && data.startsWith('"')) {
        try {
          const inner = JSON.parse(data)
          if (typeof inner === 'string') broken = true
        } catch { /* ok */ }
      }
      const status = encrypted ? 'encrypted' : broken ? 'broken' : 'plain'
      results.push({ file: fileName, encrypted, status, broken })
    } catch {
      results.push({ file: fileName, encrypted: null, status: 'error', broken: false })
    }
  }
  return results
}

// 🔐 Расшифровать несколько файлов
export const decryptFiles = async (fileNames) => {
  const results = []
  for (const fileName of fileNames) {
    const result = await decryptFile(fileName)
    results.push(result)
  }
  return results
}

// 🔐 Зашифровать один файл
export const encryptFile = async (fileName) => {
  try {
    const { data, sha } = await fetchGitHubFileRaw(fileName)
    if (!sha) return { file: fileName, status: 'not_found' }
    if (isEncrypted(data)) return { file: fileName, status: 'already_encrypted' }

    // Если файл сломан (двойное кодирование) — сначала восстанавливаем
    let contentToEncrypt = data
    if (data.startsWith('"')) {
      try {
        const inner = JSON.parse(data)
        if (typeof inner === 'string') {
          contentToEncrypt = JSON.stringify(JSON.parse(inner), null, 2)
        }
      } catch { /* не двойное — шифруем как есть */ }
    }

    const encrypted = await encrypt(contentToEncrypt)
    const content = utf8ToBase64(encrypted)
    const body = { message: `🔐 Encrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || response.statusText)
    }
    return { file: fileName, status: 'encrypted' }
  } catch (e) {
    console.error(`EncryptFile ${fileName} error:`, e)
    return { file: fileName, status: 'error', error: e.message }
  }
}

// 🔐 Зашифровать несколько файлов
export const encryptFiles = async (fileNames) => {
  const results = []
  for (const fileName of fileNames) {
    const result = await encryptFile(fileName)
    results.push(result)
  }
  return results
}
