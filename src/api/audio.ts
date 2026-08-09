// src/api/audio.js
// Работа с аудиофайлами пользователей (public/audio/)
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
} from './constants'
import {
  fetchGitHubFile,
  updateGitHubFile,
  getGitHubFileSha,
  getHeaders,
} from './client'

// 📁 Создание папки пользователя в public/audio/
export const emailToFolderName = (email) => {
  return String(email || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')
}

export const ensureUserAudioFolder = async (userEmail) => {
  if (!userEmail) return
  const folder = emailToFolderName(userEmail)
  const filePath = `public/audio/${folder}/.gitkeep`
  try {
    const { sha } = await fetchGitHubFile(filePath)
    if (sha) return { created: false, folder } // уже существует
    // Файл не найден — создаём
    await updateGitHubFile(filePath, [], null)
    return { created: true, folder }
  } catch (e) {
    console.error('ensureUserAudioFolder error:', e)
    return { created: false, folder, error: e.message }
  }
}

// 🎵 Загрузка MP3-файла в папку пользователя
export const uploadAudioFile = async (file, userEmail, rootUpload = false) => {
  if (!file || !userEmail) throw new Error('Файл или пользователь не указаны')
  if (!file.name.toLowerCase().endsWith('.mp3')) throw new Error('Допускаются только MP3-файлы')

  const folder = emailToFolderName(userEmail)
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const filePath = rootUpload ? `public/audio/${safeName}` : `public/audio/${folder}/${safeName}`

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

  // Загружаем через GitHub API (напрямую, минуя updateGitHubFile, т.к. content уже base64)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
  const body: Record<string, string> = {
    message: `Upload audio: ${safeName}${rootUpload ? '' : ' for ' + folder}`,
    content: base64,
    branch: GITHUB_BRANCH
  }
  if (existingSha) body.sha = existingSha  // если файл есть — перезаписываем
  const response = await fetch(url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) })
  if (!response.ok) {
    const err: any = await response.json().catch(() => ({}))
    throw new Error(`Ошибка загрузки: ${err.message || response.statusText}`)
  }

  return { path: safeName, folder: rootUpload ? '' : folder, name: safeName }
}

// 🎵 Оффлайн-аудио: построение URL и прогрев кэша Service Worker.

// Строит URL аудиофайла (same-origin, public/audio/).
export const buildAudioUrl = (fileName, userFolder) => {
  if (!fileName) return ''
  if (/^https?:\/\//i.test(fileName)) return fileName
  if (fileName.includes('/')) return `${import.meta.env.BASE_URL}audio/${fileName}`
  if (userFolder) return `${import.meta.env.BASE_URL}audio/${userFolder}/${fileName}`
  return `${import.meta.env.BASE_URL}audio/${fileName}`
}

// Собирает URL всех аудиофайлов словаря (audio + audio2) для прекэша.
// resolveFolder: функция (word) => папка пользователя или ''/null, либо сама папка.
export const collectAudioUrls = (words, resolveFolder) => {
  const urls: string[] = []
  for (const w of (Array.isArray(words) ? words : [])) {
    const folder = typeof resolveFolder === 'function' ? resolveFolder(w) : resolveFolder
    for (const f of [w?.audio, w?.audio2]) {
      if (!f) continue
      const u = buildAudioUrl(f, folder)
      if (u && u.startsWith(import.meta.env.BASE_URL)) urls.push(u)
    }
  }
  return urls
}

// Отправляет список URL в Service Worker для прогрева кэша (оффлайн-воспроизведение).
export const precacheUrls = (urls) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const controller = navigator.serviceWorker?.controller
  if (!controller) return
  const sameOrigin = (Array.isArray(urls) ? urls : []).filter((u) => {
    try { return new URL(u).origin === location.origin } catch { return false }
  })
  if (sameOrigin.length) {
    controller.postMessage({ type: 'PRECACHE_URLS', urls: sameOrigin })
  }
}

// 🗑️ Удаление аудиофайла из папки пользователя
export const deleteAudioFile = async (fileName, userEmail, rootUpload = false) => {
  if (!fileName || !userEmail) throw new Error('Имя файла или пользователь не указаны')
  const folder = emailToFolderName(userEmail)
  const filePath = rootUpload ? `public/audio/${fileName}` : `public/audio/${folder}/${fileName}`

  let retries = 0
  const maxRetries = 5

  while (retries < maxRetries) {
    // Получаем SHA напрямую через API (без декодирования бинарного контента)
    const sha = await getGitHubFileSha(filePath)
    if (!sha) throw new Error('Файл не найден')

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`
    const body = { message: `Delete audio: ${fileName}${rootUpload ? '' : ' from ' + folder}`, sha, branch: GITHUB_BRANCH }
    const response = await fetch(url, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify(body) })
    if (response.ok) return { deleted: true, name: fileName }

    const err = await response.json().catch(() => ({}))
    const errMsg = err.message || response.statusText
    if (response.status === 409 || errMsg.includes('Conflict')) {
      retries++
      console.warn(`Delete audio conflict, retrying ${retries}/${maxRetries}...`)
      await new Promise(res => setTimeout(res, 500 + retries * 300))
    } else {
      throw new Error(`Ошибка удаления: ${errMsg}`)
    }
  }
  throw new Error('Ошибка удаления: конфликт версий, попробуйте позже')
}
