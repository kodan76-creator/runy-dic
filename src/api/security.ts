// src/api/security.js
// Шифрование/расшифровка файлов, проверка статуса и миграция
import { encrypt, decrypt, isEncrypted } from '../cryptoUtil'
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  DATA_FILE,
  ADMINS_FILE,
  USERS_FILE,
  LOGS_FILE,
  CATEGORIES_FILE,
  FAVORITES_FILE,
  QUEUE_FILE,
} from './constants'
import { fetchGitHubFileRaw, getHeaders, utf8ToBase64 } from './client'
import { getDictionaryFileNameForEmail } from '../dictionaryAccess'

// 🔐 МИГРАЦИЯ: Зашифровать все существующие JSON-файлы
export const migrateAllFiles = async () => {
  const filesToMigrate = [
    DATA_FILE,
    ADMINS_FILE,
    USERS_FILE,
    LOGS_FILE,
    CATEGORIES_FILE,
    FAVORITES_FILE,
    QUEUE_FILE,
    // Персональные словари
    'kodan76.json',
    'ya.kodan76.json',
    'winx0212.json',
    'test.json',
    'test2.json',
    'dictionary.json2'
  ]

  const results: any[] = []
  for (const fileName of filesToMigrate) {
    try {
      console.log(`🔄 Проверяю ${fileName}...`)
      const { data, sha } = await fetchGitHubFileRaw(fileName)
      if (!sha) {
        console.log(`⏭️ ${fileName}: не найден, пропускаю`)
        results.push({ file: fileName, status: 'not_found' })
        continue
      }

      // Проверяем, зашифрован ли уже
      if (isEncrypted(data)) {
        console.log(`✅ ${fileName}: уже зашифрован`)
        results.push({ file: fileName, status: 'already_encrypted' })
        continue
      }

      // Зашифровываем и записываем (data — уже строка, НЕ нужно оборачивать в JSON.stringify)
      const encrypted = await encrypt(data)
      const content = utf8ToBase64(encrypted)
      const body = { message: `🔐 Encrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
        { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
      )
      if (!response.ok) {
        const err: any = await response.json().catch(() => ({}))
        throw new Error(err.message || response.statusText)
      }
      console.log(`🔐 ${fileName}: зашифрован`)
      results.push({ file: fileName, status: 'encrypted' })
    } catch (e) {
      console.error(`❌ ${fileName}: ошибка —`, e.message)
      results.push({ file: fileName, status: 'error', error: e.message })
    }
  }

  console.log('\n📊 Результат миграции:')
  console.table(results)
  return results
}

// 🔐 Расшифровать один файл
export const decryptFile = async (fileName) => {
  try {
    const { data, sha } = await fetchGitHubFileRaw(fileName)
    if (!sha) return { file: fileName, status: 'not_found' }
    if (!isEncrypted(data)) {
      // Проверяем, не имеет ли файл двойное кодирование без шифрования
      if (data && data.startsWith('"')) {
        try {
          const inner = JSON.parse(data)
          if (typeof inner === 'string') {
            // Двойное кодирование без шифрования — восстанавливаем
            const parsed = JSON.parse(inner)
            const formatted = JSON.stringify(parsed, null, 2)
            const content = utf8ToBase64(formatted)
            const body = { message: `🔧 Repair ${fileName} (fix double-encoding)`, content, sha, branch: GITHUB_BRANCH }
            const response = await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
              { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
            )
            if (!response.ok) throw new Error('Failed to repair')
            return { file: fileName, status: 'repaired' }
          }
        } catch { /* не двойное кодирование — пропускаем */ }
      }
      return { file: fileName, status: 'not_encrypted' }
    }

    let decrypted = await decrypt(data)

    // Исправление двойного кодирования: если результат — JSON-строка (начинается с "),
    // распарсить её чтобы получить настоящий JSON
    if (typeof decrypted === 'string' && decrypted.startsWith('"')) {
      try {
        const parsed = JSON.parse(decrypted)
        if (typeof parsed === 'string') {
          decrypted = parsed // был двойной stringify — берём распарсенную строку
        }
      } catch { /* не строка — оставляем как есть */ }
    }

    // Проверяем, что расшифрованные данные — валидный JSON
    const parsed = JSON.parse(decrypted)
    // Форматируем красиво для консистентности
    const formatted = Array.isArray(parsed) ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed, null, 2)

    const content = utf8ToBase64(formatted)
    const body = { message: `🔓 Decrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || response.statusText)
    }
    return { file: fileName, status: 'decrypted' }
  } catch (e) {
    console.error(`DecryptFile ${fileName} error:`, e)
    return { file: fileName, status: 'error', error: e.message }
  }
}

// 🔐 Проверить статус шифрования всех файлов
const KNOWN_FILES = [
  DATA_FILE, ADMINS_FILE, USERS_FILE, LOGS_FILE,
  CATEGORIES_FILE, FAVORITES_FILE, QUEUE_FILE
]

