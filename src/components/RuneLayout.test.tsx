// src/components/RuneLayout.test.tsx
// Тесты «Рунной раскладки»: выбор раскладки (оценка / исцеление) переключает
// модификатор креста, а сама геометрия креста для исцеления описана в App.css —
// её проверяем отдельным блоком (перевёрнутый на 180° крест).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import RuneLayout from './RuneLayout'
import { listRuneLayoutImages } from '../api/images'
import { EVALUATION_POSITION_LABELS, HEALING_POSITION_LABELS, getPositionLabel } from './runeLayoutTexts'

// ── Моки API: компонент не должен ходить в сеть/IndexedDB в тестах ─────────
vi.mock('../api/images', () => ({
  validateImageFile: vi.fn(async () => {}),
  buildImageUrl: (fileName: string, userFolder: string) => `/images/${userFolder}/${fileName}`,
  collectRuneLayoutImageUrls: (names: string[]) =>
    names.map(name => `/images/n_runy/runy/${name}`),
  listRuneLayoutImages: vi.fn(async () => [
    '1_ФАИС-СУ.png', '3_ОРС.png', '5_ТУРЗ.png', '6_АЗ.png',
    '7_РАДО.png', '9_АЛУ.png', '10_ХЕБО.png',
  ]),
  selectRandomRunes: (files: string[], count: number) => files.slice(0, count),
}))

vi.mock('../api/auth', () => ({
  saveRuneLayoutType: vi.fn(async (_email: string, type: string) => ({ runeLayoutType: type })),
}))

vi.mock('../api/audio', () => ({
  emailToFolderName: (email: string) => email.replace(/[@.]/g, '_'),
  // Прогрев кэша картинок: в тестах ничего не отправляем, но вызывать можно
  precacheUrls: vi.fn(() => false),
}))

vi.mock('../api/photoCache', () => ({
  cachePhotoBlob: vi.fn(async () => {}),
  getCachedPhotoBlob: vi.fn(async () => null),
  processPhotoToEllipse: vi.fn(async () => new Blob(['photo'], { type: 'image/jpeg' })),
  saveLayoutState: vi.fn(),
  loadLayoutState: vi.fn(() => null),
  clearLayoutState: vi.fn(),
}))

vi.mock('../api/runes', () => ({
  getRunes: vi.fn(async () => ({ data: [], sha: null, ok: true, exists: true })),
}))

vi.mock('../api/offline', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    cacheRuneLayoutImageList: vi.fn(),
    getCachedRuneLayoutImageList: vi.fn(() => null),
    isRuneLayoutPrecached: vi.fn(() => true),
    markRuneLayoutPrecached: vi.fn(),
    cacheRunesForOffline: vi.fn(),
    getCachedRunes: vi.fn(() => [
      {
        name: 'ФАИС-СУ',
        image: '01.png',
        power: 'Гармония стихий в человеке использует духовную энергию',
        keywords: 'Состояние, состоятельность',
        description: '<p>Собственностью человека может стать лишь творчество его духа.</p>',
      },
      {
        name: 'ФАИС-СУ (перевернутое положение)',
        image: '',
        power: 'Росток пробивается из опыта',
        keywords: 'Росток, опыт',
        description: '<p>Перевёрнутое положение показывает необходимость обращения к опыту.</p>',
      },
    ]),
  }
})

const TEST_USER = { email: 'test@example.com', fullBodyPhoto: 'photo.jpg' }

beforeEach(() => {
  // jsdom не реализует blob-URL — подменяем, чтобы фиксация фото не падала
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:mock') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  // Крест запоминается в localStorage — чистим между тестами, иначе второй
  // тест увидит крест первого и не найдёт кнопку «Зафиксировать»
  localStorage.clear()
})

// Пройти путь: фото → «Зафиксировать» → выбор раскладки → нажать кнопку раскладки.
async function chooseLayout(buttonText: string) {
  render(<RuneLayout user={TEST_USER} onUserUpdate={vi.fn()} />)
  fireEvent.click(screen.getByTitle('Зафиксировать текущую позицию и размер фото'))
  fireEvent.click(await screen.findByText(buttonText))
  return screen.findByLabelText('Раскладка Новых Рун')
}

