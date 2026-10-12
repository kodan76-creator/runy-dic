// src/components/RuneAlphabet.test.tsx
// Тесты «Рунного алфавита»: 32 знака с картинками с листа, переводчик
// кириллицы в руны (шрифт Dao Rus), три текста и дата с оригинала.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RuneAlphabet from './RuneAlphabet'
import { RUNE_ALPHABET, RUNE_ALPHABET_TEXTS, RUNE_ALPHABET_TITLE } from '../data/runeAlphabet'

describe('Рунный алфавит: данные', () => {
  it('32 знака с уникальными названиями', () => {
    expect(RUNE_ALPHABET).toHaveLength(32)
    const names = RUNE_ALPHABET.map(l => l.name)
    expect(new Set(names).size).toBe(32)
    expect(names[0]).toBe('Эль')
    expect(names[names.length - 1]).toBe('Нуль')
  })

  it('все картинки знаков существуют в public/images/n_runy/runy/', () => {
    const dir = path.resolve(process.cwd(), 'public/images/n_runy/runy')
    for (const letter of RUNE_ALPHABET) {
      expect(
        fs.existsSync(path.join(dir, letter.image)),
        `нет файла картинки: ${letter.image}`,
      ).toBe(true)
    }
  })
})

describe('Рунный алфавит: разметка', () => {
  it('заголовок листа (® после «ч» в «Гоч») и 32 карточки с названием и звуком', async () => {
    render(<RuneAlphabet />)

    expect(screen.getByRole('heading', { name: RUNE_ALPHABET_TITLE })).toBeInTheDocument()
    expect(RUNE_ALPHABET_TITLE).toBe('Рунный алфавит Гоч®а Эльборсибо')
    const cards = document.querySelectorAll('.rune-alphabet-card')
    expect(cards).toHaveLength(32)

    expect(screen.getByText('Эль')).toBeInTheDocument()
    expect(screen.getByText('[эль]')).toBeInTheDocument()
    expect(screen.getByText('Фаис-су')).toBeInTheDocument()
    expect(screen.getByText('Нуль')).toBeInTheDocument()

    // Картинки знаков приходят из public/images/n_runy/runy/ (офлайн-кэш SW)
    const imgs = await screen.findAllByAltText(/^Знак /)
    expect(imgs).toHaveLength(32)
    expect(imgs[0].getAttribute('src')).toContain('images/n_runy/runy/')
  })

  it('три текста с листа и дата внизу', () => {
    render(<RuneAlphabet />)

    const items = document.querySelectorAll('.rune-alphabet-texts-list li')
    expect(items).toHaveLength(RUNE_ALPHABET_TEXTS.length)
    expect(screen.getByText(RUNE_ALPHABET_TEXTS[0])).toBeInTheDocument()
    expect(screen.getByText('31 января – 31 мая 1999 года')).toBeInTheDocument()
  })

  it('строка ввода (переводчик) отсутствует', () => {
    render(<RuneAlphabet />)

    expect(document.querySelector('.rune-alphabet-translator')).toBeNull()
    expect(document.querySelector('.rune-alphabet-input')).toBeNull()
    expect(document.querySelector('.rune-alphabet-preview')).toBeNull()
  })
})

describe('Рунный алфавит: вёрстка (App.css)', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/App.css'), 'utf8')

  it('карточки выложены тремя колонками и на десктопе, и на мобильном', () => {
    const gridBlock = css.match(/\.rune-alphabet-grid\s*\{[^}]*/)?.[0] || ''
    expect(gridBlock).toContain('grid-template-columns: repeat(3, 1fr)')
  })

  it('пункты нижнего текста выровнены по левому краю', () => {
    const liBlock = css.match(/\.rune-alphabet-texts-list li\s*\{[^}]*/)?.[0] || ''
    expect(liBlock).toContain('text-align: left')
  })
})
