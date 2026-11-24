// src/utils/highlightSearch.tsx
// Подсветка совпадений поиска в карточках слов — общая для главной страницы
// (WordCard) и сетки админ-панели (WordItem), чтобы подсветка была одинаковой.
import type { ReactNode } from 'react'

export const highlightSearch = (text: unknown, searchTerm?: string): ReactNode => {
  if (text == null || !searchTerm?.trim()) return text as ReactNode

  const term = searchTerm.trim()
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escaped})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="search-hit">{part}</mark>
      : part
  )
}