describe('RuneLayout — выбор типа раскладки', () => {
  it('«Раскладка Новых Рун для исцеления» добавляет кресту класс healing', async () => {
    const spread = await chooseLayout('Раскладка Новых Рун для исцеления')
    expect(spread).toHaveClass('rune-layout-spread')
    expect(spread).toHaveClass('healing')
    // Семь рун с классами позиций pos-1 … pos-7
    expect(spread.querySelectorAll('.rune-layout-spread-item')).toHaveLength(7)
    for (let n = 1; n <= 7; n += 1) {
      expect(spread.querySelector(`.rune-layout-spread-item.pos-${n}`)).not.toBeNull()
    }
  })

  it('«Раскладка Новых Рун для оценки…» оставляет исходный крест (без healing)', async () => {
    const spread = await chooseLayout(
      'Раскладка Новых Рун для оценки Пути Духовного развития или ситуации явления'
    )
    expect(spread).toHaveClass('rune-layout-spread')
    expect(spread).not.toHaveClass('healing')
  })
})

describe('RuneLayout — крест переживает перезагрузку (localStorage)', () => {
  it('после выбора раскладки тип и 7 рун сохранены в localStorage', async () => {
    await chooseLayout('Раскладка Новых Рун для исцеления')
    const raw = localStorage.getItem(`rune_spread:${TEST_USER.email}`)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.type).toBe('healing')
    expect(parsed.runes).toHaveLength(7)
  })

  it('после перезагрузки крест показывается сразу, без повторного выбора', async () => {
    await chooseLayout('Раскладка Новых Рун для исцеления')
    // «Перезагрузка»: чистый рендер только из localStorage (прошлый размонтирован)
    cleanup()
    render(<RuneLayout user={TEST_USER} onUserUpdate={vi.fn()} />)
    const spread = await screen.findByLabelText('Раскладка Новых Рун')
    expect(spread).toHaveClass('healing')
    expect(spread.querySelectorAll('.rune-layout-spread-item')).toHaveLength(7)
  })
})

// ── Геометрия креста для исцеления (App.css) ───────────────────────────────
// Координаты читаем из CSS и переводим в единицы размера руны:
// 50% → 0, 50% - S → -1, 50% + S → +1, 50% - 2S → -2.
const AXIS_VALUES: Record<string, number> = {
  '50%': 0,
  'calc(50% - var(--rune-size))': -1,
  'calc(50% + var(--rune-size))': 1,
  'calc(50% - var(--rune-2x))': -2,
  'calc(50% + var(--rune-2x))': 2,
}

const APP_CSS_PATH = path.resolve(process.cwd(), 'src/App.css')
const readAppCss = () => fs.readFileSync(APP_CSS_PATH, 'utf8')

function readCells(blockRe: RegExp): Record<number, { x: number; y: number }> {
  const css = readAppCss()
  const cells: Record<number, { x: number; y: number }> = {}
  for (const match of css.matchAll(blockRe)) {
    const declarations = match[2]
    const left = /left:\s*([^;]+);/.exec(declarations)?.[1]?.trim()
    const top = /top:\s*([^;]+);/.exec(declarations)?.[1]?.trim()
    expect(left, `pos-${match[1]}: не найдено значение left`).toBeTruthy()
    expect(top, `pos-${match[1]}: не найдено значение top`).toBeTruthy()
    const x = AXIS_VALUES[left as string]
    const y = AXIS_VALUES[top as string]
    expect(x, `pos-${match[1]}: неизвестное значение left «${left}»`).toBeDefined()
    expect(y, `pos-${match[1]}: неизвестное значение top «${top}»`).toBeDefined()
    cells[Number(match[1])] = { x, y }
  }
  return cells
}

const readHealingCells = () =>
  readCells(/\.rune-layout-spread\.healing\s+\.rune-layout-spread-item\.pos-(\d)\s*\{([^}]*)\}/g)

