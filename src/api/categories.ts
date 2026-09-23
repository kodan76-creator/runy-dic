// src/api/categories.js
// Работа с категориями словаря: основные (categories.json) и личные категории
// пользователя (public/users/<email_folder>/categories.json) — пользователь в
// своей админке добавляет/удаляет только свои, они идут после основных.
import { CATEGORIES_FILE, USERS_DIR } from './constants'
import { fetchGitHubFile, updateGitHubFile } from './client'
import { emailToFolderName } from './audio'

/** Путь к файлу личных категорий пользователя. */
export const getPersonalCategoriesFile = (userEmail) => {
  const folder = emailToFolderName(userEmail)
  if (!folder) throw new Error('Пользователь не указан')
  return `${USERS_DIR}/${folder}/categories.json`
}

/**
 * Категории для показа в словаре.
 * Без email — только основные (админка). С email — основные + личные
 * категории пользователя (помечены __personal: true).
 */
export const getCategories = async (userEmail?: string | null) => {
  const main = await fetchGitHubFile(CATEGORIES_FILE)
  if (!userEmail) return main
  try {
    const personal = await fetchGitHubFile(getPersonalCategoriesFile(userEmail))
    const mainArr = Array.isArray(main.data) ? main.data : []
    const personalArr = (Array.isArray(personal.data) ? personal.data : [])
      .map((c: any) => ({ ...c, __personal: true }))
    return {
      data: [...mainArr, ...personalArr],
      sha: main.sha,
      ok: main.ok !== false && personal.ok !== false,
      exists: main.exists ?? personal.exists ?? null,
    }
  } catch {
    return main
  }
}

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

// ── 🏷 Личные категории пользователя ──────────────────────────────────
// Пользователь в своей админке добавляет/удаляет ТОЛЬКО свои категории:
// изменения пишутся в его файл public/users/<email_folder>/categories.json,
// основной categories.json при этом не читается и не меняется.

/** Добавить личную категорию. Возвращает созданную запись. */
export const addPersonalCategory = async (categoryData, userEmail) => {
  const file = getPersonalCategoriesFile(userEmail)
  const { data: cats, sha } = await fetchGitHubFile(file)
  const newCat = {
    ...categoryData,
    id: `u${Date.now()}`, // префикс u — не конфликтует с id основных категорий
    createdAt: new Date().toISOString(),
    createdBy: userEmail,
    personal: true,
  }
  await updateGitHubFile(file, [newCat, ...(Array.isArray(cats) ? cats : [])], sha)
  return newCat
}

/** Удалить личную категорию. Чужие (основные) id не удаляются. */
export const deletePersonalCategory = async (id, userEmail) => {
  const file = getPersonalCategoriesFile(userEmail)
  const { data: cats, sha } = await fetchGitHubFile(file)
  const list = Array.isArray(cats) ? cats : []
  const next = list.filter(c => c.id !== id)
  if (next.length === list.length) return false // такого id в личном файле нет
  await updateGitHubFile(file, next, sha)
  return true
}
