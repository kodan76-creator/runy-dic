// src/api/logs.test.ts
// Тесты записи логов: батчинг (одно обновление файла на пачку событий),
// оффлайн-режим и мягкая обработка сбоев — из-за частых одиночных записей
// GitHub отвечал 409 Conflict и консоль заполнялась ошибками.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./client', () => ({
  fetchGitHubFile: vi.fn(),
  updateGitHubFile: vi.fn(),
  isRetryableGitHubError: (error: unknown) =>
    /409|422|Conflict|sha was supposed/i.test(error instanceof Error ? error.message : String(error)),
  isBrowserOffline: vi.fn(() => false),
  withWriteLock: (_fileName: string, task: () => Promise<unknown>) => task(),
}))

type ClientModule = typeof import('./client')
type LogsModule = typeof import('./logs')

const EXISTING_LOGS = [{ id: 'old', details: 'старый' }]

describe('addLog / flushPendingLogs', () => {
  let client: ClientModule
  let logs: LogsModule

  // Модуль logs держит буфер в памяти: для каждого теста берём свежие модули
  // (vi.resetModules), иначе накопленные записи «перетекают» между тестами
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    client = await import('./client')
    logs = await import('./logs')
    vi.mocked(client.fetchGitHubFile).mockResolvedValue({ data: EXISTING_LOGS, sha: 'sha-1', ok: true, exists: true })
    vi.mocked(client.updateGitHubFile).mockResolvedValue({})
    vi.mocked(client.isBrowserOffline).mockReturnValue(false)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const updatedPayload = () => vi.mocked(client.updateGitHubFile).mock.calls.at(-1)?.[1] as any[]

  it('пачка событий уходит одним обновлением logs.json (новые — сверху)', async () => {
    await logs.addLog({ action: 'search', details: 'первый' })
    await logs.addLog({ action: 'search', details: 'второй' })

    expect(client.updateGitHubFile).not.toHaveBeenCalled() // до flush файл не трогаем

    await logs.flushPendingLogs()

    expect(client.fetchGitHubFile).toHaveBeenCalledTimes(1)
    expect(client.updateGitHubFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(client.updateGitHubFile).mock.calls[0][0]).toBe('logs.json')
    expect(vi.mocked(client.updateGitHubFile).mock.calls[0][2]).toBe('sha-1')
    expect(updatedPayload().map(l => l.details)).toEqual(['второй', 'первый', 'старый'])
  })

  it('пишет сама через 4 секунды после события', async () => {
    await logs.addLog({ action: 'login', details: 'вход' })
    expect(client.updateGitHubFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000)
    expect(client.updateGitHubFile).toHaveBeenCalledTimes(1)
    expect(updatedPayload()[0].details).toBe('вход')
  })

  it('оффлайн: запись не уходит, лог ждёт появления сети', async () => {
    vi.mocked(client.isBrowserOffline).mockReturnValue(true)
    await logs.addLog({ action: 'search', details: 'оффлайн' })
    await vi.advanceTimersByTimeAsync(4000)
    expect(client.fetchGitHubFile).not.toHaveBeenCalled()
    expect(client.updateGitHubFile).not.toHaveBeenCalled()

    vi.mocked(client.isBrowserOffline).mockReturnValue(false)
    await logs.flushPendingLogs()
    expect(updatedPayload()[0].details).toBe('оффлайн')
  })

  it('сбой записи: приложение не падает, логи дописываются позже', async () => {
    vi.mocked(client.updateGitHubFile).mockRejectedValue(new Error('HTTP 500: Server Error'))
    const errorSpy = vi.mocked(console.error)

    await logs.addLog({ action: 'audio_played', details: 'аудио' })
    await logs.flushPendingLogs()

    expect(errorSpy).not.toHaveBeenCalled() // console.error больше не используется
    expect(console.warn).toHaveBeenCalledTimes(1)

    vi.mocked(client.updateGitHubFile).mockResolvedValue({})
    await logs.flushPendingLogs()
    expect(updatedPayload().map(l => l.details)).toEqual(['аудио', 'старый'])
  })

  it('clearLogs очищает и файл, и буфер несохранённых записей', async () => {
    await logs.addLog({ action: 'search', details: 'устаревший' })
    await logs.clearLogs()
    await logs.flushPendingLogs()
    expect(updatedPayload()).toEqual([])
  })

  it('сбой чтения файла логов не приводит к записи «вслепую»', async () => {
    vi.mocked(client.fetchGitHubFile).mockRejectedValue(new TypeError('Failed to fetch'))
    await logs.addLog({ action: 'search', details: 'нет сети' })
    await logs.flushPendingLogs()
    expect(client.updateGitHubFile).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})