// src/api/images.ts
// Работа с картинками словаря (public/images/)
// Общий словарь — файлы в корне public/images/, личный — в подпапке public/images/{папка пользователя}/.
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  RUNES_IMAGE_DIR,
} from './constants'
import {
  getGitHubFileSha,
  getHeaders,
  githubFetch,
  isBrowserOffline,
  warnFetchFailure,
} from './client'
import { emailToFolderName } from './audio'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']

// � Читает реальные размеры изображения (в пикселях) до загрузки.
const readImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать изображение'))
    }
    img.src = url
  })
}

// 🖼️ Загрузка картинки в public/images/ (общий словарь — корень, личный — папка пользователя)
// options (необязательно): { allowedExtensions, maxSize, minWidth, minHeight, maxWidth, maxHeight }
// 📏 Проверка файла изображения (расширение, объём, размеры) без загрузки на сервер.
// 📏 Необязательные опции проверки изображения (расширения, объём, размеры).
export type ImageValidationOptions = {
  allowedExtensions?: string[]
  maxSize?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type ImageUploadOptions = ImageValidationOptions & {
  /**
   * ⚠️ Deprecated: игнорируется, оставлено для совместимости вызовов.
   * Имена файлов больше не меняются — замена картинки идёт перезаписью
   * под тем же именем (без суффиксов).
   */
  uniqueName?: boolean
}

export const validateImageFile = async (file: File, options: ImageValidationOptions = {}) => {
  if (!file) throw new Error('Файл не указан')
  const ext = String((file.name || '').split('.').pop() || '').toLowerCase()
  const allowed = options.allowedExtensions || IMAGE_EXTENSIONS
  if (!allowed.includes(ext)) {
    throw new Error(`Допускаются только изображения (${allowed.join(', ').toUpperCase()})`)
  }

  // 📏 Проверки объёма и размеров (используются для фото во весь рост)
  const maxSize = options.maxSize || 0
  if (maxSize && file.size > maxSize) {
    throw new Error(`Файл слишком большой. Максимальный размер — ${Math.round(maxSize / 1024 / 1024)} МБ.`)
  }
  if (options.minWidth || options.minHeight || options.maxWidth || options.maxHeight) {
    const { width, height } = await readImageDimensions(file)
    if (options.minWidth && width < options.minWidth) {
      throw new Error(`Фото слишком узкое. Минимальная ширина — ${options.minWidth} px.`)
    }
    if (options.minHeight && height < options.minHeight) {
      throw new Error(`Фото слишком низкое. Минимальная высота — ${options.minHeight} px.`)
    }
    if (options.maxWidth && width > options.maxWidth) {
      throw new Error(`Фото слишком широкое. Максимальная ширина — ${options.maxWidth} px.`)
    }
    if (options.maxHeight && height > options.maxHeight) {
      throw new Error(`Фото слишком высокое. Максимальная высота — ${options.maxHeight} px.`)
    }
  }
}

export const uploadImageFile = async (file: File, userEmail: string, rootUpload = false, options: ImageUploadOptions = {}, subFolder = '') => {
  if (!file || !userEmail) throw new Error('Файл или пользователь не указаны')
  await validateImageFile(file, options)

  const folder = emailToFolderName(userEmail)

  // Читаем файл для base64-кодирования перед отправкой в GitHub Contents API
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  const buildPath = (name: string) =>
    rootUpload ? `public/images/${subFolder ? subFolder + '/' : ''}${name}` : `public/images/${folder}/${name}`

  // Имя файла не меняем: замена картинки идёт перезаписью под тем же именем.
  // (опция options.uniqueName игнорируется — оставлена для совместимости)
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')

  const filePath = buildPath(safeName)

  // Получаем SHA, если файл уже существует (для перезаписи)
  const existingSha = await getGitHubFileSha(filePath)

  // Кодируем прочитанные байты как base64
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

  return { path: safeName, folder: rootUpload ? (subFolder || '') : folder, name: safeName }
}

// 🗑️ Удаление картинки из public/images/
export const deleteImageFile = async (fileName, userEmail, rootUpload = false, subFolder = '') => {
  if (!fileName || !userEmail) throw new Error('Имя файла или пользователь не указаны')
  const folder = emailToFolderName(userEmail)
  const filePath = rootUpload ? `public/images/${subFolder ? subFolder + '/' : ''}${fileName}` : `public/images/${folder}/${fileName}`

  let retries = 0
  const maxRetries = 5

  while (retries < maxRetries) {
    // Получаем SHA напрямую через API (без декодирования бинарного контента)
    const sha = await getGitHubFileSha(filePath)
    // Файла уже нет на сервере — считаем удаление успешным (идемпотентно)
    if (!sha) return { deleted: false, name: fileName }

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
    } else if (response.status === 404) {
      // Файл удалён между получением SHA и DELETE — тоже считаем успехом
      return { deleted: false, name: fileName }
    } else {
      throw new Error(`Ошибка удаления: ${errMsg}`)
    }
  }
  throw new Error('Ошибка удаления: конфликт версий, попробуйте позже')
}

