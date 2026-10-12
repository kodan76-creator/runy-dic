// src/components/ScrollTopButton.tsx
// ⬆ Плавающая кнопка «Наверх» для длинных прокручиваемых разделов («Новые
// Руны», «Рунный алфавит»). Скрыта, пока страницу не прокрутили; при прокрутке
// появляется справа внизу (position: fixed + портал в body) и плавно крутит
// вверх контейнер .runes-dictionary-section (именно он крутится, а не window),
// запасной вариант — window.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const SCROLL_THRESHOLD = 250

function readScrollY(): number {
  const section = document.querySelector(
    '.runes-dictionary-section',
  ) as HTMLElement | null
  const sectionY = section ? section.scrollTop : 0
  const windowY = window.scrollY ?? document.documentElement.scrollTop ?? 0
  return Math.max(sectionY, windowY)
}

export default function ScrollTopButton({ label = 'Наверх' }: { label?: string }) {
  // Кнопка скрыта, пока раздел не прокрутили ниже порога.
  // Начальное значение читаем лениво (не в эффекте), чтобы не дёргать
  // setState синхронно внутри useEffect.
  const [visible, setVisible] = useState<boolean>(
    () => readScrollY() > SCROLL_THRESHOLD,
  )

  useEffect(() => {
    const section = document.querySelector(
      '.runes-dictionary-section',
    ) as HTMLElement | null
    const onScroll = () => setVisible(readScrollY() > SCROLL_THRESHOLD)
    section?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      section?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const scrollToTop = () => {
    const el = document.querySelector('.runes-dictionary-section') as HTMLElement | null
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (!visible) return null

  return createPortal(
    <div className="scroll-top-wrap scroll-top-float">
      <button
        type="button"
        className="scroll-top-btn"
        onClick={scrollToTop}
        aria-label="Вернуться наверх страницы"
        title="Наверх"
      >
        <span aria-hidden="true">⬆</span> {label}
      </button>
    </div>,
    document.body,
  )
}
