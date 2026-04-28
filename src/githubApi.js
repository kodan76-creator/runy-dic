// src/githubApi.js

const GITHUB_OWNER = 'kodan76-creator'
const GITHUB_REPO = 'runy-dic'
const GITHUB_BRANCH = 'main'
const DATA_FILE = 'dictionary.json'

// Получение токена из env
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN

// Заголовки для API
const getHeaders = () => ({
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

// Чтение данных из GitHub
export const getDictionary = async () => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}?ref=${GITHUB_BRANCH}`,
      { headers: getHeaders() }
    )
    
    if (!response.ok) {
      if (response.status === 404) {
        // Файл не существует - возвращаем пустой массив
        return { data: [], sha: null }  // ← ИСПРАВЛЕНО: было {  [], sha: null }
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    const content = JSON.parse(atob(data.content))  // Декодируем base64
    
    return { data: content, sha: data.sha }
  } catch (error) {
    console.error('Error fetching dictionary:', error)
    throw error
  }
}

// Запись данных в GitHub
export const updateDictionary = async (newData, currentSha) => {
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newData, null, 2))))
    
    const body = {
      message: 'Update dictionary via admin panel',
      content,
      branch: GITHUB_BRANCH,
    }
    
    if (currentSha) {
      body.sha = currentSha
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
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
    console.error('Error updating dictionary:', error)
    throw error
  }
}

// Добавление слова
export const addWord = async (wordData) => {
  const {  dictionary, sha } = await getDictionary()
  
  const newWord = {
    ...wordData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  }
  
  const updatedDictionary = [...dictionary, newWord]
  await updateDictionary(updatedDictionary, sha)
  
  return newWord
}

// Обновление слова
export const updateWord = async (id, updatedData) => {
  const {  dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.map(word =>
    word.id === id ? { ...word, ...updatedData } : word
  )
  
  await updateDictionary(updatedDictionary, sha)
}

// Удаление слова
export const deleteWord = async (id) => {
  const {  dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.filter(word => word.id !== id)
  
  await updateDictionary(updatedDictionary, sha)
}