// 📂 Список файлов в папке пользователя (public/images/{folder}/)
export const listUserImages = async (userEmail) => {
  if (!userEmail) return []
  const folder = emailToFolderName(userEmail)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/images/${folder}?ref=${GITHUB_BRANCH}`
  const response = await fetch(url, { headers: getHeaders() })
  if (!response.ok) {
    if (response.status === 404) return []
    throw new Error(`Ошибка чтения папки: ${response.statusText}`)
  }
  const data = await response.json()
  if (!Array.isArray(data)) return []
  return data.filter(item => item.type === 'file').map(item => item.name)
}

// 🧹 Оставляет на сервере только 1 фото пользователя: удаляет все файлы
// в папке пользователя, кроме keepFileName. Ошибки не блокируют поток.
export const cleanupUserPhotos = async (userEmail, keepFileName) => {
  if (!userEmail || !keepFileName) return 0
  try {
    const files = await listUserImages(userEmail)
    const imageExt = /\.(png|jpe?g|webp|gif)$/i
    const toDelete = files.filter(f => f !== keepFileName && imageExt.test(f))
    let deleted = 0
    for (const f of toDelete) {
      try {
        await deleteImageFile(f, userEmail, false)
        deleted++
      } catch (e) {
        console.warn(`Не удалось удалить ${f}:`, e)
      }
    }
    return deleted
  } catch (e) {
    console.warn('cleanupUserPhotos error:', e)
    return 0
  }
}

// 🎲 Раскладка Новых Рун: список файлов в папке public/images/n_runy/runy/
// (файлы вида «N_НАЗВАНИЕ.png» / «N_НАЗВАНИЕ_П.png» — порядковый номер до «_»).
export const listRuneLayoutImages = async () => {
  // Без сети сразу отдаём пустой список: компонент возьмёт локальный кэш
  if (isBrowserOffline()) return []
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/images/${RUNES_IMAGE_DIR}/runy?ref=${GITHUB_BRANCH}`
  try {
    const response = await githubFetch(url, { headers: getHeaders() })
    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`Ошибка чтения папки: ${response.statusText}`)
    }
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.filter(item => item.type === 'file').map(item => item.name)
  } catch (e) {
    warnFetchFailure('runy', e, 'List')
    return []
  }
}

// 🎲 Выбор N случайных рун для раскладки.
// Правило: нельзя выбирать одновременно «N_НАЗВАНИЕ» и «N_НАЗВАНИЕ_П» —
// группируем по имени (без порядкового номера и суффикса «_П») и берём
// по одной из группы. Пример: «1_ФАИС-СУ» и «2_ФАИС-СУ_П» — одна группа.
export const selectRandomRunes = (files: string[], count = 7): string[] => {
  const groups = new Map<string, string[]>()
  for (const f of files) {
    const base = f
      .replace(/\.\w+$/, '')   // убираем расширение
      .replace(/^\d+_/, '')    // убираем порядковый номер до «_»
      .replace(/_П$/, '')      // убираем суффикс «_П»
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(f)
  }
  const names = [...groups.keys()]
  // Перемешиваем группы (Fisher–Yates)
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  return names.slice(0, count).map(g => {
    const arr = groups.get(g)!
    return arr[Math.floor(Math.random() * arr.length)]
  })
}

