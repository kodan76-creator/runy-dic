// src/utils/highlightSearch.tsx
// Подсветка совпадений поиска в карточках слов — общая для главной страницы
// (WordCard) и сетки админ-панели (WordItem), чтобы подсветка была одинаковой.
import type { ReactNode } from 'react'

// Один и тот же запрос применяется к шести полям каждой карточки. Компиляция
// RegExp на каждое поле (900+ карточек) заметно грузит CPU при вводе — кэшируем
// регулярку по запросу. String.split не меняет lastIndex исходного RegExp.
const regexCache = new Map<string, RegExp>()
const REGEX_CACHE_LIMIT = 100

const getSearchRegex = (term: string): RegExp => {
  const cached = regexCache.get(term)
  if (cached) return cached
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'ig')
  if (regexCache.size >= REGEX_CACHE_LIMIT) regexCache.clear()
  regexCache.set(term, regex)
  return regex
}

export const highlightSearch = (text: unknown, searchTerm?: string): ReactNode => {
  if (text == null || !searchTerm?.trim()) return text as ReactNode

  const term = searchTerm.trim()
  const lowerTerm = term.toLowerCase()
  const parts = String(text).split(getSearchRegex(term))
  return parts.map((part, i) =>
    part.toLowerCase() === lowerTerm
      ? <mark key={i} className="search-hit">{part}</mark>
      : part
  )
}
