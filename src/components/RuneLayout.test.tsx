// src/components/RuneLayout.test.tsx
// Тесты «Рунной раскладки»: выбор раскладки (оценка / исцеление) переключает
// модификатор креста, а сама геометрия креста для исцеления описана в App.css —
// её проверяем отдельным блоком (перевёрнутый на 180° крест).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RuneLayout from './RuneLayout'

// ── Моки API: компонент не должен ходить в сеть/IndexedDB в тестах ─────────
vi.mock('../api/images', () => ({
  validateImageFile: vi.fn(async () => {}),
  buildImageUrl: (fileName: string, userFolder: string) => `/images/${userFolder}/${fileName}`,
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

// ── Геометрия креста для исцеления (App.css) ────────────────────────────────
// Координаты читаем из CSS и переводим в единицы размера руны:
// 50% → 0, 50% - S → -1, 50% + S → +1, 50% - 2S → -2.
const AXIS_VALUES: Record<string, number> = {
  '50%': 0,
  'calc(50% - var(--rune-size))': -1,
  'calc(50% + var(--rune-size))': 1,
  'calc(50% - var(--rune-2x))': -2,
  'calc(50% + var(--rune-2x))': 2,
}

function readHealingCells(): Record<number, { x: number; y: number }> {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/App.css'), 'utf8')
  const blockRe = /\.rune-layout-spread\.healing\s+\.rune-layout-spread-item\.pos-(\d)\s*\{([^}]*)\}/g
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
