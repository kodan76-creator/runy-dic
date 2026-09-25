// src/pages/Home.test.tsx
// Тесты шапки главного экрана: логотип run_r виден везде, кроме «Рунной
// раскладки». Подрежим «Новых Рун» хранится в localStorage и остаётся 'layout'
// после возврата в «Словарь» — из-за этого логотип раньше пропадал в Словаре.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Home from './Home'
import { getCategories, getDictionary } from '../githubApi'

// ── Моки: компонент не должен ходить в сеть, к аудио и в IndexedDB ──────────
vi.mock('../githubApi', () => ({
  logoutUser: vi.fn(async () => true),
  getDictionary: vi.fn(async () => ({ data: [], ok: true })),
  logSearch: vi.fn(async () => ({})),
  getCategories: vi.fn(async () => ({ data: [], ok: true })),
  getFavoritesForUser: vi.fn(async () => []),
  updateFavoritesForUser: vi.fn(async () => true),
  collectAudioUrls: vi.fn(() => []),
  collectImageUrls: vi.fn(() => []),
  getRunes: vi.fn(async () => ({ data: [], ok: true })),
  precacheUrls: vi.fn(),
  emailToFolderName: vi.fn((email: string) => String(email).replace(/[@.]/g, '_')),
  getCachedCategories: vi.fn(() => []),
  getCachedRunes: vi.fn(() => []),
  cacheRunesForOffline: vi.fn(),
  flushOfflineChanges: vi.fn(async () => true),
}))

vi.mock('../hooks/useAudioPlayback', () => ({
  useAudioPlayback: () => ({
    isPlaying: false,
    handleListenAll: vi.fn(),
    handleSingleAudio: vi.fn(),
    stopAudio: vi.fn(),
  }),
}))

vi.mock('../hooks/useScrollRestoration', () => ({ useScrollRestoration: vi.fn() }))

// Рунная раскладка в этих тестах не нужна — достаточно заглушки.
vi.mock('../components/RuneLayout', () => ({
  default: () => <div data-testid="rune-layout-stub">Рунная раскладка</div>,
}))

const PAID_USER = { email: 'test8@ya.ru', role: 'user', runesPaid: true }

// Ждём, когда закончится загрузка словаря и отрисуется шапка
async function renderHome() {
  render(<Home user={PAID_USER} onLogout={vi.fn()} onUserUpdate={vi.fn()} />)
  await waitFor(() => expect(document.querySelector('.header')).toBeTruthy())
  return document.querySelector('.header') as HTMLElement
}

beforeEach(() => {
  localStorage.clear()
})

describe('Шапка Home: логотип run_r', () => {
  it('виден в Словаре, если в localStorage остался подрежим layout', async () => {
    localStorage.setItem('home_runes_submode', 'layout')

    const header = await renderHome()

    const logo = screen.getByAltText('Логотип')
    expect(logo).toBeInTheDocument()
    expect(logo.getAttribute('src')).toContain('images/run_r.png')
    expect(header.className).not.toContain('header-layout-mode')
  })

  it('виден в Словаре по умолчанию', async () => {
    await renderHome()
    expect(screen.getByAltText('Логотип')).toBeInTheDocument()
  })

  it('скрыт только в «Новых Рунах» → «Рунная раскладка»', async () => {
    localStorage.setItem('home_view_mode', 'runes')
    localStorage.setItem('home_runes_submode', 'layout')

    const header = await renderHome()

    await waitFor(() => expect(screen.getByTestId('rune-layout-stub')).toBeInTheDocument())
    expect(screen.queryByAltText('Логотип')).toBeNull()
    expect(header.className).toContain('header-layout-mode')
  })

  it('виден в «Новых Рунах» со списком рун', async () => {
    localStorage.setItem('home_view_mode', 'runes')
    localStorage.setItem('home_runes_submode', 'cards')

    await renderHome()

    expect(screen.getByAltText('Логотип')).toBeInTheDocument()
  })
})

