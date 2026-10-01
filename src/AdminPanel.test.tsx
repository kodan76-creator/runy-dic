// src/AdminPanel.test.tsx
// Регрессия: активная вкладка админки хранится в общем ключе localStorage
// (admin_active_tab). Раньше админ открывал «Пользователи», разлогинился —
// и обычный пользователь видел остатки секции (заголовок «Пользователи (0)»,
// поиск, фильтры, «Пользователи не найдены»), хотя кнопки вкладок ему скрыты.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import AdminPanel from './AdminPanel'
import { getDictionary, getCategories, addWord } from './githubApi'

// ── Моки: панель не должна ходить в сеть и в кэши ────────────────────────────
vi.mock('./githubApi', () => {
  const dictResponse = async () => ({ data: [], ok: true })
  return {
    verifyAdmin: vi.fn(async () => null),
    verifyUser: vi.fn(async () => null),
    getDictionary: vi.fn(dictResponse),
    addWord: vi.fn(async () => ({})),
    updateWord: vi.fn(async () => ({})),
    deleteWord: vi.fn(async () => ({})),
    moveWordUp: vi.fn(async () => ({})),
    moveWordDown: vi.fn(async () => ({})),
    moveWordToTop: vi.fn(async () => ({})),
    moveWordToBottom: vi.fn(async () => ({})),
    moveWordToPosition: vi.fn(async () => ({})),
    getUsers: vi.fn(async () => []),
    updateUser: vi.fn(async () => ({})),
    blockUser: vi.fn(async () => ({})),
    unblockUser: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => ({ moved: 0 })),
    logoutAllDevices: vi.fn(async () => ({})),
    unbindDevice: vi.fn(async () => ({})),
    getLogs: vi.fn(async () => []),
    clearLogs: vi.fn(async () => ({})),
    getCategories: vi.fn(dictResponse),
    addCategory: vi.fn(async () => ({})),
    updateCategory: vi.fn(async () => ({})),
    deleteCategory: vi.fn(async () => ({})),
    moveCategoryUp: vi.fn(async () => ({})),
    moveCategoryDown: vi.fn(async () => ({})),
    moveCategoryToTop: vi.fn(async () => ({})),
    addPersonalCategory: vi.fn(async () => ({ id: 'u1', name: 'Моя' })),
    deletePersonalCategory: vi.fn(async () => true),
    getRunes: vi.fn(dictResponse),
    addRune: vi.fn(async () => ({})),
    updateRune: vi.fn(async () => ({})),
    deleteRune: vi.fn(async () => ({})),
    moveRuneUp: vi.fn(async () => ({})),
    moveRuneDown: vi.fn(async () => ({})),
    moveRuneToTop: vi.fn(async () => ({})),
    moveRuneToEnd: vi.fn(async () => ({})),
    ensureUserDictionaryFile: vi.fn(async () => ({})),
    uploadAudioFile: vi.fn(async () => ({})),
    deleteAudioFile: vi.fn(async () => ({})),
    uploadImageFile: vi.fn(async () => ({})),
    deleteImageFile: vi.fn(async () => ({})),
    buildImageUrl: vi.fn((file: string, folder?: string) => (folder ? `${folder}/${file}` : file)),
    migrateAllFiles: vi.fn(async () => []),
    checkFilesEncryptionStatus: vi.fn(async () => []),
    decryptFiles: vi.fn(async () => []),
    encryptFiles: vi.fn(async () => []),
    emailToFolderName: vi.fn((email: string) => String(email).replace(/[@.]/g, '_')),
    importDictionary: vi.fn(async () => 0),
    humanizeImportError: vi.fn((e: unknown) => String((e as Error)?.message ?? e)),
    normalizeImportIds: vi.fn((arr: unknown) => arr),
    removeCategoryFromAllWords: vi.fn(async () => 0),
    flushOfflineChanges: vi.fn(async () => 0),
    collectAudioUrls: vi.fn(() => []),
    precacheUrls: vi.fn(),
  }
})

