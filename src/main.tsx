import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { initTheme } from './theme.ts'
import './fonts.css'

initTheme()

// 🌐 PWA: регистрируем Service Worker для оффлайн-режима.
// В dev-режиме не регистрируем, чтобы не мешать HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(async () => {
        await navigator.serviceWorker.ready
        // Ждём, пока SW начнёт контролировать страницу (после clients.claim)
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
          })
        }
        // Прогреваем кэш текущими ассетами (JS/CSS/шрифты), чтобы оффлайн
        // работал уже после первого визита
        const urls = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .map(e => e.name)
          .filter(u => u.startsWith(location.origin))
        navigator.serviceWorker.controller?.postMessage({ type: 'PRECACHE_URLS', urls })
      })
      .catch((err) => console.error('SW registration failed:', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
