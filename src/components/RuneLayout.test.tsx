// src/components/RuneLayout.test.tsx
// Тесты «Рунной раскладки»: выбор раскладки (оценка / исцеление) переключает
// модификатор креста, а сама геометрия креста для исцеления описана в App.css —
// её проверяем отдельным блоком (перевёрнутый на 180° крест).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import RuneLayout from './RuneLayout'

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
// ширины эллипса (3 × 18cqh = 0.81 ширины), что и на десктопе.
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
    expect(rule).toBe('min(18cqh, 33.333cqw)')
  })

  it('крест занимает ~81% ширины эллипса на любом размере экрана', () => {
    const cqh = Number(/([\d.]+)cqh/.exec(readRuneSizeRule())?.[1])
    const { hOverW } = readEllipseFit()
    // 3 руны по ширине / ширина эллипса (18cqh = 18% высоты = 0.18 × 1.5 ширины)
    const crossWidthShare = (3 * (cqh / 100) * hOverW) / 1
    expect(crossWidthShare).toBeCloseTo(0.81, 5)
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
