// src/components/RuneAlphabet.test.tsx
// Тесты «Рунного алфавита»: 32 знака с картинками с листа, переводчик
// кириллицы в руны (шрифт Dao Rus), три текста и дата с оригинала.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RuneAlphabet from './RuneAlphabet'
import { type Rune } from '../types'
import { RUNE_ALPHABET, RUNE_ALPHABET_TEXTS, RUNE_ALPHABET_TITLE, RUNE_ALPHABET_VERSES } from '../data/runeAlphabet'

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

  it('32 строки «проявления» — по одной на знак, в порядке нумерации', () => {
    expect(RUNE_ALPHABET_VERSES).toHaveLength(32)
    expect(RUNE_ALPHABET_VERSES[0]).toBe('Божественный')
    expect(RUNE_ALPHABET_VERSES[9]).toBe('Материю.')
    expect(RUNE_ALPHABET_VERSES[10]).toBe('Единство')
    expect(RUNE_ALPHABET_VERSES[21]).toBe('Света.')
    expect(RUNE_ALPHABET_VERSES[22]).toBe('Ибо')
    expect(RUNE_ALPHABET_VERSES[31]).toBe('возвращается к Отцу.')
    // Все строки непустые — у каждой карточки есть своё «проявление»
    for (const verse of RUNE_ALPHABET_VERSES) {
      expect(verse.trim().length).toBeGreaterThan(0)
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

  it('колонки листа: Эль→Ва, Орс→Цэрэ, Ибо→Нуль (10/12/10)', () => {
    render(<RuneAlphabet />)

    const columns = Array.from(document.querySelectorAll('.rune-alphabet-column'))
    expect(columns).toHaveLength(3)
    const namesIn = (col: Element) =>
      Array.from(col.querySelectorAll('.rune-alphabet-name')).map(n => n.textContent)
    const [first, second, third] = columns.map(namesIn)

    expect(first).toHaveLength(10)
    expect(first[0]).toBe('Эль')
    expect(first[9]).toBe('Ва')

    expect(second).toHaveLength(12)
    expect(second[0]).toBe('Орс')
    expect(second[11]).toBe('Цэрэ')

    expect(third).toHaveLength(10)
    expect(third[0]).toBe('Ибо')
    expect(third[9]).toBe('Нуль')
  })

  it('три текста с листа и дата внизу', () => {
    render(<RuneAlphabet />)

    const items = document.querySelectorAll('.rune-alphabet-texts-list li')
    expect(items).toHaveLength(RUNE_ALPHABET_TEXTS.length)
    expect(screen.getByText(RUNE_ALPHABET_TEXTS[0])).toBeInTheDocument()
    expect(screen.getByText('31 января – 31 мая 1999 года')).toBeInTheDocument()
  })

  it('внизу — кнопка «Наверх» для возврата к началу', () => {
    render(<RuneAlphabet />)

    expect(screen.getByRole('button', { name: 'Вернуться наверх страницы' })).toBeInTheDocument()
  })

  it('строка ввода (переводчик) отсутствует', () => {
    render(<RuneAlphabet />)

    expect(document.querySelector('.rune-alphabet-translator')).toBeNull()
    expect(document.querySelector('.rune-alphabet-input')).toBeNull()
    expect(document.querySelector('.rune-alphabet-preview')).toBeNull()
  })
})

describe('Рунный алфавит: «Сияние проявления»', () => {
  it('у каждой карточки есть оверлей со строкой знака (по нумерации 1–32)', () => {
    render(<RuneAlphabet />)

    const verses = document.querySelectorAll('.rune-alphabet-verse-text')
    expect(verses).toHaveLength(32)
    // Первая карточка (Эль) — «Божественный», 11-я (Орс) — «Единство»,
    // 23-я (Ибо) — «Ибо», последняя (Нуль) — «возвращается к Отцу.»
    expect(verses[0].textContent).toBe('Божественный')
    expect(verses[10].textContent).toBe('Единство')
    expect(verses[22].textContent).toBe('Ибо')
    expect(verses[31].textContent).toBe('возвращается к Отцу.')
  })

  it('первый тап на тач-экране зажигает сияние, второй — открывает описание', async () => {
    // Эмулируем мобильный: matchMedia говорит, что указатель грубый (тач).
    // В jsdom matchMedia может отсутствовать — задаём мок напрямую.
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      render(<RuneAlphabet runes={[]} />)
      const card = screen.getByRole('button', { name: 'Описание руны Эль' })

      // Первый тап — сияние, модалки нет
      fireEvent.click(card)
      expect(card.className).toContain('rune-alphabet-card-touched')
      expect(screen.queryByRole('dialog')).toBeNull()

      // Второй тап — открывается описание (заглушка, каталог пуст)
      fireEvent.click(card)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('на десктопе клик сразу открывает описание (без промежуточного тапа)', async () => {
    // matchMedia по умолчанию в jsdom: '(pointer: coarse)' не совпадает
    render(<RuneAlphabet runes={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Описание руны Эль' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('сияние скрыто по умолчанию, вспыхивает при hover/тапе, не ловит клики — по App.css', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/App.css'), 'utf8')
    const verseBlock = css.match(/\.rune-alphabet-verse\s*\{[^}]*/)?.[0] || ''
    expect(verseBlock).toContain('opacity: 0')
    expect(verseBlock).toContain('pointer-events: none')
    expect(verseBlock).toContain('position: absolute')
    // hover + клавиатура + тап включают сияние
    expect(css).toContain('.rune-alphabet-card:hover .rune-alphabet-verse')
    expect(css).toContain('.rune-alphabet-card-touched .rune-alphabet-verse')
    // Текст золотой со свечением
    const textBlock = css.match(/\.rune-alphabet-verse-text\s*\{[^}]*/)?.[0] || ''
    expect(textBlock).toContain('color: #FFD700')
    expect(textBlock).toMatch(/text-shadow:[^}]*255, 215, 0/)
  })
})

describe('Рунный алфавит: модалка описания руны', () => {
  // Руна каталога (runes.json) для знака «Эль»: те же имя и файл картинки
  const EL_RUNE: Rune = {
    id: '1',
    name: 'ЭЛЬ',
    image: '23_ЭЛЬ.png',
    graphic: 'Є',
    letter: 'ЭЛЬ',
    description: '<p>Сила Эля</p>',
    textAlign: 'center',
  }

  it('клик по карточке открывает описание (без шапки, с кнопкой «Закрыть»)', async () => {
    render(<RuneAlphabet runes={[EL_RUNE]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Описание руны Эль' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Описание руны Эль')
    // Как в «Рунной раскладке», только без шапки с текстом позиции:
    expect(document.querySelector('.rune-layout-rune-header')).toBeNull()
    // Описание рендерится карточкой RuneCard (имя + текст описания)
    expect(screen.getByText('ЭЛЬ')).toBeInTheDocument()
    expect(screen.getByText('Сила Эля')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('клик по знаку-перевёртышу открывает описание перевёрнутого положения', async () => {
    // Знак «Ва» — перевёрнутое Радо: в каталоге только «РАДО (перевернутое
    // положение)», прямого совпадения по имени «Ва» нет.
    const V_RUNES: Rune[] = [
      {
        id: '2',
        name: 'РАДО (перевернутое положение)',
        image: '08_RADO_p.png',
        graphic: 'В',
        letter: 'В',
        description: '<p>Основание, фундамент.</p>',
        textAlign: 'left',
      },
    ]
    render(<RuneAlphabet runes={V_RUNES} />)

    fireEvent.click(screen.getByRole('button', { name: 'Описание руны Ва' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Описание руны Ва')
    expect(screen.getByText('РАДО (перевернутое положение)')).toBeInTheDocument()
    expect(screen.getByText('Основание, фундамент.')).toBeInTheDocument()
  })

  it('клик по подложке закрывает модалку; без руны в каталоге — заглушка', async () => {
    render(<RuneAlphabet runes={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Описание руны Эль' }))
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByText(/пока не добавлено/)).toBeInTheDocument()

    // Клик по бэкдропу (не по панели) закрывает окно
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('полоса кнопки «Закрыть» — липкая, непрозрачная, кнопка справа кругом 40px', () => {
    // Регресс по скриншоту: карточка заезжала под прозрачную кнопку и казалось,
    // что кнопка лежит на рамке. Теперь кнопка сидит в непрозрачной полосе.
    const barBlock = css.match(/\.rune-alphabet-rune-bar\s*\{[^}]*/)?.[0] || ''
    expect(barBlock).toMatch(/position:\s*sticky/)
    expect(barBlock).toContain('justify-content: flex-end')
    // top = −верхний отступ полосы (−15px на поля панели): sticky держит
    // margin-край у верха скролл-порта — иначе border встаёт ниже и в щель
    // над полосой заезжает прокручиваемый контент (второй скриншот).
    expect(barBlock).toMatch(/top:\s*-15px/)
    expect(barBlock).toContain('margin: -15px -15px 12px -15px')
    expect(barBlock).toContain('background: var(--surface)')
    const darkBarBlock = css.match(/:root\[data-theme="dark"\]\s*\.rune-alphabet-rune-bar\s*\{[^}]*/)?.[0] || ''
    expect(darkBarBlock).toContain('background: var(--modal-bg)')
    const modalBlock = css.match(/\.rune-alphabet-rune-modal\s*\{[^}]*/)?.[0] || ''
    expect(modalBlock).not.toMatch(/display:\s*flex/)
    const closeBlock = css.match(/\.rune-alphabet-rune-close\s*\{[^}]*/)?.[0] || ''
    expect(closeBlock).toContain('width: 40px')
    expect(closeBlock).toContain('min-width: 40px')
    expect(closeBlock).toContain('height: 40px')
    expect(closeBlock).toContain('min-height: 40px')
    expect(closeBlock).not.toMatch(/display:\s*inline-flex/)
  })
})
