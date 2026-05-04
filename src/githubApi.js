// src/githubApi.js

const GITHUB_OWNER = 'kodan76-creator'
const GITHUB_REPO = 'runy-dic'
const GITHUB_BRANCH = 'main'
const DATA_FILE = 'dictionary.json'
const LOGS_FILE = 'logs.json'

// Получение токена из env
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN

// Заголовки для API
const getHeaders = () => ({
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

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
        return { data: [], sha: null }  // ✅ Возвращаем пустой массив
      }
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

// 📚 Функции для работы со словарём
export const getDictionary = async () => {
  return await fetchGitHubFile(DATA_FILE)
}

export const updateDictionary = async (newData, currentSha) => {
  return await updateGitHubFile(DATA_FILE, newData, currentSha)
}

export const addWord = async (wordData) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const newWord = {
    ...wordData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  }
  
  const updatedDictionary = [...dictionary, newWord]
  await updateDictionary(updatedDictionary, sha)
  
  return newWord
}

export const updateWord = async (id, updatedData) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.map(word =>
    word.id === id ? { ...word, ...updatedData } : word
  )
  
  await updateDictionary(updatedDictionary, sha)
}

export const deleteWord = async (id) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.filter(word => word.id !== id)
  
  await updateDictionary(updatedDictionary, sha)
}

// 📊 Функции для работы с ЛОГАМИ
export const getLogs = async () => {
  const { data } = await fetchGitHubFile(LOGS_FILE)
  return data || []  // ✅ Гарантируем возврат массива
}

export const addLog = async (logData) => {
  const { data: logs, sha } = await getLogs()  // ✅ Получаем logs как массив
  
  const newLog = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...logData
  }
  
  // Храним последние 1000 записей
  const updatedLogs = [newLog, ...logs].slice(0, 1000)
  await updateGitHubFile(LOGS_FILE, updatedLogs, sha)
  
  return newLog
}

export const clearLogs = async () => {
  await updateGitHubFile(LOGS_FILE, [], null)
}