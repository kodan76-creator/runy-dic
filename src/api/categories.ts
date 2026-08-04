// src/api/categories.js
// Работа с категориями словаря (categories.json)
import { CATEGORIES_FILE } from './constants'
import { fetchGitHubFile, updateGitHubFile } from './client'

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
