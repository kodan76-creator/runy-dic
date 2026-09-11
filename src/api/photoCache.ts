// src/api/photoCache.ts
// Кэширование фото Рунной раскладки: локальное хранилище (IndexedDB)
// и обработка через Canvas (обрезка по эллипсу + минимизация размера).

const DB_NAME = 'rune-layout-cache'
const DB_VERSION = 1
const STORE_PHOTOS = 'photo-blobs'
const STORE_STATE = 'layout-state'

// ── IndexedDB helpers ────────────────────────────────────────────────

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS)
      if (!db.objectStoreNames.contains(STORE_STATE)) db.createObjectStore(STORE_STATE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

// ── Кэш blobs фото (IndexedDB) ──────────────────────────────────────

/** Сохранить blob обработанного фото в IndexedDB. */
export const cachePhotoBlob = async (email: string, blob: Blob): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite')
    tx.objectStore(STORE_PHOTOS).put(blob, email)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Получить кэшированный blob фото (или null). */
export const getCachedPhotoBlob = async (email: string): Promise<Blob | null> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTOS, 'readonly')
    const req = tx.objectStore(STORE_PHOTOS).get(email)
    req.onsuccess = () => { db.close(); resolve(req.result || null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** Удалить кэшированный blob фото. */
export const removeCachedPhotoBlob = async (email: string): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite')
    tx.objectStore(STORE_PHOTOS).delete(email)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── Обработка фото через Canvas ──────────────────────────────────────

/**
 * Рендерит фото с текущим pan/zoom и обрезает по размеру эллипса.
 * Возвращает Blob (JPEG, quality 0.85) — минимизация без потери качества.
 *
 * Логика воспроизводит CSS `object-fit: cover` + `translate(panX, panY) scale(zoom)`
 * с `transform-origin: center`.
 */
export const processPhotoToEllipse = (
  img: HTMLImageElement,
  panX: number,
  panY: number,
  zoom: number,
  ellipseW: number,
  ellipseH: number,
  quality = 0.85
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(ellipseW)
    canvas.height = Math.round(ellipseH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas не поддерживается'))

    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) return reject(new Error('Изображение не загружено'))

    // object-fit: cover — масштабируем чтобы заполнить эллипс
    const coverScale = Math.max(ellipseW / iw, ellipseH / ih)
    const coverW = iw * coverScale
    const coverH = ih * coverScale
    const coverX = (ellipseW - coverW) / 2
    const coverY = (ellipseH - coverH) / 2

    // CSS: transform: translate(panX, panY) scale(zoom); transform-origin: center;
    // Порядок: сначала scale вокруг центра, потом translate.
    const cx = ellipseW / 2
    const cy = ellipseH / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)
    ctx.translate(-cx, -cy)
    ctx.drawImage(img, coverX, coverY, coverW, coverH)
    ctx.restore()

    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать изображение'))),
      'image/jpeg',
      quality
    )
  })

// ── Локальное состояние pan/zoom (localStorage) ──────────────────────

interface LayoutState {
  panX: number
  panY: number
  zoom: number
}

const stateKey = (email: string) => `rune_layout:${email}`

/** Сохранить состояние pan/zoom. */
export const saveLayoutState = (email: string, state: LayoutState): void => {
  try {
    localStorage.setItem(stateKey(email), JSON.stringify(state))
  } catch { /* quota exceeded — ignore */ }
}

/** Загрузить сохранённое состояние pan/zoom (или null). */
export const loadLayoutState = (email: string): LayoutState | null => {
  try {
    const raw = localStorage.getItem(stateKey(email))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/** Очистить сохранённое состояние (после «применения» фото). */
export const clearLayoutState = (email: string): void => {
  try {
    localStorage.removeItem(stateKey(email))
  } catch { /* ignore */ }
}
