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
  } catch (error) {
    console.error('Error hashing password:', error)
    throw error
  }
}

const utf8ToBase64 = (str) => btoa(unescape(encodeURIComponent(str)))
const base64ToUtf8 = (str) => decodeURIComponent(escape(atob(str)))

const fetchGitHubFile = async (fileName) => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`,
      { headers: getHeaders(), cache: 'no-cache' }
    )
    
    if (!response.ok) {
      if (response.status === 404) return { data: [], sha: null }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    const rawContent = base64ToUtf8(data.content)
    const cleanedContent = rawContent.replace(/^\uFEFF/, '').trim()
    const content = JSON.parse(cleanedContent)
    
    return { data: content, sha: data.sha }
  } catch (error) {
    console.error(`Error fetching ${fileName}:`, error)
    throw error
  }
}

const updateGitHubFile = async (fileName, newData, currentSha) => {
  try {
    const jsonString = JSON.stringify(newData, null, 2)
    const content = utf8ToBase64(jsonString)
    const body = { message: `Update ${fileName}`, content, branch: GITHUB_BRANCH }
    if (currentSha) body.sha = currentSha
    
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error updating ${fileName}:`, error)
    throw error
  }
}

// 🔐 АДМИНЫ
export const getAdmins = async () => {
  const { data } = await fetchGitHubFile(ADMINS_FILE)
  return data || []
}

export const verifyAdmin = async (email, password) => {
  try {
    const admins = await getAdmins()
    const admin = admins.find(a => a.email.toLowerCase() === email.toLowerCase())
    if (!admin) return false
    const inputHash = await hashPassword(password)
    return inputHash === admin.passwordHash
  } catch (error) {
    console.error('Error verifying admin:', error)
    return false
  }
}

// 👥 ПОЛЬЗОВАТЕЛИ
export const getUsers = async () => {
  const { data } = await fetchGitHubFile(USERS_FILE)
  return data || []
}

export const registerUser = async (email, password) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Пользователь с таким email уже существует')
  }
  const passwordHash = await hashPassword(password)
  const newUser = {
    id: Date.now().toString(), email, passwordHash,
    createdAt: new Date().toISOString(), role: 'user',
    isBlocked: false, blockedAt: null, blockedBy: null
  }
  await updateGitHubFile(USERS_FILE, [...users, newUser], sha)
  await addLog({ action: 'register', userEmail: email, details: 'Новый пользователь зарегистрирован' })
  const { passwordHash: _, ...userWithoutPass } = newUser
  return userWithoutPass
}

export const verifyUser = async (email, password) => {
  try {
    const users = await getUsers()
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      await addLog({ action: 'login_failed', userEmail: email, details: 'Пользователь не найден' })
      return null
    }
    if (user.isBlocked) {
      await addLog({ action: 'login_blocked', userEmail: email, details: 'Попытка входа заблокированного пользователя' })
      throw new Error('Ваш аккаунт заблокирован. Обратитесь к администратору.')
    }
    const inputHash = await hashPassword(password)
    if (inputHash !== user.passwordHash) {
      await addLog({ action: 'login_failed', userEmail: email, details: 'Неверный пароль' })
      return null
    }
    await addLog({ action: 'login', userEmail: email, details: 'Успешный вход в систему' })
    const { passwordHash: _, ...userWithoutPass } = user
    return userWithoutPass
  } catch (error) {
    console.error('Error verifying user:', error)
    throw error
  }
}

export const logoutUser = async (userEmail) => {
  if (userEmail) await addLog({ action: 'logout', userEmail, details: 'Пользователь вышел из системы' })
}

export const blockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const updatedUsers = users.map(u => u.id === userId ? { ...u, isBlocked: true, blockedAt: new Date().toISOString(), blockedBy: adminEmail } : u)
  await updateGitHubFile(USERS_FILE, updatedUsers, sha)
  const blockedUser = users.find(u => u.id === userId)
  await addLog({ action: 'user_blocked', userEmail: blockedUser?.email, adminEmail, details: `Пользователь заблокирован администратором ${adminEmail}` })
}

export const unblockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const updatedUsers = users.map(u => u.id === userId ? { ...u, isBlocked: false, blockedAt: null, blockedBy: null } : u)
  await updateGitHubFile(USERS_FILE, updatedUsers, sha)
  const unblockedUser = users.find(u => u.id === userId)
  await addLog({ action: 'user_unblocked', userEmail: unblockedUser?.email, adminEmail, details: `Пользователь разблокирован администратором ${adminEmail}` })
}

// 📊 ЛОГИ
export const getLogs = async () => {
  const { data } = await fetchGitHubFile(LOGS_FILE)
  if (!data || !Array.isArray(data)) return []
  return data
}

export const addLog = async (logData) => {
  try {
    const { data: logs, sha } = await fetchGitHubFile(LOGS_FILE)
    const newLog = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...logData }
    const updatedLogs = [newLog, ...logs].slice(0, 1000)
    await updateGitHubFile(LOGS_FILE, updatedLogs, sha)
    return newLog
  } catch (error) {
    console.error('Error adding log:', error)
    return null
  }
}

export const clearLogs = async () => {
  const { sha } = await fetchGitHubFile(LOGS_FILE)
  await updateGitHubFile(LOGS_FILE, [], sha)
}

// 📚 СЛОВАРЬ
export const getDictionary = async () => fetchGitHubFile(DATA_FILE)
export const updateDictionary = async (newData, currentSha) => updateGitHubFile(DATA_FILE, newData, currentSha)

export const addWord = async (wordData, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  const newWord = { ...wordData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
  await updateGitHubFile(DATA_FILE, [...dictionary, newWord], sha)
  return newWord
}

export const updateWord = async (id, updatedData, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  const updatedDictionary = dictionary.map(w => w.id === id ? { ...w, ...updatedData } : w)
  await updateGitHubFile(DATA_FILE, updatedDictionary, sha)
}

export const deleteWord = async (id, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  const updatedDictionary = dictionary.filter(w => w.id !== id)
  await updateGitHubFile(DATA_FILE, updatedDictionary, sha)
}

// 🔍 ЛОГИРОВАНИЕ
export const logSearch = async (searchTerm, userEmail) => {
  if (!searchTerm?.trim()) return
  await addLog({ action: 'search', userEmail, details: `Поиск слова: "${searchTerm}"` })
}

export const logAudioPlay = async (audioFile, userEmail) => {
  if (!audioFile) return
  await addLog({ action: 'audio_played', userEmail, details: `Прослушано аудио: ${audioFile}` })
}