// src/hooks/useAudioPlayback.test.ts
// Регрессия: карточка словаря молчала для только что записанного/загруженного
// аудио — файл уже в репозитории, но ещё не в собранной версии сайта.
// Теперь при сбое локального URL плеер откатывается на raw.githubusercontent.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayback } from './useAudioPlayback'

vi.mock('../githubApi', () => ({
  logAudioPlay: vi.fn(async () => ({})),
  // Как в src/api/audio.ts: небезопасные символы → «_», точка сохраняется
  emailToFolderName: vi.fn((email: string) =>
    String(email || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')),
}))

// ── Заглушка Audio: в jsdom нет ни декодера, ни событий ended/error ───────────
class MockAudio {
  static instances: MockAudio[] = []
  src: string
  currentTime = 0
  listeners: Record<string, Array<() => void>> = {}

  constructor(src: string) {
    this.src = src
    MockAudio.instances.push(this)
  }
  addEventListener(type: string, cb: () => void) {
    ;(this.listeners[type] ||= []).push(cb)
  }
  pause() { /* нечего останавливать */ }
  play() { return Promise.resolve() }
  emit(type: string) {
    ;(this.listeners[type] || []).forEach(cb => cb())
  }
}

const BASE = import.meta.env.BASE_URL
const RAW = 'https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/audio/'

const renderPlayback = (user: { email: string } | null = null) =>
  renderHook(() => useAudioPlayback({ user, words: [], playMode: 'order' }))

describe('useAudioPlayback: прослушивание из карточки словаря', () => {
  beforeEach(() => {
    MockAudio.instances = []
    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('сначала играет файл из собранного сайта', () => {
    const { result } = renderPlayback()

    act(() => { void result.current.handleSingleAudio('sun_runy.webm', false) })

    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0].src).toBe(`${BASE}audio/sun_runy.webm`)
  })

  it('файла ещё нет в сборке — откатывается на raw.githubusercontent', async () => {
    const { result } = renderPlayback()
    let done: Promise<void> | undefined
    act(() => { done = result.current.handleSingleAudio('sun_runy.webm', false) })

    // Локальный URL не найден (404): файл записан, но сайт ещё не пересобран
    act(() => { MockAudio.instances[0].emit('error') })

    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[1].src).toBe(`${RAW}sun_runy.webm`)

    act(() => { MockAudio.instances[1].emit('ended') })
    await act(async () => { await done })
  })

  it('личный словарь: и основной, и резервный URL содержат папку пользователя', () => {
    const { result } = renderPlayback({ email: 'user@example.com' })

    act(() => { void result.current.handleSingleAudio('sun_runy.webm', true) })
    expect(MockAudio.instances[0].src).toBe(`${BASE}audio/user_example.com/sun_runy.webm`)

    act(() => { MockAudio.instances[0].emit('error') })
    expect(MockAudio.instances[1].src).toBe(`${RAW}user_example.com/sun_runy.webm`)
  })

  it('«Стоп» отменяет откат на raw — аудио не доигрывает после остановки', async () => {
    const { result } = renderPlayback()
    let done: Promise<void> | undefined
    act(() => { done = result.current.handleSingleAudio('sun_runy.webm', false) })

    act(() => { result.current.stopAudio() })
    act(() => { MockAudio.instances[0].emit('error') })

    expect(MockAudio.instances).toHaveLength(1)
    await act(async () => { await done })
  })

  it('пустое имя файла не создаёт плеер', () => {
    const { result } = renderPlayback()

    act(() => { void result.current.handleSingleAudio('', false) })

    expect(MockAudio.instances).toHaveLength(0)
  })
})