describe('Подразделы «Новых Рун»: иконки с текстовыми подписями', () => {
  it('переключатель — иконки 36_ЦЭРЭ и голубя с текстом', async () => {
    localStorage.setItem('home_view_mode', 'runes')
    localStorage.setItem('home_runes_submode', 'cards')

    await renderHome()

    // Кнопки-иконки ищем внутри переключателя подразделов, а не по всему
    // экрану: в шапке есть таб с тем же доступным именем «Новые Руны».
    const toggle = document.querySelector('.runes-sub-toggle')
    expect(toggle).toBeInTheDocument()
    const buttons = toggle ? Array.from(toggle.querySelectorAll('button')) : []
    expect(buttons).toHaveLength(2)
    const [cardsBtn, layoutBtn] = buttons
    expect(cardsBtn.getAttribute('aria-label')).toBe('Новые Руны')
    expect(layoutBtn.getAttribute('aria-label')).toBe('Рунная раскладка')
    expect(cardsBtn.querySelector('img')?.getAttribute('src')).toContain('36_ЦЭРЭ.png')
    expect(layoutBtn.querySelector('img')?.getAttribute('src')).toContain('icon-192.png')
    // У каждой кнопки: иконка + видимая текстовая подпись
    expect(cardsBtn.textContent?.trim()).toBe('Новые Руны')
    expect(layoutBtn.textContent?.trim()).toBe('Рунная раскладка')
  })
})

// ── Лента категорий под шапкой ──────────────────────────────────────────────
// Регресс: в attachCategoryDrag (Home) захват указателя брался сразу на
// pointerdown, поэтому браузер отправлял pointerup в ленту, а click — в
// ближайшего общего предка целей pointerdown/pointerup (Chrome, Яндекс
// Браузер, Safari), т.е. в саму ленту вместо чипа: нажатие на категорию не
// срабатывало. Здесь проверяем, что обычный тап по чипу фильтр включает.
describe('Лента категорий под шапкой: клик по чипу', () => {
  const WORDS: any[] = [
    { id: 1, word: 'Ас', translation: 'бог', category: ['c1'], __dictionarySource: 'shared' },
    { id: 2, word: 'Берёза', translation: 'дерево', category: ['c2'], __dictionarySource: 'shared' },
  ]
  const CATEGORIES: any[] = [
    { id: 'c1', name: 'Боги' },
    { id: 'c2', name: 'Природа' },
  ]

  async function renderCategoryStrip() {
    vi.mocked(getDictionary).mockResolvedValueOnce({ data: WORDS, sha: null, ok: true, exists: true })
    vi.mocked(getCategories).mockResolvedValueOnce({ data: CATEGORIES, sha: null, ok: true, exists: true })

    render(<Home user={PAID_USER} onLogout={vi.fn()} onUserUpdate={vi.fn()} />)
    await waitFor(() => expect(document.querySelector('.category-stats-scroll')).toBeTruthy())
  }

  // Чип ищем по классу и тексту: role="listitem" переопределён у кнопки,
  // поэтому доступное имя из содержимого не вычисляется.
  function findChip(name: string) {
    const chip = Array.from(document.querySelectorAll('.category-stat-chip'))
      .find(el => el.textContent?.includes(name))
    expect(chip).toBeTruthy()
    return chip as HTMLButtonElement
  }

  it('тап по чипу (pointerdown + click без движения) включает фильтр категории', async () => {
    await renderCategoryStrip()

    const chip = findChip('Боги')
    // Тап как в браузере: сначала pointerdown, затем click. Клик не должен
    // «съедаться» подавлением клика после перетаскивания (флаг moved).
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: 'touch' })
    fireEvent.click(chip)

    expect(chip.className).toContain('active')
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    const results = document.querySelector('.results') as HTMLElement
    expect(results.textContent).toContain('Ас')
    expect(results.textContent).not.toContain('Берёза')
  })

  it('повторный тап по тому же чипу снимает фильтр', async () => {
    await renderCategoryStrip()

    const chip = findChip('Боги')
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: 'touch' })
    fireEvent.click(chip)
    fireEvent.pointerDown(chip, { pointerId: 2, pointerType: 'touch' })
    fireEvent.click(chip)

    expect(chip.className).not.toContain('active')
    const results = document.querySelector('.results') as HTMLElement
    expect(results.textContent).toContain('Ас')
    expect(results.textContent).toContain('Берёза')
  })
})
