// Тесты синхронизации оффлайн-изменений с GitHub (flushOfflineChanges).
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем клиент GitHub, чтобы не ходить в сеть
vi.mock('./client', () => ({
  fetchGitHubFile: vi.fn(),
  updateGitHubFile: vi.fn(),
  isRetryableGitHubError: vi.fn(() => false),
}))

// Мокаем offline-кэш/очередь: работаем на реальном localStorage (jsdom),
// но подменяем getCachedDictionary/cacheDictionaryForOffline, т.к. их
// логика уже покрыта отдельным тестом.
import { enqueueOfflineChange, getOfflineChanges } from './offline'
import { flushOfflineChanges } from './dictionary'
import { fetchGitHubFile, updateGitHubFile } from './client'

const mockFetch = vi.mocked(fetchGitHubFile)
const mockUpdate = vi.mocked(updateGitHubFile)

const w1 = { id: '1', word: 'hello', translation: 'привет' }
const w2 = { id: '2', word: 'world', translation: 'мир' }

describe('flushOfflineChanges', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('ничего не делает, если очередь пуста', async () => {
    const n = await flushOfflineChanges({ role: 'admin', email: 'a@test.com' })
    expect(n).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('воспроизводит изменения только для своего файла', async () => {
    enqueueOfflineChange({ type: 'update', fileName: 'dictionary.json', id: '1', data: { translation: 'привет!' }, queuedAt: 1 })
    enqueueOfflineChange({ type: 'update', fileName: 'other.json', id: '9', data: { translation: 'x' }, queuedAt: 2 })

    mockFetch.mockResolvedValue({ data: [w1, w2], sha: 'sha1', ok: true, exists: true })
    mockUpdate.mockResolvedValue({ ok: true })

    const n = await flushOfflineChanges({ role: 'admin', email: 'a@test.com' })
    expect(n).toBe(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [, arr] = mockUpdate.mock.calls[0] as [string, any[], string | null]
    expect(arr).toEqual([{ ...w1, translation: 'привет!' }, w2])
    // Другие изменения остаются в очереди
    expect(getOfflineChanges()).toHaveLength(1)
  })

  it('применяет add/update/delete/reorder последовательно', async () => {
    enqueueOfflineChange({ type: 'update', fileName: 'dictionary.json', id: '1', data: { translation: 'привет!' }, queuedAt: 1 })
    enqueueOfflineChange({ type: 'add', fileName: 'dictionary.json', word: { id: '3', word: 'foo', translation: 'бар' }, queuedAt: 2 })
    enqueueOfflineChange({ type: 'delete', fileName: 'dictionary.json', id: '2', queuedAt: 3 })
    enqueueOfflineChange({ type: 'reorder', fileName: 'dictionary.json', order: ['3', '1'], queuedAt: 4 })

    mockFetch.mockResolvedValue({ data: [w1, w2], sha: 'sha1', ok: true, exists: true })
    mockUpdate.mockResolvedValue({ ok: true })

    const n = await flushOfflineChanges({ role: 'admin', email: 'a@test.com' })
    expect(n).toBe(4)
    const [, arr] = mockUpdate.mock.calls[0] as [string, any[], string | null]
    expect(arr.map(w => w.id)).toEqual(['3', '1'])
    expect(arr[1].translation).toBe('привет!')
    expect(getOfflineChanges()).toHaveLength(0)
  })

  it('бросает ошибку, если файл не прочитался (ok=false)', async () => {
    enqueueOfflineChange({ type: 'update', fileName: 'dictionary.json', id: '1', data: {}, queuedAt: 1 })
    mockFetch.mockResolvedValue({ data: [], sha: null, ok: false, exists: null })
    await expect(flushOfflineChanges({ role: 'admin', email: 'a@test.com' })).rejects.toThrow()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
