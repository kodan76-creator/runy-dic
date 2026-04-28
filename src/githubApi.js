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

// ✅ Правильное кодирование UTF-8 в Base64
const utf8ToBase64 = (str) => {
  return btoa(unescape(encodeURIComponent(str)))
}

// ✅ Правильное декодирование Base64 в UTF-8
const base64ToUtf8 = (str) => {
  return decodeURIComponent(escape(atob(str)))
}

// Чтение данных из GitHub
export const getDictionary = async () => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}?ref=${GITHUB_BRANCH}&t=${Date.now()}`,
      { 
        headers: getHeaders(),
        cache: 'no-cache'
      }
    )
    
    if (!response.ok) {
      if (response.status === 404) {
        return { data: [], sha: null }  // ← ИСПРАВЛЕНО: добавлено "data:"
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Декодируем base64 с правильной UTF-8 поддержкой
    const rawContent = base64ToUtf8(data.content)
    
    // Удаляем BOM если есть
    const cleanedContent = rawContent.replace(/^\uFEFF/, '').trim()
    
    // Парсим JSON
    const content = JSON.parse(cleanedContent)
    
    return { data: content, sha: data.sha }
  } catch (error) {
    console.error('Error fetching dictionary:', error)
    throw error
  }
}

// Запись данных в GitHub
export const updateDictionary = async (newData, currentSha) => {
  try {
    // Кодируем JSON в Base64 с правильной UTF-8 поддержкой
    const jsonString = JSON.stringify(newData, null, 2)
    const content = utf8ToBase64(jsonString)
    
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

// Обновление слова
export const updateWord = async (id, updatedData) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.map(word =>
    word.id === id ? { ...word, ...updatedData } : word
  )
  
  await updateDictionary(updatedDictionary, sha)
}

// Удаление слова
export const deleteWord = async (id) => {
  const { data: dictionary, sha } = await getDictionary()
  
  const updatedDictionary = dictionary.filter(word => word.id !== id)
  
  await updateDictionary(updatedDictionary, sha)
}