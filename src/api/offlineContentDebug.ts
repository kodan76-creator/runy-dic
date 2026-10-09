// src/api/offlineContentDebug.ts
// 🔍 Диагностика оффлайн-хранилища (IndexedDB `runy-offline-content`).
//
// Зачем: картинки рун «не отображаются оффлайн», и по логам непонятно, на
// каком шаге ломается — префетч не скачал, скачал под другим ключом, или
// RuneCard ищет не тот URL. Эта функция вываливает всё состояние разом.
//
// Использование: открыть сайт онлайн, затем в консоли браузера выполнить
//   await window.__offlineContentDiag()
// (в dev-режиме функция вешается на window автоматически, см. main.tsx)

import { getOfflineContentMeta, hasOfflineBlob } from './offlineContent'
import { buildImageUrl, buildRuneImageUrls } from './images'
import { RUNES_IMAGE_DIR } from './constants'

const DB_NAME = 'runy-offline-content'
const STORE = 'blobs'

interface KeyInfo {
  key: string
  size: number
  type: string
}

/** Прочитать все ключи хранилища blob'ов (с размерами). */
const listAllBlobKeys = async (): Promise<KeyInfo[]> => {
  if (typeof indexedDB === 'undefined') return []
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME)
    req.onerror = () => resolve([])
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve([]); return }
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const keysReq = store.getAllKeys()
      const valsReq = store.getAll()
      let keys: IDBValidKey[] = []
      let vals: any[] = []
      keysReq.onsuccess = () => { keys = keysReq.result }
      valsReq.onsuccess = () => { vals = valsReq.result }
      tx.oncomplete = () => {
        db.close()
        resolve(keys.map((k, i) => {
          const v = vals[i]
          return {
            key: String(k),
            size: v && typeof v.size === 'number' ? v.size : 0,
            type: v && typeof v.type === 'string' ? v.type : '',
          }
        }))
      }
      tx.onerror = () => { db.close(); resolve([]) }
    }
  })
}

/**
 * Полная диагностика. Возвращает объект + печатает читаемую сводку в консоль.
 */
export const offlineContentDiag = async (runes?: any[]) => {
  const out: any = {
    origin: typeof location !== 'undefined' ? location.origin : '(no location)',
    baseUrl: import.meta.env.BASE_URL,
    indexedDBAvailable: typeof indexedDB !== 'undefined',
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    swController: typeof navigator !== 'undefined' && navigator.serviceWorker
      ? !!navigator.serviceWorker.controller
      : false,
    meta: null as any,
    totalBlobs: 0,
    totalBytes: 0,
    byType: {} as Record<string, number>,
    sampleKeys: [] as string[],
    runeChecks: [] as any[],
    missing: [] as string[],
  }

  // 1) Метаданные последнего префетча
  try { out.meta = await getOfflineContentMeta() } catch (e) { out.metaError = String(e) }

  // 2) Все ключи в IndexedDB
  let allKeys: KeyInfo[] = []
  try { allKeys = await listAllBlobKeys() } catch (e) { out.keysError = String(e) }
  out.totalBlobs = allKeys.length
  out.totalBytes = allKeys.reduce((s, k) => s + k.size, 0)
  for (const k of allKeys) {
    const t = k.type || '(no type)'
    out.byType[t] = (out.byType[t] || 0) + 1
  }
  out.sampleKeys = allKeys.slice(0, 15).map((k) => `${k.key} [${k.size}b ${k.type}]`)

  // 3) Проверка конкретных рун: какие URL ищет RuneCard и есть ли они в хранилище
  if (Array.isArray(runes) && runes.length > 0) {
    for (const rune of runes.slice(0, 10)) {
      if (!rune?.image) continue
      const localSrc = buildImageUrl(rune.image, RUNES_IMAGE_DIR)
      const { fallback } = buildRuneImageUrls(rune)
      const hasLocal = await hasOfflineBlob(localSrc).catch(() => false)
      const hasFallback = fallback && fallback !== localSrc
        ? await hasOfflineBlob(fallback).catch(() => false)
        : false
      out.runeChecks.push({
        name: rune.name,
        image: rune.image,
        localSrc,
        hasLocalBlob: hasLocal,
        fallbackSrc: fallback,
        hasFallbackBlob: hasFallback,
      })
      if (!hasLocal && !hasFallback) out.missing.push(localSrc)
    }
  }

  // 4) Читаемая сводка
  const lines = [
    '=== 🔍 ОФФЛАЙН-ХРАНИЛИЩЕ (диагностика) ===',
    `origin:            ${out.origin}`,
    `BASE_URL:          ${out.baseUrl}`,
    `indexedDB:         ${out.indexedDBAvailable ? 'есть' : 'НЕТ'}`,
    `navigator.onLine:  ${out.online}`,
    `SW controller:     ${out.swController ? 'есть' : 'нет'}`,
    `meta (последний префетч): ${out.meta ? JSON.stringify(out.meta) : 'null (префетч не отработал)'}`,
    `всего blob'ов:     ${out.totalBlobs}`,
    `суммарный размер:  ${(out.totalBytes / 1024 / 1024).toFixed(2)} МБ`,
    `по типам:          ${JSON.stringify(out.byType)}`,
  ]
  if (out.sampleKeys.length) {
    lines.push('примеры ключей:')
    for (const k of out.sampleKeys) lines.push(`  • ${k}`)
  }
  if (out.runeChecks.length) {
    lines.push('', 'проверка рун (первые 10):')
    for (const c of out.runeChecks) {
      lines.push(`  • ${c.name || c.image}: local=${c.hasLocalBlob ? '✅' : '❌'} fallback=${c.hasFallbackBlob ? '✅' : '❌'}  ${c.localSrc}`)
    }
  }
  if (out.missing.length) {
    lines.push('', `❌ НЕ НАЙДЕНЫ в IndexedDB (${out.missing.length}):`)
    for (const m of out.missing) lines.push(`  • ${m}`)
  } else if (out.runeChecks.length) {
    lines.push('', '✅ Все проверенные руны есть в IndexedDB')
  }

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
  return out
}

// Автоматически вешаем на window, чтобы можно было вызвать из консоли без импорта.
if (typeof window !== 'undefined') {
  ;(window as any).__offlineContentDiag = offlineContentDiag
}
