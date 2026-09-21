// src/api/registrationNotify.test.ts
// Тесты уведомления администраторам о новой регистрации:
// тело dispatch-события и неблокирующее поведение notifyRegistration
// (ошибки глотаются, регистрация продолжается).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildDispatchBody,
  notifyRegistration,
  REGISTRATION_NOTIFY_APP,
  REGISTRATION_NOTIFY_EVENT,
} from './registrationNotify'

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
}

const okResponse = () =>
  new Response(null, { status: 204, statusText: 'No Content' })

beforeEach(() => {
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
  vi.restoreAllMocks()
})

describe('buildDispatchBody', () => {
  it('формирует событие user_registered с email и датой', () => {
    expect(buildDispatchBody('user@mail.ru', '2026-01-01T00:00:00.000Z')).toEqual({
      event_type: REGISTRATION_NOTIFY_EVENT,
      client_payload: {
        app: REGISTRATION_NOTIFY_APP,
        email: 'user@mail.ru',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
  })
})

describe('notifyRegistration', () => {
  it('без токена не ходит в сеть и не бросает исключений', async () => {
    const fetchSpy = vi.fn()
    await expect(
      notifyRegistration('user@mail.ru', 'now', { token: '', fetchImpl: fetchSpy }),
    ).resolves.toEqual({ ok: false, reason: 'no-token' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('без email не ходит в сеть', async () => {
    const fetchSpy = vi.fn()
    await expect(
      notifyRegistration('', 'now', { token: 't', fetchImpl: fetchSpy }),
    ).resolves.toEqual({ ok: false, reason: 'no-email' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('оффлайн: не ходит в сеть', async () => {
    const fetchSpy = vi.fn()
    setOnline(false)
    await expect(
      notifyRegistration('user@mail.ru', 'now', { token: 't', fetchImpl: fetchSpy }),
    ).resolves.toEqual({ ok: false, reason: 'offline' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('успех: POST на /dispatches с телом события', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    const result = await notifyRegistration('user@mail.ru', '2026-01-01T00:00:00.000Z', {
      token: 't',
      owner: 'o',
      repo: 'r',
      fetchImpl: fetchSpy,
    })
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/o/r/dispatches')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual(
      buildDispatchBody('user@mail.ru', '2026-01-01T00:00:00.000Z'),
    )
  })

  it('обрыв сети: одна повторная попытка, затем тихий { ok:false }', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifyRegistration('user@mail.ru', 'now', {
      token: 't',
      fetchImpl: fetchSpy,
    })
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('HTTP-ошибка: не бросает исключений, пишет warn и возвращает ok:false', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 403 }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifyRegistration('user@mail.ru', 'now', {
      token: 't',
      fetchImpl: fetchSpy,
    })
    expect(result).toEqual({ ok: false, reason: 'error' })
    // HTTP-ответ (даже 403) — успешный fetch: повтора нет, только одна попытка
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