describe('RuneLayout — модалка руны по клику', () => {
  it('клик по плитке креста открывает карточку руны из раздела «Новые руны»', async () => {
    const spread = await chooseLayout('Раскладка Новых Рун для исцеления')
    // Плитки креста — кнопки (кликабельны)
    const tile = spread.querySelector('.rune-layout-spread-item.pos-1') as HTMLElement
    expect(tile.tagName).toBe('BUTTON')
    // ФАИС-СУ — прямое положение: модалка показывает поля карточки
    fireEvent.click(tile)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('ФАИС-СУ')
    // «Описание Силы Руны» из модалки убрано (hidePower у RuneCard)
    expect(dialog.textContent).not.toContain('Гармония стихий в человеке использует духовную энергию')
    // «Отображение Силы Руны» тоже убрано — картинок в диалоге нет вовсе
    expect(dialog.textContent).not.toContain('Отображение Силы Руны')
    expect(dialog.querySelector('img')).toBeNull()
    // Шапка: смысл позиции 1 раскладки «для исцеления»
    expect(dialog.textContent).toContain('Руна 1 - ПРЕДЕЛ или ПОТОЛОК вашего сознания.')
    expect(dialog.textContent).toContain('Состояние, состоятельность')
    expect(dialog.textContent).toContain('Собственностью человека может стать лишь творчество его духа.')
    // Закрытие (кнопка ✕ в закреплённой шапке)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('клик по перевёрнутой руне (_П) показывает карточку «перевёрнутого положения»', async () => {
    // Подменяем список раскладки: первая руна — перевёрнутая «2_ФАИС-СУ_П.png»
    vi.mocked(listRuneLayoutImages).mockResolvedValueOnce([
      '2_ФАИС-СУ_П.png', '3_ОРС.png', '5_ТУРЗ.png', '6_АЗ.png',
      '7_РАДО.png', '9_АЛУ.png', '10_ХЕБО.png',
    ])
    const spread = await chooseLayout('Раскладка Новых Рун для исцеления')
    const tile = spread.querySelector('.rune-layout-spread-item.pos-1') as HTMLElement
    fireEvent.click(tile)
    const dialog = await screen.findByRole('dialog')
    // Карточка именно перевёрнутого положения, а не прямой руны
    expect(dialog.textContent).toContain('перевернутое положение')
    // «Описание Силы Руны» скрыто и для перевёрнутой руны (hidePower)
    expect(dialog.textContent).not.toContain('Росток пробивается из опыта')
    expect(dialog.textContent).not.toContain('Отображение Силы Руны')
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.textContent).toContain('Перевёрнутое положение показывает необходимость обращения к опыту.')
    // Кнопка закрытия — в шапке модалки (внутри .rune-layout-rune-header)
    const header = dialog.querySelector('.rune-layout-rune-header')
    expect(header).not.toBeNull()
    expect(header!.querySelector('button')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('RuneLayout — шапка позиции в модалке', () => {
  it('тексты всех 7 позиций заданы для обеих раскладок и без кавычек', () => {
    expect(EVALUATION_POSITION_LABELS).toHaveLength(7)
    expect(HEALING_POSITION_LABELS).toHaveLength(7)
    for (const t of [...EVALUATION_POSITION_LABELS, ...HEALING_POSITION_LABELS]) {
      expect(t.trim().length).toBeGreaterThan(0)
      // Текст-шапка задаётся «без ковычек»
      expect(t).not.toMatch(/[«»"]/)
    }
  })

  it('getPositionLabel отдаёт текст по раскладке и позиции', () => {
    expect(getPositionLabel('evaluation', 1)).toBe(EVALUATION_POSITION_LABELS[0])
    expect(getPositionLabel('healing', 1)).toBe(HEALING_POSITION_LABELS[0])
    expect(getPositionLabel('healing', 7)).toContain('ЛЮБВИ')
    expect(getPositionLabel('evaluation', 8)).toBe('')
  })

  it('в оценке шапка отвечает смыслу позиции (1 — ПРОШЛОЕ, 7 — БУДУЩЕЕ)', async () => {
    const spread = await chooseLayout(
      'Раскладка Новых Рун для оценки Пути Духовного развития или ситуации явления'
    )
    fireEvent.click(spread.querySelector('.rune-layout-spread-item.pos-1') as HTMLElement)
    let dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain(
      'Руна 1 - ПРОШЛОЕ. Основная характеристика того, что привело вас (ситуацию, явление) в нынешнее состояние.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Руна 7 той же раскладки — своя шапка
    fireEvent.click(spread.querySelector('.rune-layout-spread-item.pos-7') as HTMLElement)
    dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Руна 7 - БУДУЩЕЕ при исполнении всех условий.')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('в исцелении шапка позиции другая (7 — любовь для исцеления души, не БУДУЩЕЕ)', async () => {
    const spread = await chooseLayout('Раскладка Новых Рун для исцеления')
    fireEvent.click(spread.querySelector('.rune-layout-spread-item.pos-7') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Руна 7 - Требуемые проявления ЛЮБВИ для исцеления души.')
    expect(dialog.textContent).not.toContain('БУДУЩЕЕ при исполнении всех условий')
  })

  it('шапка позиции закреплена (sticky) и выделена цветом — по App.css', () => {
    const css = readAppCss()
    const headerBlock = /\.rune-layout-rune-header\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(headerBlock, 'App.css: нет стиля закреплённой шапки .rune-layout-rune-header').not.toBe('')
    // Закрепление при прокрутке контента
    expect(headerBlock).toMatch(/position:\s*sticky/)
    expect(headerBlock).toMatch(/top:\s*0/)
    // Шапка выделена цветом: свой фон + заметная нижняя граница
    expect(headerBlock).toMatch(/background:\s*linear-gradient/)
    expect(headerBlock).toMatch(/border-bottom:\s*2px solid #ffd700/)
  })
})

describe('RuneLayout — белый фон вместо фото', () => {
  it('кнопка «Белый фон» переключает режим и сохраняет выбор в localStorage', async () => {
    render(<RuneLayout user={TEST_USER} onUserUpdate={vi.fn()} />)
    // Пользователь с фото: режим включается кнопкой в панели редактирования
    const toggle = screen.getByRole('button', { name: /Белый фон/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    // После перерендера элемент пересоздаётся — запрашиваем заново
    const toggleOn = screen.getByRole('button', { name: /Белый фон/ })
    expect(toggleOn).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(`rune_layout_white_bg:${TEST_USER.email}`)).toBe('1')
    // Фото скрыто, эллипс получил класс white-bg
    expect(screen.queryByAltText('Ваше фото во весь рост')).toBeNull()
    expect(document.querySelector('.rune-layout-ellipse.white-bg')).not.toBeNull()
    // Повторный клик возвращает фото
    fireEvent.click(toggleOn)
    expect(screen.getByRole('button', { name: /Белый фон/ })).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem(`rune_layout_white_bg:${TEST_USER.email}`)).toBeNull()
    expect(screen.getByAltText('Ваше фото во весь рост')).toBeTruthy()
    cleanup()
  })

  it('выбор переживает перезагрузку: белый фон без фото, раскладка работает', async () => {
    localStorage.setItem(`rune_layout_white_bg:${TEST_USER.email}`, '1')
    render(<RuneLayout user={TEST_USER} onUserUpdate={vi.fn()} />)
    // Фото не показано, эллипс белый
    expect(screen.queryByAltText('Ваше фото во весь рост')).toBeNull()
    expect(document.querySelector('.rune-layout-ellipse.white-bg')).not.toBeNull()
    // Фиксация белого фона открывает выбор раскладки, руны ложатся на белый фон
    fireEvent.click(screen.getByRole('button', { name: /Зафиксировать/ }))
    fireEvent.click(await screen.findByText('Раскладка Новых Рун для исцеления'))
    const spread = await screen.findByLabelText('Раскладка Новых Рун')
    expect(spread.querySelectorAll('.rune-layout-spread-item')).toHaveLength(7)
    expect(document.querySelector('.rune-layout-ellipse.white-bg')).not.toBeNull()
    cleanup()
  })

  it('белый фон доступен и без загруженного фото (пустое состояние)', () => {
    render(<RuneLayout user={{ email: TEST_USER.email }} onUserUpdate={vi.fn()} />)
    expect(screen.queryByAltText('Ваше фото во весь рост')).toBeNull()
    // Кнопка в пустом состоянии сразу включает белый фон
    fireEvent.click(screen.getByRole('button', { name: /Белый фон/ }))
    expect(document.querySelector('.rune-layout-ellipse.white-bg')).not.toBeNull()
    expect(localStorage.getItem(`rune_layout_white_bg:${TEST_USER.email}`)).toBe('1')
    cleanup()
  })
})

describe('Раскладка для исцеления — крест перевёрнут на 180° (App.css)', () => {
  it('описаны все 7 позиций (и они не накладываются друг на друга)', () => {
    const cells = readHealingCells()
    expect(Object.keys(cells).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
    const unique = new Set(Object.values(cells).map(c => `${c.x}:${c.y}`))
    expect(unique.size).toBe(7)
  })

  it('соблюдены примыкания сторон 1–7 из задания', () => {
    const { 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7 } = readHealingCells()

    // 1 — левой стороной к правой стороне 2 (1 справа от 2, в том же ряду)
    expect({ x: r1.x, y: r1.y }).toEqual({ x: r2.x + 1, y: r2.y })
    // 2 — нижней стороной к верхней стороне 3 (3 под 2)
    expect({ x: r3.x, y: r3.y }).toEqual({ x: r2.x, y: r2.y + 1 })
    // 3 — нижней стороной к верхней стороне 4 (4 под 3)
    expect({ x: r4.x, y: r4.y }).toEqual({ x: r3.x, y: r3.y + 1 })
    // 4 — нижней стороной к верхней стороне 5 (5 под 4)
    expect({ x: r5.x, y: r5.y }).toEqual({ x: r4.x, y: r4.y + 1 })
    // 6 — правой стороной к левой стороне 4 (6 слева от 4, в том же ряду)
    expect({ x: r6.x, y: r6.y }).toEqual({ x: r4.x - 1, y: r4.y })
    // 7 — левой стороной к правой стороне 4 (7 справа от 4, в том же ряду)
    expect({ x: r7.x, y: r7.y }).toEqual({ x: r4.x + 1, y: r4.y })
  })
})

// ── Крест не должен пересекать линию эллипса ────────────────────────────────
// Эллипс задан как aspect-ratio 2/3 (высота = 1.5 × ширины W) и вписан в свой
// бокс: полуоси в единицах ширины — a = 0.5, b = 0.5 × (H/W). Размер руны
// ограничен `18cqh` (cqh = высота эллипса), т.е. в худшем случае
// S = 0.18 × (H/W) × W. Проверяем, что каждый угол каждого из 7
// прямоугольников лежит внутри эллипса: (X/a)² + (Y/b)² ≤ 1.
function readEllipseFit() {
  const css = readAppCss()
  const ellipseBlock = /\.rune-layout-ellipse\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const ar = /aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(ellipseBlock)
  expect(ar, 'App.css: у .rune-layout-ellipse не найден aspect-ratio').not.toBeNull()
  const spreadBlock = /\.rune-layout-spread\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const cqh = /([\d.]+)cqh/.exec(spreadBlock)
  expect(cqh, 'App.css: у .rune-layout-spread не найден предел размера руны в cqh').not.toBeNull()
  const hOverW = Number(ar![2]) / Number(ar![1])
  return { hOverW, runeOverW: (Number(cqh![1]) / 100) * hOverW }
}

/** Список углов прямоугольников, вылезающих за эллипс (пустой — всё внутри). */
function cornersOutsideEllipse(cells: Record<number, { x: number; y: number }>) {
  const { hOverW, runeOverW: s } = readEllipseFit()
  const a = 0.5
  const b = 0.5 * hOverW
  const violations: string[] = []
  for (const [rune, cell] of Object.entries(cells)) {
    for (const dx of [-0.5, 0.5]) {
      for (const dy of [-0.5, 0.5]) {
        const X = (cell.x + dx) * s
        const Y = (cell.y + dy) * s
        const value = (X / a) ** 2 + (Y / b) ** 2
        if (value > 1) {
          violations.push(`руна ${rune}, угол (${X.toFixed(3)}; ${Y.toFixed(3)}): ${value.toFixed(3)} > 1`)
        }
      }
    }
  }
  return violations
}

describe('Крест не пересекает линию эллипса (App.css)', () => {
  it('параметры эллипса и размера руны читаются из CSS', () => {
    const { hOverW, runeOverW } = readEllipseFit()
    expect(hOverW).toBeGreaterThan(1) // вертикальный эллипс 2:3
    expect(runeOverW).toBeLessThan(1 / 3) // 3 колонки креста помещаются по ширине
  })

  it('раскладка для исцеления целиком внутри эллипса', () => {
    expect(cornersOutsideEllipse(readHealingCells())).toEqual([])
  })

  it('раскладка для оценки целиком внутри эллипса', () => {
    const cells = readCells(/(?<!\.healing )\.rune-layout-spread-item\.pos-(\d)\s*\{([^}]*)\}/g)
    expect(Object.keys(cells)).toHaveLength(7)
    expect(cornersOutsideEllipse(cells)).toEqual([])
  })
})

// ── Мобильная версия: крест ближе к линии эллипса (App.css) ─────────────────
// Раньше размер руны начинался с clamp(52px, …): на мобильных эллипс
// маленький, а 52px-минимум держал крест далеко от его линии. Теперь размер
// руны зависит только от размеров эллипса, поэтому крест занимает ту же долю
// ширины эллипса (3 × 18.4cqh ≈ 0.828 ширины), что и на десктопе.
function readRuneSizeRule() {
  const css = readAppCss()
  const block = /\.rune-layout-spread\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const rule = /--rune-size:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? ''
  expect(rule, 'App.css: не найдено правило --rune-size').not.toBe('')
  return rule
}

function readEllipseWidthRules() {
  return [...readAppCss().matchAll(/\.rune-layout-ellipse\s*\{([^}]*)\}/g)]
    .map(m => /width:\s*([^;]+);/.exec(m[1])?.[1]?.trim())
    .filter((v): v is string => Boolean(v))
}

describe('Размер креста и эллипса — мобильные и десктоп (App.css)', () => {
  it('размер руны задан только в единицах эллипса (без px-минимума)', () => {
    const rule = readRuneSizeRule()
    expect(rule).not.toMatch(/px/)
    expect(rule).not.toMatch(/clamp\(/)
    expect(rule).toBe('min(18.4cqh, 33.333cqw)')
  })

  it('крест занимает ~83% ширины эллипса на любом размере экрана', () => {
    const cqh = Number(/([\d.]+)cqh/.exec(readRuneSizeRule())?.[1])
    const { hOverW } = readEllipseFit()
    // 3 руны по ширине / ширина эллипса (18.4cqh = 18.4% высоты = 0.184 × 1.5 ширины)
    const crossWidthShare = (3 * (cqh / 100) * hOverW) / 1
    expect(crossWidthShare).toBeCloseTo(0.828, 5)
  })

  it('рисунок руны увеличен внутри плитки (78% вместо прежних 70%)', () => {
    const blocks = [...readAppCss().matchAll(/\.rune-layout-spread-item img\s*\{([^}]*)\}/g)].map(m => m[1])
    expect(blocks.some(b => b.includes('width: 78%'))).toBe(true)
  })

  it('эллипс масштабируется под свою сцену (только cqw/cqh, без px/vw/vh)', () => {
    const widths = readEllipseWidthRules()
    expect(widths.length).toBeGreaterThan(0)
    for (const width of widths) {
      expect(width, `ширина эллипса должна считаться от сцены: ${width}`).toMatch(/cqw|cqh/)
      expect(width, `в ширине эллипса не должно быть px/vw/vh: ${width}`).not.toMatch(/px|vw|vh/)
    }
  })
})

// ── Словарь: подпись сортировки «руны-графика» исправлена на «Руны» ─────────
describe('Словарь — подпись сортировки рун', () => {
  it('радиокнопка сортировки подписана «Руны», а не «руны-графика»', () => {
    const home = fs.readFileSync(
      path.resolve(__dirname, '../pages/Home.tsx'),
      'utf8',
    )
    expect(home).not.toMatch(/руны-графика/)
    expect(home).toMatch(/>\s*Руны\s*<\/label>/)
  })
})
