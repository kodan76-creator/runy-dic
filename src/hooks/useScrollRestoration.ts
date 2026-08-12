// src/hooks/useScrollRestoration.ts
// Аккуратное сохранение/восстановление позиции прокрутки конкретного контейнера.
// - Сохранение: при скролле контейнера (throttled через requestAnimationFrame) в sessionStorage.
// - Восстановление: при монтировании контейнера и при изменении deps (напр. загрузка данных).
//   Если контент ещё не готов (высота недостаточна), повторяем через кадр, с таймаутом-страховкой.
//
// Использование:
//   const listRef = useRef<HTMLDivElement | null>(null)
//   useScrollRestoration(listRef, 'scroll_admin_words', [words.length])
//   ...
//   <div className="words-list" ref={listRef}>
import { useEffect, RefObject } from 'react'

export function useScrollRestoration(
  ref: RefObject<HTMLElement | null>,
  storageKey: string,
  deps: unknown[] = []
) {
  // Сохраняем позицию прокрутки
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          try {
            sessionStorage.setItem(storageKey, String(el.scrollTop))
          } catch { /* ignore */ }
          ticking = false
        })
        ticking = true
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, storageKey, ...deps])

  // Восстанавливаем позицию прокрутки
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(storageKey)
    } catch { /* ignore */ }
    if (saved === null) return
    const y = parseInt(saved, 10)
    if (isNaN(y) || y <= 0) return

    let raf2 = 0
    const restore = () => {
      if (el.scrollHeight >= y) {
        el.scrollTop = y
      } else {
        // Контент ещё не загружен — пробуем ещё раз через кадр
        raf2 = window.requestAnimationFrame(restore)
      }
    }
    const raf1 = window.requestAnimationFrame(restore)
    // Страховка: если через 600мс контент всё ещё не готов, ставим позицию принудительно
    const timeout = window.setTimeout(() => {
      window.cancelAnimationFrame(raf2)
      el.scrollTop = y
    }, 600)
    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, storageKey, ...deps])
}
