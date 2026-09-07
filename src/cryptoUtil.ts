// src/cryptoUtil.js
// Модуль шифрования/дешифрования JSON-файлов с помощью AES-GCM

const ENCRYPTION_PREFIX = 'ENC:v1:'
const ALGO = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100_000
// Legacy fixed salt (kept for backward compatibility). New encryptions use a random salt.
export const LEGACY_SALT = 'runy-dic-salt-v1'

let cachedKey: CryptoKey | null = null
let cachedPassphrase: string | null = null
/**
 * Legacy passphrases removed from source for security. If you need to support
 * additional legacy passphrases, supply them via a secure server-side migration
 * process rather than embedding secrets in client code.
 */
const LEGACY_PASSPHRASES: string[] = []

/**
 * Создать AES-ключ из парольной фразы через PBKDF2 (без кэша, для перебора ключей)
 */
/**
 * Derive AES key from passphrase and salt (if provided). If salt is omitted,
 * the legacy fixed salt is used for backward compatibility.
 */
const deriveKey = async (passphrase: string, salt?: Uint8Array<ArrayBuffer>) => {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const saltBytes: BufferSource = salt ?? encoder.encode(LEGACY_SALT)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Получить ключ шифрования:
 * 1. Из VITE_ENCRYPTION_KEY в .env (для разработки)
 * 2. Из GitHub Repository Variables (ENCRYPTION_KEY)
 *    Только владелец репозитория может задать/изменить эту переменную в настройках GitHub.
 */
const getPassphrase = async () => {
  if (cachedPassphrase) return cachedPassphrase

  // Only read the passphrase from build-time environment variable.
  // Do NOT attempt to fetch repository secrets from the client.
  const envKey = import.meta.env.VITE_ENCRYPTION_KEY
  if (envKey) {
    cachedPassphrase = envKey
    return cachedPassphrase
  }

  throw new Error('VITE_ENCRYPTION_KEY не найден. Не пытайтесь получать ENCRYPTION_KEY из клиента.')
}

/**
 * Получить или создать AES-ключ из парольной фразы через PBKDF2
 */
const getKey = async () => {
  if (cachedKey) return cachedKey
  const passphrase = await getPassphrase()
  cachedKey = await deriveKey(passphrase)
  return cachedKey
}

/**
 * Расшифровать, перебирая ключи (основной + устаревшие).
 * @param {string} data - зашифрованные данные
 * @returns {{ plaintext: string, keyUsed: string }}
 */
const decryptWithFallback = async (data: string) => {
  if (typeof data !== 'string' || !data.startsWith(ENCRYPTION_PREFIX)) {
    return { plaintext: data, keyUsed: 'none' }
  }

  const base64 = data.slice(ENCRYPTION_PREFIX.length)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Try new format: salt(16) | iv(12) | ciphertext
  if (bytes.length > 28) {
    const salt = bytes.slice(0, 16)
    const iv = bytes.slice(16, 28)
    const ciphertext = bytes.slice(28)
    const candidates = [await getPassphrase(), ...LEGACY_PASSPHRASES]
    for (const passphrase of candidates) {
      try {
        const key = await deriveKey(passphrase, salt)
        const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext)
        const plaintext = new TextDecoder().decode(decrypted)
        return { plaintext, keyUsed: passphrase }
      } catch {
        // try next
      }
    }
  }

  // Fallback to legacy format: iv(12) | ciphertext (uses LEGACY_SALT)
  if (bytes.length > 12) {
    const iv = bytes.slice(0, 12)
    const ciphertext = bytes.slice(12)
    const candidates = [await getPassphrase(), ...LEGACY_PASSPHRASES]
    for (const passphrase of candidates) {
      try {
        const key = await deriveKey(passphrase) // uses LEGACY_SALT
        const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext)
        const plaintext = new TextDecoder().decode(decrypted)
        return { plaintext, keyUsed: passphrase }
      } catch {
        // try next
      }
    }
  }

  throw new Error('Ошибка расшифровки: ни один из известных ключей не подошёл')
}

/**
 * Зашифровать строку
 * @param {string} plaintext - исходный текст
 * @returns {string} зашифрованная строка с префиксом ENC:v1:
 */
export const encrypt = async (plaintext) => {
  const passphrase = await getPassphrase()
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16)) // 128-bit salt
  const key = await deriveKey(passphrase, salt)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV для AES-GCM

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoder.encode(plaintext)
  )

  // Объединяем salt + IV + ciphertext
  const encryptedBytes = new Uint8Array(encrypted)
  const combined = new Uint8Array(salt.length + iv.length + encryptedBytes.length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(encryptedBytes, salt.length + iv.length)

  // Конвертируем в base64
  let binary = ''
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i])
  }
  return ENCRYPTION_PREFIX + btoa(binary)
}

/**
 * Расшифровать строку (автоматически перебирает основной и устаревшие ключи)
 * @param {string} data - данные (возможно зашифрованные)
 * @returns {string} расшифрованный текст или исходные данные, если не зашифрованы
 */
export const decrypt = async (data) => {
  if (typeof data !== 'string') return data
  if (!data.startsWith(ENCRYPTION_PREFIX)) return data

  const { plaintext } = await decryptWithFallback(data)
  return plaintext
}

/**
 * Проверить, зашифрованы ли данные
 */
export const isEncrypted = (data) => {
  return typeof data === 'string' && data.startsWith(ENCRYPTION_PREFIX)
}

/**
 * Зашифровать JSON-массив/объект → строка для хранения
 */
export const encryptJSON = async (jsonArray) => {
  const jsonStr = JSON.stringify(jsonArray, null, 2)
  return encrypt(jsonStr)
}

/**
 * Расшифровать строку → JSON-массив/объект
 */
export const decryptJSON = async (data) => {
  const decrypted = await decrypt(data)
  try {
    const parsed = JSON.parse(decrypted)
    return Array.isArray(parsed) ? parsed : parsed
  } catch {
    return decrypted
  }
}
