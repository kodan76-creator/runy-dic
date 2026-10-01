// src/components/WordCard.test.tsx
// Регресс: id удалённой категории не должен отображаться цифрами в карточке
// (слово ссылается на категорию, которой больше нет в справочнике).
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import WordCard from './WordCard'

const CATEGORIES = [
  { id: '1778594679982', name: 'имя существования' },
  { id: 'u1781437361727', name: 'молитва' },
]

const baseProps = {
  categories: CATEGORIES,
  isFavorite: false,
  onToggleFavorite: vi.fn(),
  onPlayAudio: vi.fn(),
  onScrollTop: vi.fn(),
  searchTerm: '',
}

describe('WordCard: категории', () => {
  it('id удалённой категории скрыт, остальные показаны именами', () => {
    render(
      <WordCard
        {...baseProps}
        item={{ id: 1, word: 'АМИНЬ.', translation: 'аминь', category: ['1781437361727', '1778594679982'] }}
      />,
    )
    const el = document.querySelector('.card-category')
    expect(el?.textContent).toBe('(имя существования)')
    expect(el?.textContent).not.toContain('1781437361727')
  })

  it('когда все категории удалены, блок категорий не рендерится', () => {
    render(<WordCard {...baseProps} item={{ id: 2, word: 'БОГ', translation: 'бог', category: ['999999'] }} />)
    expect(document.querySelector('.card-category')).toBeNull()
  })

  it('имя личной категории резолвится по её id', () => {
    render(<WordCard {...baseProps} item={{ id: 3, word: 'МОЛИТВА', translation: 'молитва', category: ['u1781437361727'] }} />)
    expect(document.querySelector('.card-category')?.textContent).toBe('(молитва)')
  })
})