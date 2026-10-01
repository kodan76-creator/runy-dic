// src/components/admin/WordItem.test.tsx
// Регресс: id удалённой категории не должен отображаться цифрами
// в сетке слов админ-панели.
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import WordItem from './WordItem'

const baseProps = {
  idx: 0,
  canEdit: false,
  isFirst: true,
  isLast: false,
  wordsLength: 1,
  positionValue: 1,
  categories: [{ id: '1778594679982', name: 'имя существования' }],
  onMoveToTop: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onMoveToBottom: vi.fn(),
  onPositionChange: vi.fn(),
  onPositionSubmit: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onPlayAudio: vi.fn(),
  onScrollTop: vi.fn(),
}

describe('WordItem: категории', () => {
  it('висячий id удалённой категории не показывается цифрами', () => {
    render(
      <WordItem
        {...baseProps}
        word={{ id: 1, word: 'АМИНЬ.', translation: 'аминь', category: ['1781437361727', '1778594679982'] }}
      />,
    )
    const el = document.querySelector('.word-category')
    expect(el?.textContent).toBe('(имя существования)')
    expect(el?.textContent).not.toContain('1781437361727')
  })

  it('когда все категории удалены, блок не рендерится (не будет «()»)', () => {
    render(<WordItem {...baseProps} word={{ id: 2, word: 'БОГ', translation: 'бог', category: ['999999'] }} />)
    expect(document.querySelector('.word-category')).toBeNull()
  })
})