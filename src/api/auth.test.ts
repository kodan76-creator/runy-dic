// Тесты deleteUser: запись в users.json и архивация папок пользователя
// (public/users, public/audio, public/images) обязаны идти вместе —
// без «тихих» пропусков, когда UI сообщает об успехе при нуле перенесённых файлов.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetchGitHubFile: vi.fn(),
  updateGitHubFile: vi.fn(),
  addLog: vi.fn(async () => ({})),
  archiveUserFolders: vi.fn(async () => ({ moved: 0, errors: [] as string[] })),
}))

vi.mock('./client', () => ({
  fetchGitHubFile: h.fetchGitHubFile,
  updateGitHubFile: h.updateGitHubFile,
}))
vi.mock('./logs', () => ({ addLog: h.addLog }))
vi.mock('./audio', () => ({ ensureUserAudioFolder: vi.fn(async () => ({ created: false })) }))
vi.mock('./dictionary', () => ({ ensureUserDictionaryFile: vi.fn(async () => ({ created: false })) }))
vi.mock('./offline', () => ({ cacheUserForOffline: vi.fn() }))
vi.mock('./registrationNotify', () => ({ notifyRegistration: vi.fn(async () => {}) }))
vi.mock('./userFolder', () => ({
  archiveUserFolders: h.archiveUserFolders,
  clearLocalUserData: vi.fn(async () => {}),
}))
vi.mock('./deviceLimit', () => ({
  getDeviceId: () => 'dev-test',
  getDeviceType: () => 'desktop',
  checkRegistrationLimit: vi.fn(() => ({ allowed: true })),
  recordRegistration: vi.fn(),
  checkLoginDeviceLimit: vi.fn(() => ({ allowed: true })),
}))

import { deleteUser } from './auth'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deleteUser', () => {
  it('неизвестный id — явная ошибка, users.json не перезаписывается, архивация не вызывается', async () => {
    h.fetchGitHubFile.mockResolvedValue({ data: [{ id: 'u1', email: 'a@b.ru' }], sha: 'sha-users' })

    await expect(deleteUser('missing-id', 'admin@x.ru')).rejects.toThrow('Пользователь не найден')

    expect(h.updateGitHubFile).not.toHaveBeenCalled()
    expect(h.archiveUserFolders).not.toHaveBeenCalled()
  })

  it('пользователь найден: запись удаляется, папки архивируются по его email', async () => {
    h.fetchGitHubFile.mockResolvedValue({
      data: [{ id: 'u1', email: 'a@b.ru' }, { id: 'u2', email: 'keep@b.ru' }],
      sha: 'sha-users',
    })
    h.archiveUserFolders.mockResolvedValue({ moved: 3, errors: [] })

    const archive = await deleteUser('u1', 'admin@x.ru')

    expect(archive).toEqual({ moved: 3, errors: [] })
    const [file, data, sha] = h.updateGitHubFile.mock.calls[0]
    expect(file).toBe('users.json')
    expect(data.map((u: { id: string }) => u.id)).toEqual(['u2'])
    expect(sha).toBe('sha-users')
    expect(h.archiveUserFolders).toHaveBeenCalledWith('a@b.ru')
  })

  it('сбой архивации не отменяет удаление, ошибка попадает в результат', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.fetchGitHubFile.mockResolvedValue({ data: [{ id: 'u1', email: 'a@b.ru' }], sha: 's' })
    h.archiveUserFolders.mockRejectedValue(new Error('boom'))

    const archive = await deleteUser('u1', 'admin@x.ru')

    expect(archive.errors).toEqual(['boom'])
    expect(h.updateGitHubFile).toHaveBeenCalled()
    warn.mockRestore()
  })
})
