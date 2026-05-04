// src/githubApi.js

const GITHUB_OWNER = 'kodan76-creator'
const GITHUB_REPO = 'runy-dic'
const GITHUB_BRANCH = 'main'
const DATA_FILE = 'dictionary.json'
const ADMINS_FILE = 'admins.json'
const USERS_FILE = 'users.json'
const LOGS_FILE = 'logs.json'

// Получение токена из env
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN

// Заголовки для API
const getHeaders = () => ({
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

// ✅ Хэширование пароля (SHA-256)
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

// ✅ Правильное кодирование UTF-8 в Base64
const utf8ToBase64 = (str) => {
  return btoa(unescape(encodeURIComponent(str)))
}

// ✅ Правильное декодирование Base64 в UTF-8
const base64ToUtf8 = (str) => {
  return decodeURIComponent(escape(atob(str)))
}

// Чтение любого файла из GitHub
const fetchGitHubFile = async (fileName) => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}&t=${Date.now()}`,
      { 
        headers: getHeaders(),
        cache: 'no-cache'
      }
    )
    
    if (!response.ok) {
      if (response.status === 404) {
        return { data: [], sha: null }
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    const rawContent = base64ToUtf8(data.content)
    const cleanedContent = rawContent.replace(/^\uFEFF/, '').trim()
    const content = JSON.parse(cleanedContent)
    
    // ✅ ИСПРАВЛЕНО: добавлено "data:" перед content
    return { data: content, sha: data.sha }
  } catch (error) {
    console.error(`Error fetching ${fileName}:`, error)
    throw error
  }
}

// Запись любого файла в GitHub
const updateGitHubFile = async (fileName, newData, currentSha) => {
  try {
    const jsonString = JSON.stringify(newData, null, 2)
    const content = utf8ToBase64(jsonString)
    
    const body = {
      message: `Update ${fileName}`,
      content,
      branch: GITHUB_BRANCH,
    }
    
    if (currentSha) {
      body.sha = currentSha
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(body),
      }
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

// 🔐 Функции для работы с АДМИНАМИ
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

// 👥 Функции для работы с ПОЛЬЗОВАТЕЛЯМИ
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
    id: Date.now().toString(),
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    role: 'user',
    isBlocked: false,
    blockedAt: null,
    blockedBy: null
  }
  
  const updatedUsers = [...users, newUser]
  await updateGitHubFile(USERS_FILE, updatedUsers, sha)
  
  const { passwordHash: _, ...userWithoutPass } = newUser
  return userWithoutPass
}

export const verifyUser = async (email, password) => {
  try {
    const users = await getUsers()
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    
    if (!user) return null
    
    if (user.isBlocked) {
      throw new Error('Ваш аккаунт заблокирован. Обратитесь к администратору.')
    }
    
    const inputHash = await hashPassword(password)
    if (inputHash !== user.passwordHash) return null
    
    const { passwordHash: _, ...userWithoutPass } = user
    return userWithoutPass
  } catch (error) {
    console.error('Error verifying user:', error)
    throw error
  }
}

export const blockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  
  const updatedUsers = users.map(user =>
    user.id === userId 
      ? { ...user, isBlocked: true, blockedAt: new Date().toISOString(), blockedBy: adminEmail }
      : user
  )
  
  await updateGitHubFile(USERS_FILE, updatedUsers, sha)
}

export const unblockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  
  const updatedUsers = users.map(user =>
    user.id === userId 
      ? { ...user, isBlocked: false, blockedAt: null, blockedBy: null }
      : user
  )
  
  await updateGitHubFile(USERS_FILE, updatedUsers, sha)
}

// 📊 Функции для работы с ЛОГАМИ
export const getLogs = async () => {
  const { data } = await fetchGitHubFile(LOGS_FILE)
  // ✅ Гарантируем возврат массива
  if (!data) return []
  if (!Array.isArray(data)) return []
  return data
}

export const addLog = async (logData) => {
  try {
    // ✅ Получаем И данные, И sha ОДНИМ вызовом!
    const { data: logs, sha } = await fetchGitHubFile(LOGS_FILE)
    
    const newLog = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...logData
    }
    
    // Храним последние 1000 записей
    const updatedLogs = [newLog, ...logs].slice(0, 1000)
    await updateGitHubFile(LOGS_FILE, updatedLogs, sha)
    
    return newLog
  } catch (error) {
    console.error('Error adding log:', error)
    // Не выбрасываем ошибку, чтобы не ломать основное приложение
    return null
  }
}

export const clearLogs = async () => {
  try {
    // ✅ Получаем текущий sha перед очисткой
    const { sha } = await fetchGitHubFile(LOGS_FILE)
    await updateGitHubFile(LOGS_FILE, [], sha)
  } catch (error) {
    console.error('Error clearing logs:', error)
    throw error
  }
}

// 📚 Функции для работы со словарём
export const getDictionary = async () => {
  return await fetchGitHubFile(DATA_FILE)
}

export const updateDictionary = async (newData, currentSha) => {
  return await updateGitHubFile(DATA_FILE, newData, currentSha)
}

export const addWord = async (wordData, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const newWord = {
    ...wordData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    createdBy: userEmail
  }
  
  const updatedDictionary = [...dictionary, newWord]
  await updateDictionary(updatedDictionary, sha)
  
  if (userEmail) {
    await addLog({
      action: 'word_added',
      userEmail,
      details: `Добавлено слово: ${wordData.word}`
    })
  }
  
  return newWord
}

export const updateWord = async (id, updatedData, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.map(word =>
    word.id === id ? { ...word, ...updatedData } : word
  )
  
  await updateDictionary(updatedDictionary, sha)
  
  if (userEmail) {
    await addLog({
      action: 'word_updated',
      userEmail,
      details: `Обновлено слово: ${id}`
    })
  }
}

export const deleteWord = async (id, userEmail) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.filter(word => word.id !== id)
  
  await updateDictionary(updatedDictionary, sha)
  
  if (userEmail) {
    await addLog({
      action: 'word_deleted',
      userEmail,
      details: `Удалено слово: ${id}`
    })
  }
}