// src/AdminPanel.test.tsx
// Регрессия: активная вкладка админки хранится в общем ключе localStorage
// (admin_active_tab). Раньше админ открывал «Пользователи», разлогинился —
// и обычный пользователь видел остатки секции (заголовок «Пользователи (0)»,
// поиск, фильтры, «Пользователи не найдены»), хотя кнопки вкладок ему скрыты.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminPanel from './AdminPanel'

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