// Получить полный список JSON-файлов из репозитория (Git Trees API).
// Возвращает JSON-файлы в корне репозитория (там лежат все данные), исключая
// служебные package.json / package-lock.json / tsconfig.json, чтобы их случайно не зашифровать.
const listRepoJsonFiles = async () => {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`
  const resp = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
  if (!resp.ok) return null
  const data = await resp.json()
  if (!Array.isArray(data.tree)) return null
  return data.tree
    .filter(item => item.type === 'blob')
    .map(item => item.path)
    .filter(path =>
      /\.json$/i.test(path) &&                            // только JSON
      !/[/]/.test(path) &&                                // только в корне репозитория
      !/^package(-lock)?\.json$/i.test(path) &&           // без package.json / package-lock.json
      !/^tsconfig(\.node)?\.json$/i.test(path)            // без tsconfig.json / tsconfig.node.json
    )
}

// Персональные словари пользователей, найденные в favorites.json (запасной вариант)
const listPersonalFilesFromFavorites = async () => {
  const { data: favData } = await fetchGitHubFileRaw(FAVORITES_FILE)
  if (!favData) return []
  const raw = isEncrypted(favData) ? await decrypt(favData) : favData
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map(r => getDictionaryFileNameForEmail(r.userEmail)).filter(Boolean)
}

export const checkFilesEncryptionStatus = async () => {
  let allFiles = [...KNOWN_FILES]

  // 1. Пытаемся получить ПОЛНЫЙ список JSON-файлов из репозитория
  try {
    const repoFiles = await listRepoJsonFiles()
    if (repoFiles && repoFiles.length > 0) {
      allFiles = [...new Set([...allFiles, ...repoFiles])]
    }
  } catch { /* ignore */ }

  // 2. Если дерево не помогло — добираем персональные словари из favorites
  if (allFiles.length <= KNOWN_FILES.length) {
    try {
      const personalFiles = await listPersonalFilesFromFavorites()
      allFiles = [...new Set([...allFiles, ...personalFiles])]
    } catch { /* ignore */ }
  }

  const results: any[] = []

  for (const fileName of allFiles) {
    try {
      const { data, sha } = await fetchGitHubFileRaw(fileName)
      if (!sha) {
        results.push({ file: fileName, encrypted: null, status: 'not_found', broken: false })
        continue
      }
      const encrypted = isEncrypted(data)
      // Проверяем двойное кодирование: файл не зашифрован, но начинается с "
      let broken = false
      if (!encrypted && data && data.startsWith('"')) {
        try {
          const inner = JSON.parse(data)
          if (typeof inner === 'string') broken = true
        } catch { /* ok */ }
      }
      const status = encrypted ? 'encrypted' : broken ? 'broken' : 'plain'
      results.push({ file: fileName, encrypted, status, broken })
    } catch {
      results.push({ file: fileName, encrypted: null, status: 'error', broken: false })
    }
  }
  return results
}

// 🔐 Расшифровать несколько файлов
export const decryptFiles = async (fileNames) => {
  const results: any[] = []
  for (const fileName of fileNames) {
    const result = await decryptFile(fileName)
    results.push(result)
  }
  return results
}

// 🔐 Зашифровать один файл
export const encryptFile = async (fileName) => {
  try {
    const { data, sha } = await fetchGitHubFileRaw(fileName)
    if (!sha) return { file: fileName, status: 'not_found' }
    if (isEncrypted(data)) return { file: fileName, status: 'already_encrypted' }

    // Если файл сломан (двойное кодирование) — сначала восстанавливаем
    let contentToEncrypt = data
    if (data && data.startsWith('"')) {
      try {
        const inner = JSON.parse(data)
        if (typeof inner === 'string') {
          contentToEncrypt = JSON.stringify(JSON.parse(inner), null, 2)
        }
      } catch { /* не двойное — шифруем как есть */ }
    }

    const encrypted = await encrypt(contentToEncrypt)
    const content = utf8ToBase64(encrypted)
    const body = { message: `🔐 Encrypt ${fileName}`, content, sha, branch: GITHUB_BRANCH }
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
      { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }
    )
    if (!response.ok) {
      const err: any = await response.json().catch(() => ({}))
      throw new Error(err.message || response.statusText)
    }
    return { file: fileName, status: 'encrypted' }
  } catch (e) {
    console.error(`EncryptFile ${fileName} error:`, e)
    return { file: fileName, status: 'error', error: e.message }
  }
}

// 🔐 Зашифровать несколько файлов
export const encryptFiles = async (fileNames) => {
  const results: any[] = []
  for (const fileName of fileNames) {
    const result = await encryptFile(fileName)
    results.push(result)
  }
  return results
}
