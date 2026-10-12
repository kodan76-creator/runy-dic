// src/components/ScrollTopButton.tsx
// ⬆ Общая кнопка «Наверх» для длинных прокручиваемых разделов («Новые Руны»,
// «Рунный алфавит»). Прокручивает вверх контейнер .runes-dictionary-section
// (именно он крутится, а не window), запасной вариант — window.
export default function ScrollTopButton({ label = 'Наверх' }: { label?: string }) {
  const scrollToTop = () => {
    const el = document.querySelector('.runes-dictionary-section') as HTMLElement | null
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="scroll-top-wrap">
      <button
        type="button"
        className="scroll-top-btn"
        onClick={scrollToTop}
        aria-label="Вернуться наверх страницы"
        title="Наверх"
      >
        <span aria-hidden="true">⬆</span> {label}
      </button>
    </div>
  )
}
