import { data } from "react-router-dom"
// src/githubApi.js
const GITHUB_OWNER = 'kodan76-creator'
const GITHUB_REPO = 'runy-dic'
const GITHUB_BRANCH = 'main'
const DATA_FILE = 'dictionary.json'
const ADMINS_FILE = 'admins.json'
const USERS_FILE = 'users.json'
const LOGS_FILE = 'logs.json'
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN
const getHeaders = () => ({
'Authorization': `token ${TOKEN}`,
'Accept': 'application/vnd.github.v3+json',
'Content-Type': 'application/json',
})
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

const raw = base64ToUtf8(fileData.content)
const cleaned = raw.replace(/^\uFEFF/, '').trim()
const content = cleaned ? JSON.parse(cleaned) : []

// ✅ ИСПРАВЛЕНО: Возвращаем { data, sha }
return { data: Array.isArray(content) ? content : [], sha: fileData.sha }
} catch (error) {
console.error(`Fetch ${fileName} error:`, error)
return { data: [], sha: null }
}
}
const updateGitHubFile = async (fileName, newData, currentSha) => {
try {
const content = utf8ToBase64(JSON.stringify(newData, null, 2))
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
const admins = await getAdmins()
const admin = admins.find(a => a?.email?.toLowerCase() === email?.toLowerCase())
if (!admin) return null
const inputHash = await hashPassword(password)
if (inputHash !== admin.passwordHash) return null
// ✅ Возвращаем объект с role: 'admin'
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
isBlocked: false,
blockedAt: null,
blockedBy: null
}
await updateGitHubFile(USERS_FILE, [...users, newUser], sha)
addLog({ action: 'register', userEmail: email, details: 'Регистрация' }).catch(() => {})
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
if (user.isBlocked) throw new Error('Аккаунт заблокирован')
const inputHash = await hashPassword(password)
if (inputHash !== user.passwordHash) return null

addLog({ action: 'login', userEmail: email, details: 'Вход' }).catch(() => {})

const { passwordHash: _, ...safeUser } = user
// ✅ ИСПРАВЛЕНО: Возвращаем с role: 'user'
return { ...safeUser, role: 'user' }
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
      const updated = [newLog, ...logs].slice(0, 3000)
      
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
export const getDictionary = async () => fetchGitHubFile(DATA_FILE)
export const updateDictionary = async (newData, currentSha) => updateGitHubFile(DATA_FILE, newData, currentSha)
export const addWord = async (wordData, userEmail) => {
const { data: dict, sha } = await getDictionary()
const newWord = { ...wordData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
await updateGitHubFile(DATA_FILE, [...dict, newWord], sha)
return newWord
}
export const updateWord = async (id, updatedData) => {
const { data: dict, sha } = await getDictionary()
const updated = dict.map(w => w.id === id ? { ...w, ...updatedData } : w)
await updateGitHubFile(DATA_FILE, updated, sha)
}
export const deleteWord = async (id) => {
const { data: dict, sha } = await getDictionary()
const filtered = dict.filter(w => w.id !== id)
await updateGitHubFile(DATA_FILE, filtered, sha)
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