// Тесты переноса файлов пользователя в корзину (public/users/_deleted)
// при удалении учётной записи: рекурсия, коллизии, ошибки, чистка кэшей.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  githubFetch: vi.fn(),
  isBrowserOffline: vi.fn(() => false),
  removeCachedUser: vi.fn(),
  removeCachedPhotoBlob: vi.fn(),
}))

vi.mock('./client', () => ({
  getHeaders: () => ({ Authorization: 'token test' }),
  githubFetch: h.githubFetch,
  isBrowserOffline: h.isBrowserOffline,
}))
vi.mock('./offline', () => ({ removeCachedUser: h.removeCachedUser }))
vi.mock('./audio', () => ({
  emailToFolderName: (e: string) => String(e || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_'),
}))
vi.mock('./photoCache', () => ({ removeCachedPhotoBlob: h.removeCachedPhotoBlob }))

import { archiveUserFolders, clearLocalUserData } from './userFolder'

const API = 'https://api.github.com/repos/kodan76-creator/runy-dic/contents'
const jsonResp = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body })
const fileResp = (content: string, sha: string) => jsonResp({ content, sha })

interface Call { method: string; url: string; body?: any }

/** Роутер GitHub API для теста. dirs: путь → entries; files: путь → {content, sha} */
const installRouter = (opts: {
  dirs?: Record<string, unknown[]>
  files?: Record<string, { content: string; sha: string }>
  failPut?: (url: string) => boolean
  failDelete?: (url: string) => boolean
}) => {
  const calls: Call[] = []
  h.githubFetch.mockImplementation(async (url: string, init?: any) => {
    const method = init?.method || 'GET'
    const path = url.replace(API + '/', '').replace(/\?ref=main$/, '')
    calls.push({ method, url: path, body: init?.body ? JSON.parse(init.body) : undefined })

    if (method === 'GET') {
      if (opts.dirs && path in opts.dirs) return jsonResp(opts.dirs[path])
      if (opts.files && path in opts.files) {
        const f = opts.files[path]!
        return fileResp(f.content, f.sha)
      }
      return jsonResp({ message: 'Not Found' }, false)
    }
    if (method === 'PUT') {
      const destExists = opts.files ? path in opts.files : false
      const withSha = Boolean(init?.body ? JSON.parse(init.body).sha : null)
      if (opts.failPut?.(path) || (destExists && !withSha)) {
        // Первый PUT в существующий файл без sha → 422, как у GitHub
        return jsonResp({ message: 'sha was not supplied' }, false)
      }
      return jsonResp({ content: { path } })
    }
    if (method === 'DELETE') {
      if (opts.failDelete?.(path)) return jsonResp({ message: 'Conflict' }, false)
      return jsonResp({ commit: {} })
    }
    return jsonResp({ message: 'Bad Request' }, false)
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
  h.isBrowserOffline.mockReturnValue(false)
  localStorage.clear()
})

describe('archiveUserFolders: перенос файлов удалённого пользователя в корзину', () => {
  it('переносит файлы личной папки в _deleted и удаляет оригиналы', async () => {
    const calls = installRouter({
      dirs: {
        'public/users/test_2.ru': [
          { name: 'dictionary.json', path: 'public/users/test_2.ru/dictionary.json', type: 'file', sha: 'sha-d' },
          { name: 'favorites.json', path: 'public/users/test_2.ru/favorites.json', type: 'file', sha: 'sha-f' },
        ],
      },
      files: {
        'public/users/test_2.ru/dictionary.json': { content: 'W3sid29yZCI6InRlc3QifV0=', sha: 'sha-d' },
        'public/users/test_2.ru/favorites.json': { content: 'W10=', sha: 'sha-f' },
      },
    })

    const result = await archiveUserFolders('Test@2.ru')

    expect(result.moved).toBe(2)
    expect(result.errors).toEqual([])
    // PUT в корзину с тем же содержимым
    const putDict = calls.find(c => c.method === 'PUT' && c.url === 'public/users/_deleted/test_2.ru/dictionary.json')
    expect(putDict?.body?.content).toBe('W3sid29yZCI6InRlc3QifV0=')
    // DELETE оригинала по его sha
    const delDict = calls.find(c => c.method === 'DELETE' && c.url === 'public/users/test_2.ru/dictionary.json')
    expect(delDict?.body?.sha).toBe('sha-d')
    // Локальные следы очищены
    expect(h.removeCachedUser).toHaveBeenCalledWith('test@2.ru')
    expect(h.removeCachedPhotoBlob).toHaveBeenCalledWith('test@2.ru')
    expect(localStorage.getItem('offline_dict:test@2.ru')).toBeNull()
  })

  it('переносит вложенные папки рекурсивно, .gitkeep удаляет без копирования', async () => {
    const calls = installRouter({
      dirs: {
        'public/users/test_2.ru': [
          { name: 'audio', path: 'public/users/test_2.ru/audio', type: 'dir', sha: 'sha-dir' },
        ],
        'public/users/test_2.ru/audio': [
          { name: '.gitkeep', path: 'public/users/test_2.ru/audio/.gitkeep', type: 'file', sha: 'sha-k' },
          { name: 'hello.webm', path: 'public/users/test_2.ru/audio/hello.webm', type: 'file', sha: 'sha-w' },
        ],
      },
      files: {
        'public/users/test_2.ru/audio/hello.webm': { content: 'YXVkaW8=', sha: 'sha-w' },
      },
    })

    const result = await archiveUserFolders('test@2.ru')

    expect(result.moved).toBe(1)
    expect(calls.some(c => c.method === 'DELETE' && c.url === 'public/users/test_2.ru/audio/.gitkeep')).toBe(true)
    expect(calls.some(c => c.method === 'PUT' && c.url === 'public/users/_deleted/test_2.ru/audio/hello.webm')).toBe(true)
    expect(calls.some(c => c.method === 'PUT' && c.url === 'public/users/_deleted/test_2.ru/audio/.gitkeep')).toBe(false)
  })

  it('ошибка удаления оригинала попадает в errors, запись в корзину не теряется', async () => {
    installRouter({
      dirs: {
        'public/users/test_2.ru': [
          { name: 'dictionary.json', path: 'public/users/test_2.ru/dictionary.json', type: 'file', sha: 'sha-d' },
        ],
      },
      files: {
        'public/users/test_2.ru/dictionary.json': { content: 'W10=', sha: 'sha-d' },
      },
      failDelete: (url) => url === 'public/users/test_2.ru/dictionary.json',
    })

    const result = await archiveUserFolders('test@2.ru')

    expect(result.moved).toBe(0)
    expect(result.errors.some(e => e.includes('не удалось удалить'))).toBe(true)
  })

  it('отсутствующая папка пользователя — не ошибка', async () => {
    const calls = installRouter({})
    const result = await archiveUserFolders('nobody@2.ru')
    expect(result.moved).toBe(0)
    expect(result.errors).toEqual([])
    expect(calls.some(c => c.method === 'PUT' || c.method === 'DELETE')).toBe(false)
  })
})

describe('clearLocalUserData', () => {
  it('чистит localStorage-ключи и IndexedDB-фото пользователя', async () => {
    localStorage.setItem('offline_dict:test@2.ru', '{"words":[]}')
    localStorage.setItem('rune_spread:test@2.ru', '{}')
    localStorage.setItem('offline_dict:other@2.ru', '{"words":[]}')

    await clearLocalUserData('Test@2.ru')

    expect(localStorage.getItem('offline_dict:test@2.ru')).toBeNull()
    expect(localStorage.getItem('rune_spread:test@2.ru')).toBeNull()
    // Чужие ключи не тронуты
    expect(localStorage.getItem('offline_dict:other@2.ru')).toBe('{"words":[]}')
    expect(h.removeCachedUser).toHaveBeenCalledWith('test@2.ru')
    expect(h.removeCachedPhotoBlob).toHaveBeenCalledWith('test@2.ru')
  })
})
