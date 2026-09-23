/* public/sw.js
 * Service Worker для оффлайн-режима (PWA).
 * - Кэширует оболочку приложения (index.html + статика) при установке.
 * - Навигация: сеть сначала, при сбое — из кэша (страница открывается оффлайн).
 * - Статика: stale-while-revalidate (сначала кэш, фоном обновляется).
 * - API-запросы (api.github.com и другие домены) не перехватываются.
 */
const CACHE_NAME = 'runy-dic-v18'
const APP_SHELL = ['./', './index.html']

// 🧿 Все картинки рун для «Рунной раскладки» (креста) кэшируются сразу при
// установке Service Worker'а: оффлайн работает гарантированно, без зависимости
// от прогрева со страницы (список = содержимое public/images/n_runy/runy/).
const RUNE_IMAGES = [
  './images/n_runy/runy/1_ФАИС-СУ.png',
  './images/n_runy/runy/2_ФАИС-СУ_П.png',
  './images/n_runy/runy/3_ОРС.png',
  './images/n_runy/runy/4_ОРС_П.png',
  './images/n_runy/runy/5_ТУРЗ.png',
  './images/n_runy/runy/6_АЗ.png',
  './images/n_runy/runy/7_РАДО.png',
  './images/n_runy/runy/8_РАДО_П.png',
  './images/n_runy/runy/9_АЛУ.png',
  './images/n_runy/runy/10_ХЕБО.png',
  './images/n_runy/runy/11_ХЕБО_П.png',
  './images/n_runy/runy/12_ВИНЬО.png',
  './images/n_runy/runy/13_ВИНЬО_П.png',
  './images/n_runy/runy/14_ПУСТАЯ.png',
  './images/n_runy/runy/15_ТАК.png',
  './images/n_runy/runy/16_ТАК_П.png',
  './images/n_runy/runy/17_ЙЕХ.png',
  './images/n_runy/runy/18_ЙЕХ_П.png',
  './images/n_runy/runy/19_АЙЯ.png',
  './images/n_runy/runy/20_ЭЙСА.png',
  './images/n_runy/runy/21_ЫРД.png',
  './images/n_runy/runy/22_АЛЬ-ГО.png',
  './images/n_runy/runy/23_ЭЛЬ.png',
  './images/n_runy/runy/24_АМАЮН.png',
  './images/n_runy/runy/25_АМАЮН_П.png',
  './images/n_runy/runy/26_БЕРКУТ.png',
  './images/n_runy/runy/27_БЕРКУТ_П.png',
  './images/n_runy/runy/28_ВОЗ.png',
  './images/n_runy/runy/29_МЭТР.png',
  './images/n_runy/runy/30_МЭТР_П.png',
  './images/n_runy/runy/31_ЛАТХУ.png',
  './images/n_runy/runy/32_ЛАУКАР.png',
  './images/n_runy/runy/33_ША.png',
  './images/n_runy/runy/34_ША_П.png',
  './images/n_runy/runy/35_КИЙГ.png',
  './images/n_runy/runy/36_ЦЭРЭ.png',
  './images/n_runy/runy/37_ЦЭРЭ_П.png',
  './images/n_runy/runy/38_РУНА ТИШИНЫ.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL)
        // Каждую картинку качаем отдельно: одна ошибка не должна ломать установку SW
        await Promise.all(
          RUNE_IMAGES.map((u) =>
            cache.add(u).catch((err) => console.error('RUNE image precache failed:', u, err))
          )
        )
      })
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
const PRECACHE_CHUNK_SIZE = 6

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE_URLS' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => {
      try { return new URL(u).origin === self.location.origin } catch { return false }
    })
    if (urls.length) {
      event.waitUntil(
        caches.open(CACHE_NAME)
          .then(async (cache) => {
            // Грузим пачками: сразу 38 картинок рун «забивают» канал на телефоне
            for (let i = 0; i < urls.length; i += PRECACHE_CHUNK_SIZE) {
              const part = urls.slice(i, i + PRECACHE_CHUNK_SIZE)
              await Promise.all(part.map((u) => cache.add(u).catch((err) => console.error('PRECACHE one failed:', u, err))))
            }
          })
          .catch((err) => console.error('PRECACHE failed:', err))
      )
    }
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Не перехватываем запросы на другие домены (GitHub API, raw и т.п.)
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

  // 🎵 Аудио (public/audio/): кэш-первый.
  // Медиа-запросы идут с Range-заголовком, и GitHub отвечает 206 Partial Content,
  // который нельзя корректно сохранить в Cache API. Поэтому запрашиваем ПОЛНЫЙ
  // файл (без Range), кэшируем его и отдаём целиком — оффлайн работает.
  if (/\/audio\/.+\.(mp3|ogg|wav|m4a|aac|webm|flac|opus)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(url.href).then((cached) => {
        if (cached) return cached
        const fullRequest = new Request(url.href, { method: 'GET' })
        return fetch(fullRequest)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(url.href, copy))
            }
            return response
          })
          .catch(() => cached)
      })
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
