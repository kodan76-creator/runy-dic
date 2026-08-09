/* public/sw.js
 * Service Worker для оффлайн-режима (PWA).
 * - Кэширует оболочку приложения (index.html + статика) при установке.
 * - Навигация: сеть сначала, при сбое — из кэша (страница открывается оффлайн).
 * - Статика: stale-while-revalidate (сначала кэш, фоном обновляется).
 * - API-запросы (api.github.com и другие домены) не перехватываются.
 */
const CACHE_NAME = 'runy-dic-v1'
const APP_SHELL = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Прогрев кэша: приложение присылает список загруженных ассетов,
// чтобы оффлайн работал уже после первого визита
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE_URLS' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => {
      try { return new URL(u).origin === self.location.origin } catch { return false }
    })
    if (urls.length) {
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urls)).catch((err) => console.error('PRECACHE failed:', err))
      )
    }
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Не перехватываем запросы на другие домены (GitHub API, raw, аудио и т.п.)
  if (url.origin !== self.location.origin) return

  // Навигация по странице — сеть сначала, при ошибке — из кэша
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy))
          return response
        })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Статические ассеты (JS/CSS/шрифты/картинки) — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
