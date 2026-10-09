// src/api/offlineContent.ts
// Гарантированное локальное хранилище оффлайн-контента (IndexedDB).
//
// Идея: один раз в фоне скачать все картинки рун (карточки n_runy + крест
// n_runy/runy) и аудио личного словаря, сложить их как Blob в IndexedDB.
// Тогда оффлайн они отдаются из локального хранилища — независимо от того,
// чистился ли HTTP-кэш Service Worker и открывал ли пользователь конкретную
// руну. Это надёжнее, чем precacheUrls в SW: SW может быть вытеснен
// браузером, а IndexedDB-запись живёт, пока пользователь сам её не удалит.

const DB_NAME = 'runy-offline-content'
const DB_VERSION = 1
const STORE = 'blobs'
const META_STORE = 'meta'

// Ключ метаданных: когда и что скачивали (чтобы не качать повторно).
const META_KEY = 'offline_content_meta'

// ── IndexedDB helpers ────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const idbPut = async (store: string, value: any, key: string): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const idbGet = async (store: string, key: string): Promise<any> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

const idbHas = async (store: string, key: string): Promise<boolean> => {
  const value = await idbGet(store, key)
  return value != null
}

// ── Публичный API: чтение blob по URL ────────────────────────────────

/** Получить локальный blob оффлайн-контента по URL (или null). */
export const getOfflineBlob = async (url: string): Promise<Blob | null> => {
  if (!url) return null
  try {
    return await idbGet(STORE, url)
  } catch {
    return null
  }
}

/** Есть ли уже сохранённый blob для URL. */
export const hasOfflineBlob = async (url: string): Promise<boolean> => {
  try {
    return await idbHas(STORE, url)
  } catch {
    return false
  }
}

// ── Публичный API: фоновая загрузка ──────────────────────────────────

export interface OfflineContentMeta {
  images: number
  audio: number
  savedAt: number
  /** Версия набора: при её смене контент докачивается заново. */
  version: string
}

/** Прочитать метаданные последней загрузки (или null). */
export const getOfflineContentMeta = async (): Promise<OfflineContentMeta | null> => {
  try {
    return await idbGet(META_STORE, META_KEY)
  } catch {
    return null
  }
}

const saveMeta = async (meta: OfflineContentMeta): Promise<void> => {
  try {
    await idbPut(META_STORE, meta, META_KEY)
  } catch { /* приватный режим / quota — не критично */ }
}

/**
 * Скачать один URL и сохранить его Blob локально.
 * @returns true, если файл сохранён (или уже был)
 */
export const downloadAndStore = async (url: string): Promise<boolean> => {
  if (!url) return false
  // Приложение отдаёт относительные URL сайта (/images/...). Приводим их к
  // абсолютным: fetch в браузере требует абсолютный URL, а ключ оставляем
  // исходный — именно его ищут RuneCard и useAudioPlayback.
  const absoluteUrl = toAbsoluteUrl(url)
  if (await hasOfflineBlob(url)) return true
  try {
    const res = await fetch(absoluteUrl, { credentials: 'same-origin' })
    if (!res.ok) return false
    const blob = await res.blob()
    if (!blob || blob.size === 0) return false
    // Ключ — исходный (относительный) URL: именно его ищут RuneCard/useAudioPlayback.
    await idbPut(STORE, blob, url)
    return true
  } catch {
    return false
  }
}

// Относительный URL сайта → абсолютный (для fetch). Уже абсолютный возвращаем как есть.
const toAbsoluteUrl = (url: string): string => {
  if (/^https?:/i.test(url)) return url
  try {
    const base = typeof self !== 'undefined' && self.location ? self.location.origin : window.location.origin
    return new URL(url, base).href
  } catch {
    return url
  }
}

/**
 * Фоново скачать список URL и сохранить их локально.
 * Грузит пачками, чтобы не забивать канал на телефоне.
 * @returns количество успешно сохранённых файлов
 */
export const downloadAll = async (
  urls: string[],
  { chunkSize = 6, onProgress }: { chunkSize?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<number> => {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && u)
  const unique = Array.from(new Set(list))
  let done = 0
  for (let i = 0; i < unique.length; i += chunkSize) {
    const part = unique.slice(i, i + chunkSize)
    const results = await Promise.all(part.map((u) => downloadAndStore(u)))
    done += results.filter(Boolean).length
    onProgress?.(done, unique.length)
  }
  return done
}

/**
 * Полный цикл фоновой загрузки оффлайн-контента:
 * картинки рун (карточки + крест) и аудио личного словаря.
 * Качает только то, чего ещё нет локально (или всё заново при смене версии).
 */
export const prefetchOfflineContent = async ({
  imageUrls = [],
  audioUrls = [],
  version = 'v1',
  onProgress,
}: {
  imageUrls?: string[]
  audioUrls?: string[]
  version?: string
  onProgress?: (info: { images: number; audio: number; total: number; done: number }) => void
} = {}): Promise<OfflineContentMeta | null> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  if (typeof indexedDB === 'undefined') return null

  const images = Array.from(new Set(imageUrls.filter(Boolean)))
  const audio = Array.from(new Set(audioUrls.filter(Boolean)))

  const prev = await getOfflineContentMeta()
  // При смене версии набора качаем заново (перезальём существующие ключи)
  const force = !prev || prev.version !== version

  let imagesDone = 0
  let audioDone = 0

  if (images.length) {
    imagesDone = await downloadAll(force ? images : await filterMissing(images), {
      onProgress: (done, total) =>
        onProgress?.({ images: done, audio: audioDone, total: images.length + audio.length, done: done + audioDone }),
    })
  }
  if (audio.length) {
    audioDone = await downloadAll(force ? audio : await filterMissing(audio), {
      onProgress: (done) =>
        onProgress?.({ images: imagesDone, audio: done, total: images.length + audio.length, done: imagesDone + done }),
    })
  }

  const meta: OfflineContentMeta = {
    images: imagesDone,
    audio: audioDone,
    savedAt: Date.now(),
    version,
  }
  await saveMeta(meta)
  return meta
}

/** Оставить только те URL, для которых ещё нет локального blob. */
const filterMissing = async (urls: string[]): Promise<string[]> => {
  const checks = await Promise.all(urls.map(async (u) => ((await hasOfflineBlob(u)) ? null : u)))
  return checks.filter((u): u is string => !!u)
}
