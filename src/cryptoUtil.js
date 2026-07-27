// src/cryptoUtil.js
// Модуль шифрования/дешифрования JSON-файлов с помощью AES-GCM

const ENCRYPTION_PREFIX = 'ENC:v1:'
const ALGO = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100_000
const SALT = 'runy-dic-salt-v1' // Фиксированный соль для единообразия

let cachedKey = null

// Статический ключ шифрования (одинаков на всех компьютерах)
const STATIC_ENCRYPTION_KEY = 'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;:\'",./<>?'

/**
 * Получить ключ шифрования: сначала из VITE_ENCRYPTION_KEY,
 * затем статический (для доменных УЗ где .env может не подхватиться)
 */
const getPassphrase = () => {
  const key = import.meta.env.VITE_ENCRYPTION_KEY
  if (key) return key
  return STATIC_ENCRYPTION_KEY
}

/**
 * Получить или создать AES-ключ из парольной фразы через PBKDF2
 */
const getKey = async () => {
  if (cachedKey) return cachedKey

  const passphrase = getPassphrase()
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )

  return cachedKey
}

/**
 * Зашифровать строку
 * @param {string} plaintext - исходный текст
 * @returns {string} зашифрованная строка с префиксом ENC:v1:
 */
export const encrypt = async (plaintext) => {
  const key = await getKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV для AES-GCM

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoder.encode(plaintext)
  )

  // Объединяем IV + ciphertext в один буфер
  const encryptedBytes = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + encryptedBytes.length)
  combined.set(iv, 0)
  combined.set(encryptedBytes, iv.length)

  // Конвертируем в base64
  let binary = ''
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i])
  }
  return ENCRYPTION_PREFIX + btoa(binary)
}

/**
 * Расшифровать строку
 * @param {string} data - данные (возможно зашифрованные)
 * @returns {string} расшифрованный текст или исходные данные, если не зашифрованы
 */
export const decrypt = async (data) => {
  if (typeof data !== 'string') return data
  if (!data.startsWith(ENCRYPTION_PREFIX)) return data

  const key = await getKey()
  const base64 = data.slice(ENCRYPTION_PREFIX.length)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Извлекаем IV (первые 12 байт) и ciphertext
  const iv = bytes.slice(0, 12)
  const ciphertext = bytes.slice(12)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
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