vi.mock('./api/offline', () => ({
  isOnline: vi.fn(() => true),
  cacheDictionaryForOffline: vi.fn(),
  getCachedDictionary: vi.fn(() => undefined),
  getCachedCategories: vi.fn(() => undefined),
  getCachedRunes: vi.fn(() => undefined),
  cacheRunesForOffline: vi.fn(),
}))

vi.mock('./hooks/useScrollRestoration', () => ({ useScrollRestoration: vi.fn() }))

describe('AdminPanel: активная вкладка и restricted-пользователь', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('обычному пользователю не показываются «остатки» секции «Пользователи» из-под админа', async () => {
    // Админ оставил открытой вкладку «Пользователи» и разлогинился
    localStorage.setItem('admin_active_tab', 'users')

    render(
      <AdminPanel
        currentUser={{ email: 'user@example.com', role: 'user' }}
        onAdminLogin={vi.fn()}
        onAdminLogout={vi.fn()}
      />,
    )

    // Секция «Пользователи» не отрисована: ни заголовка, ни поиска, ни фильтров
    expect(screen.queryByRole('heading', { name: /Пользователи \(/ })).toBeNull()
    expect(screen.queryByPlaceholderText('Поиск пользователя...')).toBeNull()
    expect(screen.queryByText('Пользователи не найдены')).toBeNull()
    // Кнопки чужих вкладок тоже нет
    expect(screen.queryByRole('button', { name: /Пользователи/ })).toBeNull()
    // Открыт «Словарь» — единственная доступная restricted-пользователю вкладка
    expect(screen.getByRole('button', { name: /Словарь/ })).toHaveClass('active')

    // Хранилище перезаписано: следующий вход откроет словарь
    await waitFor(() => expect(localStorage.getItem('admin_active_tab')).toBe('dictionary'))
  })

  it('админу сохранённая вкладка «Пользователи» продолжает открываться', async () => {
    localStorage.setItem('admin_active_tab', 'users')
    localStorage.setItem('adminUser', JSON.stringify({ email: 'admin@example.com', role: 'admin' }))

    render(
      <AdminPanel
        currentUser={null}
        onAdminLogin={vi.fn()}
        onAdminLogout={vi.fn()}
      />,
    )

    expect(await screen.findByRole('button', { name: /Пользователи/ })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /Пользователи \(/ })).toBeInTheDocument()
    expect(localStorage.getItem('admin_active_tab')).toBe('users')
  })
})

// ── Заглушка Audio: jsdom не декодирует медиа и не шлёт error/ended ──────────
class MockAudio {
  static instances: MockAudio[] = []
  src: string
  currentTime = 0
  paused = false
  listeners: Record<string, Array<() => void>> = {}

  constructor(src: string) {
    this.src = src
    MockAudio.instances.push(this)
  }
  addEventListener(type: string, cb: () => void) {
    ;(this.listeners[type] ||= []).push(cb)
  }
  pause() { this.paused = true }
  play() { this.paused = false; return Promise.resolve() }
  emit(type: string) {
    ;(this.listeners[type] || []).forEach(cb => cb())
  }
}

