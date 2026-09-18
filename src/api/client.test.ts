// src/api/client.test.ts
// Тесты сетевого слоя GitHub: оффлайн-режим, таймаут и тихие логи.
// Без этого приложение при недоступном GitHub API заполняло консоль
// ошибками ERR_TIMED_OUT / «Failed to fetch» каждую минуту.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Шифрование в этих тестах не нужно — заглушка, чтобы не читать ключ из env
vi.mock('../cryptoUtil', () => ({
  encrypt: async (text: string) => text,
  decrypt: async (text: string) => text,
  isEncrypted: () => false,
}))

import {
  fetchGitHubFile,
  fetchGitHubFileRaw,
  fetchWithTimeout,
  isBrowserOffline,
  isNetworkFetchError,
} from './client'

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
}

beforeEach(() => {
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const networkFailure = () => new TypeError('Failed to fetch')

describe('isBrowserOffline', () => {
  it('сообщает о состоянии сети без обращения к серверу', () => {
    setOnline(false)
    expect(isBrowserOffline()).toBe(true)
    setOnline(true)
    expect(isBrowserOffline()).toBe(false)
  })
})

describe('isNetworkFetchError', () => {
  it('обрыв сети и таймаут — сетевые сбои, а HTTP-конфликт — нет', () => {
    expect(isNetworkFetchError(networkFailure())).toBe(true)
    expect(isNetworkFetchError(new Error('HTTP 409: Conflict'))).toBe(false)
  })
})

describe('fetchGitHubFile', () => {
  it('оффлайн: не ходит в сеть, возвращает ok:false и не пишет ошибок в консоль', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setOnline(false)

    await expect(fetchGitHubFile('users.json')).resolves.toEqual({
      data: [], sha: null, ok: false, exists: null,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('обрыв сети: одна повторная попытка, предупреждение без спама', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(networkFailure())
    vi.stubGlobal('fetch', fetchSpy)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(fetchGitHubFile('users.json')).resolves.toMatchObject({ ok: false, data: [] })
    expect(fetchSpy).toHaveBeenCalledTimes(2) // исходная попытка + повтор
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Повторный вызов (например, минутный опрос сессии) уже не логируется
    await fetchGitHubFile('users.json')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('оффлайн: fetchGitHubFileRaw тихо возвращает пустые данные', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    setOnline(false)
    await expect(fetchGitHubFileRaw('users.json')).resolves.toEqual({ data: null, sha: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('fetchWithTimeout', () => {
  it('прерывает «зависший» запрос по таймауту (AbortError)', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    ))

    await expect(fetchWithTimeout('https://api.github.com/x', {}, 10)).rejects.toThrow('aborted')
  })
})