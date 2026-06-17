// src/githubApi.js
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
isBlocked: true,
blockedAt: new Date().toISOString(),
blockedBy: 'registration'
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
if (user.isBlocked) throw new Error('Аккаунт заблокирован. Для разблокировки обратитесь к администратору.')
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

// КАТЕГОРИИ
export const getCategories = async () => fetchGitHubFile(CATEGORIES_FILE)
export const addCategory = async (categoryData, userEmail) => {
  const { data: cats, sha } = await getCategories()
  const newCat = { ...categoryData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
  await updateGitHubFile(CATEGORIES_FILE, [...cats, newCat], sha)
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