// src/api/dictionary.test.ts
// Регресс: при удалении категории её id убирается из словарей — иначе в
// карточках остаётся «висячий» id и он отображается цифрами.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetchGitHubFile: vi.fn(),
  updateGitHubFile: vi.fn(),
}))

vi.mock('./client', () => ({
  fetchGitHubFile: h.fetchGitHubFile,
  updateGitHubFile: h.updateGitHubFile,
  isRetryableGitHubError: vi.fn(() => false),
  getHeaders: vi.fn(() => ({})),
}))
vi.mock('./favorites', () => ({ removeWordFromAllFavorites: vi.fn(async () => {}) }))
vi.mock('./offline', () => ({
  isOnline: vi.fn(() => true),
  enqueueOfflineChange: vi.fn(),
  getOfflineChanges: vi.fn(() => []),
  removeOfflineChanges: vi.fn(),
  applyOfflineChange: vi.fn((x: unknown) => x),
  getCachedDictionary: vi.fn(() => undefined),
  cacheDictionaryForOffline: vi.fn(),
}))

import { removeCategoryFromAllWords } from './dictionary'

const USER_FILE = 'public/users/user_x.ru/dictionary.json'
const WORDS = [
  { id: 1, word: 'а', category: ['123', '456'] },
  { id: 2, word: 'б', category: ['456'] },
  { id: 3, word: 'в' },
]

describe('removeCategoryFromAllWords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.fetchGitHubFile.mockImplementation(async (name: string) =>
      name === USER_FILE || name === 'dictionary.json'
        ? { data: WORDS, sha: 'sha1', ok: true, exists: true }
        : { data: [], sha: null, ok: true, exists: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('с email чистит только словарь этого пользователя', async () => {
    const updated = await removeCategoryFromAllWords('456', 'user@x.ru')

    expect(h.fetchGitHubFile).toHaveBeenCalledTimes(1)
    expect(h.fetchGitHubFile).toHaveBeenCalledWith(USER_FILE)
    expect(updated).toBe(1)

    const [file, arr, sha] = h.updateGitHubFile.mock.calls[0]
    expect(file).toBe(USER_FILE)
    expect(sha).toBe('sha1')
    expect(arr).toEqual([
      { id: 1, word: 'а', category: ['123'] },
      { id: 2, word: 'б', category: [] },
      { id: 3, word: 'в' },
    ])
  })

  it('когда id ни в одном слове нет — файлы не перезаписываются', async () => {
    const updated = await removeCategoryFromAllWords('нет-такого-id', 'user@x.ru')
    expect(updated).toBe(0)
    expect(h.updateGitHubFile).not.toHaveBeenCalled()
  })

  it('без email чистит общий словарь и личные (кроме архива _deleted)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tree: [
          { type: 'blob', path: 'dictionary.json' },
          { type: 'blob', path: USER_FILE },
          { type: 'blob', path: 'public/users/_deleted/gone.ru/dictionary.json' },
          { type: 'blob', path: 'categories.json' },
        ],
      }),
    })))

    const updated = await removeCategoryFromAllWords('456')

    const requested = h.fetchGitHubFile.mock.calls.map(c => c[0])
    expect(requested).toContain('dictionary.json')
    expect(requested).toContain(USER_FILE)
    expect(requested).not.toContain('public/users/_deleted/gone.ru/dictionary.json')
    expect(requested).not.toContain('categories.json')
    expect(updated).toBe(2) // оба словаря содержали удаляемый id
  })
})