describe('AdminPanel: повторное нажатие ▶️ не задваивает звук', () => {
  beforeEach(() => {
    localStorage.clear()
    MockAudio.instances = []
    vi.stubGlobal('Audio', MockAudio)
    // Словарь с аудио — в сетке появляется карточка слова с кнопкой ▶️
    vi.mocked(getDictionary).mockResolvedValue({
      data: [{ id: 1, word: 'sun', translation: 'солнце', audio: 'sun_runy.webm' }],
      sha: null,
      ok: true,
      exists: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Пустой словарь — как в значении по умолчанию из фабрики мока
    vi.mocked(getDictionary).mockResolvedValue({ data: [], sha: null, ok: true, exists: true })
  })

  const renderPanel = () => render(
    <AdminPanel
      currentUser={{ email: 'user@example.com', role: 'user' }}
      onAdminLogin={vi.fn()}
      onAdminLogout={vi.fn()}
    />,
  )

  it('повторное ▶️ останавливает предыдущее воспроизведение', async () => {
    renderPanel()
    const btn = await screen.findByTitle('Воспроизвести')

    fireEvent.click(btn)
    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0].paused).toBe(false)

    fireEvent.click(btn)
    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[0].paused).toBe(true)
    expect(MockAudio.instances[1].paused).toBe(false)
  })

  it('запоздавший сбой первой попытки не поднимает второй плеер', async () => {
    renderPanel()
    const btn = await screen.findByTitle('Воспроизвести')

    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(MockAudio.instances).toHaveLength(2)

    // Первая попытка «падает» уже после повторного нажатия (404 на локальный URL)
    act(() => { MockAudio.instances[0].emit('error') })

    // Без токена попытки запоздавший откат на raw создавал бы третий плеер —
    // два источника звучали бы одновременно (задвоенный звук)
    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[1].paused).toBe(false)
  })

  it('error и отклонённый play() дают один откат на raw', async () => {
    renderPanel()
    const btn = await screen.findByTitle('Воспроизвести')

    fireEvent.click(btn)
    act(() => { MockAudio.instances[0].emit('error') })

    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[1].src).toContain('raw.githubusercontent.com')

    // Второй сигнал той же попытки: в браузере error и play() падают вместе
    act(() => { MockAudio.instances[0].emit('error') })
    expect(MockAudio.instances).toHaveLength(2)
  })
})

// ── Предупреждения формы словаря не должны залипать ─────────────────────────
// Регресс: «Такая категория уже есть» из проверки своей категории попадала в
// постоянный баннер error внизу формы и не гасла — ни при вводе нового текста,
// ни при «Отмене», ни при открытии другой карточки (только submit/перезагрузка).
// Теперь дубликат показывается временным тостом, а баннер формы самоустраняется.
describe('AdminPanel: предупреждения формы не висят вечно', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('дубликат своей категории — временный тост, постоянный баннер не появляется', async () => {
    vi.mocked(getCategories).mockResolvedValueOnce({ data: [{ id: 'c1', name: 'Молитва' }], sha: null, ok: true, exists: true } as any)

    render(
      <AdminPanel
        currentUser={{ email: 'user@example.com', role: 'user' }}
        onAdminLogin={vi.fn()}
        onAdminLogout={vi.fn()}
      />,
    )

    const input = await screen.findByLabelText('Название своей категории')
    fireEvent.change(input, { target: { value: 'молитва' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить свою категорию' }))

    await waitFor(() => expect(screen.getByText(/Такая категория уже есть/)).toBeInTheDocument())
    // Постоянный баннер внизу формы не использовался — он и «залипал» раньше
    expect(document.querySelector('.word-form .error')).toBeNull()
  })

  it('ошибка формы гаснет автоматически, а не висит до перезагрузки', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(addWord).mockRejectedValueOnce(new Error('boom'))
      render(
        <AdminPanel
          currentUser={{ email: 'user@example.com', role: 'user' }}
          onAdminLogin={vi.fn()}
          onAdminLogout={vi.fn()}
        />,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(50) })

      const form = document.querySelector('form.word-form') as HTMLFormElement
      expect(form).toBeTruthy()
      await act(async () => {
        fireEvent.submit(form)
        await vi.advanceTimersByTimeAsync(1)
      })

      // Ошибка сохранения показана в баннере формы
      expect(screen.getByText('boom')).toBeInTheDocument()

      // …но не висит вечно: через 10 секунд баннер убирается сам
      await act(async () => { await vi.advanceTimersByTimeAsync(10_001) })
      expect(document.querySelector('.word-form .error')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