// Строит URL картинки (same-origin, public/images/).
export const buildImageUrl = (fileName, userFolder) => {
  if (!fileName) return ''
  if (/^https?:\/\//i.test(fileName)) return fileName
  if (fileName.includes('/')) return `${import.meta.env.BASE_URL}images/${fileName}`
  if (userFolder) return `${import.meta.env.BASE_URL}images/${userFolder}/${fileName}`
  return `${import.meta.env.BASE_URL}images/${fileName}`
}

// 🖼️ URL картинки «Отображения Силы Руны» — raw-first.
// Файл уже в репозитории сразу после коммита (raw отдаёт его мгновенно), а
// собранный сайт на GitHub Pages обновляется с задержкой. raw при этом —
// cross-origin, поэтому Service Worker его не перехватывает, CDN-кэш на
// raw.githubusercontent для свежих коммитов короткий, а локальный URL остаётся
// резервом (оффлайн + случай недоступности raw).
// `rune.imageUpdatedAt` (метка перезаливки) подставляется как `?v=…`: без неё
// при замене картинки под тем же именем браузер/CDN/SW отдали бы старую копию
// с кодом 200 — ошибки нет, и raw-фолбэк бы не сработал.
export const buildRuneImageUrls = (rune) => {
  const fileName = typeof rune === 'string' ? rune : rune?.image || ''
  const version = typeof rune === 'object' && rune && Number.isFinite(Number(rune.imageUpdatedAt))
    ? Number(rune.imageUpdatedAt)
    : 0
  if (!fileName) return { primary: '', fallback: '' }
  if (/^https?:\/\//i.test(fileName)) return { primary: fileName, fallback: '' }
  const local = buildImageUrl(fileName, RUNES_IMAGE_DIR)
  const raw = buildRawImageUrl(fileName, RUNES_IMAGE_DIR)
  const withVersion = (url) => (version > 0 && url && !url.includes('?') ? `${url}?v=${version}` : url)
  return { primary: withVersion(raw) || raw, fallback: withVersion(local) || local }
}

// 🖼️ Резервный URL картинки на raw.githubusercontent — для файлов, которые уже
// есть в репозитории (только что загружены в админке), но ещё не попали в
// собранный сайт: GitHub Pages деплоится с задержкой, и до этого обычный URL
// отдаёт 404 (в карточке вместо иконки вылезал alt-текст). Тот же приём, что
// для аудио (getRawAudioSrc в useAudioPlayback).
export const buildRawImageUrl = (fileName, userFolder = '') => {
  if (!fileName) return ''
  if (/^https?:\/\//i.test(fileName)) return fileName
  const base = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/public/images/`
  if (fileName.includes('/')) return `${base}${fileName}`
  if (userFolder) return `${base}${userFolder}/${fileName}`
  return `${base}${fileName}`
}

// 🧿 Удаляет картинку из кэша Service Worker.
// SW отдаёт статику stale-while-revalidate: при замене файла тем же именем
// (перезаливка картинки руны) браузер показал бы старую версию до фонового
// обновления. Админка шлёт INVALIDATE_URL сразу после загрузки/удаления,
// чтобы новая картинка появилась без перезагрузки страницы.
export const invalidateImageCache = (url) => {
  if (!url || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  const controller = navigator.serviceWorker?.controller
  if (!controller) return false
  try {
    if (new URL(url, location.href).origin !== location.origin) return false
  } catch {
    return false
  }
  controller.postMessage({ type: 'INVALIDATE_URL', url })
  return true
}

// Собирает URL всех картинок словаря для прекэша (оффлайн).
// resolveFolder: функция (word) => папка пользователя или ''/null, либо сама папка.
// Руны (resolveFolder === RUNES_IMAGE_DIR): к локальному URL добавляем ?v=версия
// (rune.imageUpdatedAt) — после замены картинки под тем же именем SW прогреет
// именно новый URL, а не отдаст старую копию из кэша.
export const collectImageUrls = (words, resolveFolder) => {
  const urls: string[] = []
  for (const w of (Array.isArray(words) ? words : [])) {
    if (!w?.image) continue
    // 🧿 Руны: локальный URL с ?v=версия. Raw-first в карточке даёт свежесть
    // сразу после коммита, а сюда raw не добавляем: precacheUrls и SW принимают
    // только same-origin URL (cross-origin raw всё равно отфильтруется).
    if (resolveFolder === RUNES_IMAGE_DIR || (typeof resolveFolder === 'function' && resolveFolder(w) === RUNES_IMAGE_DIR)) {
      const { fallback } = buildRuneImageUrls(w)
      if (fallback && fallback.startsWith(import.meta.env.BASE_URL)) urls.push(fallback)
      continue
    }
    const folder = typeof resolveFolder === 'function' ? resolveFolder(w) : resolveFolder
    const u = buildImageUrl(w.image, folder)
    if (u && u.startsWith(import.meta.env.BASE_URL)) urls.push(u)
  }
  return urls
}

//  Собирает URL картинок раскладки рун (public/images/<RUNES_IMAGE_DIR>/runy/).
// Используется для прогрева кэша Service Worker: картинки креста должны быть
// доступны и онлайн, и офлайн.
export const collectRuneLayoutImageUrls = (names: string[]): string[] => {
  const urls: string[] = []
  for (const name of (Array.isArray(names) ? names : [])) {
    if (!name) continue
    const u = buildImageUrl(name, `${RUNES_IMAGE_DIR}/runy`)
    if (u && u.startsWith(import.meta.env.BASE_URL)) urls.push(u)
  }
  return urls
}
