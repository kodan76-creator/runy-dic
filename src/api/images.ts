// src/api/images.ts
// Работа с картинками словаря (public/images/)
// Общий словарь — файлы в корне public/images/, личный — в подпапке public/images/{папка пользователя}/.
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
} from './constants'
import {
  getGitHubFileSha,
  getHeaders,
} from './client'
import { emailToFolderName } from './audio'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']

// 🖼️ Загрузка картинки в public/images/ (общий словарь — корень, личный — папка пользователя)
export const uploadImageFile = async (file, userEmail, rootUpload = false) => {
  if (!file || !userEmail) throw new Error('Файл или пользователь не указаны')
  const ext = String((file.name || '').split('.').pop() || '').toLowerCase()
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error('Допускаются только изображения (PNG, JPG, JPEG, WEBP, GIF, SVG)')
  }

  const folder = emailToFolderName(userEmail)
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const filePath = rootUpload ? `public/images/${safeName}` : `public/images/${folder}/${safeName}`

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

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
  const body: Record<string, string> = {
    message: `Upload image: ${safeName}${rootUpload ? '' : ' for ' + folder}`,
    content: base64,
    branch: GITHUB_BRANCH
  }
  if (existingSha) body.sha = existingSha // если файл есть — перезаписываем
  const response = await fetch(url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) })
  if (!response.ok) {
    const err: any = await response.json().catch(() => ({}))
    throw new Error(`Ошибка загрузки: ${err.message || response.statusText}`)
  }

  return { path: safeName, folder: rootUpload ? '' : folder, name: safeName }
}

// 🗑️ Удаление картинки из public/images/
export const deleteImageFile = async (fileName, userEmail, rootUpload = false) => {
  if (!fileName || !userEmail) throw new Error('Имя файла или пользователь не указаны')
  const folder = emailToFolderName(userEmail)
  const filePath = rootUpload ? `public/images/${fileName}` : `public/images/${folder}/${fileName}`

  let retries = 0
  const maxRetries = 5

  while (retries < maxRetries) {
    // Получаем SHA напрямую через API (без декодирования бинарного контента)
    const sha = await getGitHubFileSha(filePath)
    if (!sha) throw new Error('Файл не найден')

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
    const body = { message: `Delete image: ${fileName}${rootUpload ? '' : ' from ' + folder}`, sha, branch: GITHUB_BRANCH }
    const response = await fetch(url, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify(body) })
    if (response.ok) return { deleted: true, name: fileName }

    const err = await response.json().catch(() => ({}))
    const errMsg = err.message || response.statusText
    if (response.status === 409 || errMsg.includes('Conflict')) {
      retries++
      console.warn(`Delete image conflict, retrying ${retries}/${maxRetries}...`)
      await new Promise(res => setTimeout(res, 500 + retries * 300))
    } else {
      throw new Error(`Ошибка удаления: ${errMsg}`)
    }
  }
  throw new Error('Ошибка удаления: конфликт версий, попробуйте позже')
}

// Строит URL картинки (same-origin, public/images/).
export const buildImageUrl = (fileName, userFolder) => {
  if (!fileName) return ''
  if (/^https?:\/\//i.test(fileName)) return fileName
  if (fileName.includes('/')) return `${import.meta.env.BASE_URL}images/${fileName}`
  if (userFolder) return `${import.meta.env.BASE_URL}images/${userFolder}/${fileName}`
  return `${import.meta.env.BASE_URL}images/${fileName}`
}

// Собирает URL всех картинок словаря для прекэша (оффлайн).
// resolveFolder: функция (word) => папка пользователя или ''/null, либо сама папка.
export const collectImageUrls = (words, resolveFolder) => {
  const urls: string[] = []
  for (const w of (Array.isArray(words) ? words : [])) {
    if (!w?.image) continue
    const folder = typeof resolveFolder === 'function' ? resolveFolder(w) : resolveFolder
    const u = buildImageUrl(w.image, folder)
    if (u && u.startsWith(import.meta.env.BASE_URL)) urls.push(u)
  }
  return urls
}
