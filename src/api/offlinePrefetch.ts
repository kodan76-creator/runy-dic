// src/api/offlinePrefetch.ts
// 🚀 Гарантированный фоновый прогрев оффлайн-контента на старте приложения.
//
// Почему отдельный модуль: раньше prefetchOfflineContent вызывался только
// внутри Home (после загрузки словаря и только при runesPaid) и внутри
// RuneLayout (только когда открыт раздел «Новые Руны»). В результате у
// обычного пользователя префетч вообще не запускался — IndexedDB оставалась
// пустой, и оффлайн картинки рун не отображались.
//
// Здесь прогрев запускается один раз при загрузке приложения, независимо от
// авторизации и открытого раздела. Список URL строится из статических данных
// (файлы папок n_runy и n_runy/runy), поэтому сеть для его получения не нужна.

import { prefetchOfflineContent } from './offlineContent'
import { collectImageUrls, collectRuneLayoutImageUrls } from './images'
import { RUNES_IMAGE_DIR } from './constants'
import { getCachedRunes } from './offline'
import { RUNES_LAYOUT_FALLBACK } from './runeLayoutList'

// Версия набора: при её смене контент докачивается заново.
const OFFLINE_CONTENT_VERSION = 'v22'

let started = false

/**
 * Один раз в фоне скачать все картинки рун (карточки n_runy + крест
 * n_runy/runy) и сохранить их локально в IndexedDB.
 * Повторные вызовы игнорируются.
 */
export const startOfflinePrefetch = (): void => {
  if (started) return
  if (typeof navigator === 'undefined' || typeof indexedDB === 'undefined') return
  started = true

  // Даём странице спокойно отрисоваться и не конкурируем за канал
  // с первыми запросами словаря.
  const run = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const imageUrls = [
      ...collectRuneLayoutImageUrls(RUNES_LAYOUT_FALLBACK),
      ...collectImageUrls(getCachedRunes() || [], RUNES_IMAGE_DIR),
    ]
    prefetchOfflineContent({ imageUrls, version: OFFLINE_CONTENT_VERSION })
      .catch(() => { /* фоновый прогрев — ошибки не критичны */ })
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(run, { timeout: 5000 })
  } else {
    setTimeout(run, 3000)
  }
}
