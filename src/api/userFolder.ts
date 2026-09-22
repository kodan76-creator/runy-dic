// src/api/userFolder.ts
// Управление файлами пользователя на GitHub при удалении учётной записи.
// При удалении пользователя его папка public/users/<email_folder>/ (личный
// словарь, категории, избранное) и файлы в public/audio/<email_folder>/
// и public/images/<email_folder>/ переносятся в корзину
// public/users/_deleted/<email_folder>/, а локальные кэши чистятся.
import {
  USERS_DIR,
  DELETED_USERS_DIR,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
} from './constants'
import { getHeaders, githubFetch, isBrowserOffline } from './client'
import { emailToFolderName } from './audio'
import { removeCachedUser } from './offline'

const API_ROOT = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`

interface DirEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  sha: string
}

/** Список содержимого папки на GitHub (или null, если папки нет). */
const listDir = async (path: string): Promise<DirEntry[] | null> => {
  if (isBrowserOffline()) return null
  try {
    const resp = await githubFetch(`${API_ROOT}/${path}?ref=${GITHUB_BRANCH}`, { headers: getHeaders() })
    if (!resp.ok) return null
    const items = await resp.json()
    return Array.isArray(items) ? items : null
  } catch {
    return null
  }
}

/** Прочитать файл как есть (base64 из GitHub, без расшифровки) + его sha. */
const readFileRaw = async (path: string): Promise<{ content: string; sha: string } | null> => {
  try {
    const resp = await githubFetch(`${API_ROOT}/${path}?ref=${GITHUB_BRANCH}`, { headers: getHeaders() })
    if (!resp.ok) return null
    const json = await resp.json()
    if (!json?.content || !json?.sha) return null
    return { content: json.content, sha: json.sha }
  } catch {
    return null
  }
}

/** Создать файл с готовым base64-содержимым; если файл уже есть в корзине —
 *  дописываем поверх (получив sha существующего). */
const putFileBase64 = async (path: string, base64Content: string): Promise<boolean> => {
  const put = (sha?: string) =>
    githubFetch(API_ROOT + '/' + path, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        message: `Move to trash: ${path}`,
        content: base64Content,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })
  try {
    if ((await put()).ok) return true
    // Коллизия: в корзине уже лежит файл с таким именем → перезаписываем по sha
    const dest = await readFileRaw(path)
    if (dest?.sha && (await put(dest.sha)).ok) return true
    return false
  } catch {
    return false
  }
}

/** Удалить файл по sha. */
const deleteFile = async (path: string, sha: string): Promise<boolean> => {
  try {
    const resp = await githubFetch(API_ROOT + '/' + path, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({
        message: `Move to trash: ${path}`,
        sha,
        branch: GITHUB_BRANCH,
      }),
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Рекурсивно переносит папку в корзину: каждый файл копируется в
 * `_deleted/...`, затем оригинал удаляется. Возвращает число перенесённых
 * файлов и список ошибок (не прерываемся на первом сбое).
 */
const moveFolderToTrash = async (
  srcDir: string,
  dstDir: string
): Promise<{ moved: number; errors: string[] }> => {
  const result = { moved: 0, errors: [] as string[] }
  const entries = await listDir(srcDir)
  if (!entries) return result // папки нет — нечего архивировать

  for (const entry of entries) {
    if (entry.type === 'dir') {
      const sub = await moveFolderToTrash(`${srcDir}/${entry.name}`, `${dstDir}/${entry.name}`)
      result.moved += sub.moved
      result.errors.push(...sub.errors)
      continue
    }
    // .gitkeep — служебный пустой файл: в корзину не носим, просто удаляем
    if (entry.name === '.gitkeep') {
      await deleteFile(entry.path, entry.sha)
      continue
    }
    const file = await readFileRaw(entry.path)
    if (!file) {
      result.errors.push(`не удалось прочитать ${entry.path}`)
      continue
    }
    if (!(await putFileBase64(`${dstDir}/${entry.name}`, file.content))) {
      result.errors.push(`не удалось записать ${dstDir}/${entry.name}`)
      continue
    }
    if (!(await deleteFile(entry.path, file.sha))) {
      result.errors.push(`не удалось удалить ${entry.path}`)
      continue
    }
    result.moved++
  }
  return result
}

/** Полная очистка локальных следов пользователя (localStorage + IndexedDB). */
export const clearLocalUserData = async (email: string): Promise<void> => {
  const key = String(email || '').toLowerCase()
  try { removeCachedUser(key) } catch { /* уже чисто */ }
  for (const k of [
    `offline_dict:${key}`,
    'offline_favorites',
    'offline_favorites_queue',
    `rune_spread:${key}`,
    `rune_layout_white_bg:${key}`,
  ]) {
    try { localStorage.removeItem(k) } catch { /* уже чисто */ }
  }
  try {
    const mod = await import('./photoCache')
    await mod.removeCachedPhotoBlob(key)
  } catch { /* IndexedDB может быть недоступна */ }
}

/**
 * Вызывается после удаления пользователя из users.json: переносит его папки
 * на GitHub в корзину (public/users/_deleted/<email_folder>/) и чистит
 * локальные кэши. Не бросает исключений — ошибки собираются в результат.
 */
export const archiveUserFolders = async (
  email: string
): Promise<{ moved: number; errors: string[] }> => {
  const folder = emailToFolderName(email)
  const result = { moved: 0, errors: [] as string[] }

  // 1. Личные файлы: public/users/<folder> → public/users/_deleted/<folder>
  const usersPart = await moveFolderToTrash(
    `${USERS_DIR}/${folder}`,
    `${DELETED_USERS_DIR}/${folder}`
  )
  result.moved += usersPart.moved
  result.errors.push(...usersPart.errors)

  // 2. Аудио пользователя: public/audio/<folder> → _deleted/<folder>/audio
  const audioPart = await moveFolderToTrash(
    `public/audio/${folder}`,
    `${DELETED_USERS_DIR}/${folder}/audio`
  )
  result.moved += audioPart.moved
  result.errors.push(...audioPart.errors)

  // 3. Картинки пользователя: public/images/<folder> → _deleted/<folder>/images
  const imagesPart = await moveFolderToTrash(
    `public/images/${folder}`,
    `${DELETED_USERS_DIR}/${folder}/images`
  )
  result.moved += imagesPart.moved
  result.errors.push(...imagesPart.errors)

  // 4. Локальные следы (localStorage + IndexedDB)
  await clearLocalUserData(email)

  return result
}

