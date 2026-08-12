// Тесты лимита регистраций по устройству (deviceLimit.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MAX_REGISTRATIONS_PER_DAY,
  getDeviceId,
  checkRegistrationLimit,
  recordRegistration,
} from './deviceLimit'

const REG_LOG_KEY = 'runy-dic-registrations'

describe('deviceLimit', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('генерирует и сохраняет стабильный deviceId', () => {
    const id1 = getDeviceId()
    const id2 = getDeviceId()
    expect(id1).toBe(id2)
    expect(localStorage.getItem('runy-dic-device-id')).toBe(id1)
  })

  it('разрешает ровно MAX_REGISTRATIONS_PER_DAY регистраций, 6-я блокируется', () => {
    for (let i = 0; i < MAX_REGISTRATIONS_PER_DAY; i++) {
      // Перед каждой регистрацией лимит должен быть в норме
      expect(checkRegistrationLimit()).toBe(MAX_REGISTRATIONS_PER_DAY - i)
      recordRegistration()
    }
    // 6-я попытка — лимит исчерпан
    expect(() => checkRegistrationLimit()).toThrow(/Превышен лимит регистраций/)
  })

  it('бросает ошибку при превышении лимита (6-я регистрация)', () => {
    for (let i = 0; i < MAX_REGISTRATIONS_PER_DAY; i++) recordRegistration()
    expect(() => checkRegistrationLimit()).toThrow(/Превышен лимит регистраций/)
  })

  it('учитывает только регистрации за последние 24 часа', () => {
    // Имитируем старую регистрацию (25 часов назад) — она не должна считаться.
    const old = Date.now() - 25 * 60 * 60 * 1000
    localStorage.setItem(REG_LOG_KEY, JSON.stringify([old]))
    expect(checkRegistrationLimit()).toBe(MAX_REGISTRATIONS_PER_DAY)

    // А регистрация 23 часа назад — считается.
    const recent = Date.now() - 23 * 60 * 60 * 1000
    localStorage.setItem(REG_LOG_KEY, JSON.stringify([recent]))
    expect(checkRegistrationLimit()).toBe(MAX_REGISTRATIONS_PER_DAY - 1)
  })
})
