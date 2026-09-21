// src/pages/Home.test.tsx
// Тесты шапки главного экрана: логотип run_r виден везде, кроме «Рунной
// раскладки». Подрежим «Новых Рун» хранится в localStorage и остаётся 'layout'
// после возврата в «Словарь» — из-за этого логотип раньше пропадал в Словаре.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Home from './Home'

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
