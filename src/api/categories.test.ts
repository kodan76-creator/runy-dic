// src/api/categories.test.ts
// Личные категории пользователя: merge с основными, запись и удаление
// только в свой файл public/users/<email_folder>/categories.json.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetchGitHubFile: vi.fn(),
  updateGitHubFile: vi.fn(),
}))

vi.mock('./client', () => ({
  fetchGitHubFile: h.fetchGitHubFile,
  updateGitHubFile: h.updateGitHubFile,
}))
vi.mock('./audio', () => ({
  emailToFolderName: (e: string) => String(e || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_'),
}))

import { getCategories, getPersonalCategoriesFile, addPersonalCategory, deletePersonalCategory } from './categories'

const MAIN = 'categories.json'
const PERSONAL = 'public/users/user_x.ru/categories.json'

const mainCats = [{ id: '1', name: 'Основная' }]
const personalCats = [{ id: 'u1', name: 'Моя', personal: true, createdBy: 'user@x.ru' }]

beforeEach(() => {
  vi.clearAllMocks()
  h.fetchGitHubFile.mockImplementation(async (name: string) => {
    if (name === MAIN) return { data: mainCats, sha: 'sha-main', ok: true, exists: true }
    if (name === PERSONAL) return { data: personalCats, sha: 'sha-personal', ok: true, exists: true }
    return { data: [], sha: null, ok: true, exists: false }
  })
})

describe('getPersonalCategoriesFile', () => {
  it('строит путь в папке пользователя', () => {
    expect(getPersonalCategoriesFile('User@X.ru')).toBe(PERSONAL)
  })

  it('бросает ошибку без пользователя', () => {
    expect(() => getPersonalCategoriesFile('')).toThrow('Пользователь не указан')
  })
})

describe('getCategories', () => {
  it('без email — только основной categories.json', async () => {
    const res = await getCategories()
    expect(h.fetchGitHubFile).toHaveBeenCalledTimes(1)
    expect(h.fetchGitHubFile).toHaveBeenCalledWith(MAIN)
    expect(res.data).toEqual(mainCats)
    expect(res.sha).toBe('sha-main')
  })

  it('с email — основные + личные (помечены __personal) после основных', async () => {
    const res = await getCategories('user@x.ru')
    expect(h.fetchGitHubFile).toHaveBeenCalledWith(PERSONAL)
    expect(res.data).toHaveLength(2)
    expect(res.data[0]).toEqual(mainCats[0])
    expect(res.data[1]).toMatchObject({ id: 'u1', name: 'Моя', __personal: true })
    expect(res.sha).toBe('sha-main')
    expect(res.ok).toBe(true)
  })

  it('личный файл не прочитался — ok:false, основные категории сохраняются', async () => {
    h.fetchGitHubFile.mockImplementation(async (name: string) => name === MAIN
      ? { data: mainCats, sha: 'sha-main', ok: true, exists: true }
      : { data: [], sha: null, ok: false, exists: null })
    const res = await getCategories('user@x.ru')
    expect(res.ok).toBe(false)
    expect(res.data).toHaveLength(1)
    expect(res.data[0]).toEqual(mainCats[0])
  })
})

describe('addPersonalCategory', () => {
  it('пишет в личный файл, основной categories.json не трогает', async () => {
    const created = await addPersonalCategory({ name: 'Новая' }, 'user@x.ru')

    expect(h.fetchGitHubFile).toHaveBeenCalledWith(PERSONAL)
    expect(h.updateGitHubFile).toHaveBeenCalledTimes(1)
    const [file, arr, sha] = h.updateGitHubFile.mock.calls[0]
    expect(file).toBe(PERSONAL)
    expect(sha).toBe('sha-personal')
    expect(arr[0]).toMatchObject({ name: 'Новая', personal: true, createdBy: 'user@x.ru' })
    expect(arr[0].id).toMatch(/^u\d+$/)
    expect(arr).toHaveLength(2) // новая + существовавшая
    expect(created.id).toBe(arr[0].id)
    expect(h.updateGitHubFile).not.toHaveBeenCalledWith(MAIN, expect.anything(), expect.anything())
  })

  it('без пользователя — ошибка, ничего не пишется', async () => {
    await expect(addPersonalCategory({ name: 'x' }, '')).rejects.toThrow('Пользователь не указан')
    expect(h.updateGitHubFile).not.toHaveBeenCalled()
  })
})

describe('deletePersonalCategory', () => {
  it('удаляет только из личного файла', async () => {
    await expect(deletePersonalCategory('u1', 'user@x.ru')).resolves.toBe(true)
    const [file, arr] = h.updateGitHubFile.mock.calls[0]
    expect(file).toBe(PERSONAL)
    expect(arr).toEqual([])
    expect(h.updateGitHubFile).not.toHaveBeenCalledWith(MAIN, expect.anything(), expect.anything())
  })

  it('чужой (основной) id не удаляется и файл не перезаписывается', async () => {
    await expect(deletePersonalCategory('1', 'user@x.ru')).resolves.toBe(false)
    expect(h.updateGitHubFile).not.toHaveBeenCalled()
  })
})