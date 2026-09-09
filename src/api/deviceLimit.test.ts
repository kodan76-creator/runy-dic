// Тесты лимита регистраций по устройству (deviceLimit.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MAX_REGISTRATIONS_PER_DAY,
  getDeviceId,
  getDeviceType,
  checkRegistrationLimit,
  recordRegistration,
  checkLoginDeviceLimit,
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

  it('getDeviceType возвращает mobile или desktop', () => {
    const type = getDeviceType()
    expect(['mobile', 'desktop']).toContain(type)
  })

  it('админ не ограничен лимитом устройств', () => {
    const admin = { role: 'admin', devices: [{ id: 'a', type: 'mobile' }] }
    const res = checkLoginDeviceLimit(admin, 'new-device', 'mobile')
    expect(res.allowed).toBe(true)
  })

  it('пользователь без поля devices (до фичи) не ограничен', () => {
    const oldUser = { role: 'user', deviceId: 'reg-device' }
    const res = checkLoginDeviceLimit(oldUser, 'any-device', 'mobile')
    expect(res.allowed).toBe(true)
    expect(res.isNewDevice).toBe(false)
  })

  it('известное устройство разрешено', () => {
    const user = { role: 'user', devices: [{ id: 'dev-1', type: 'mobile' }] }
    const res = checkLoginDeviceLimit(user, 'dev-1', 'mobile')
    expect(res.allowed).toBe(true)
    expect(res.isNewDevice).toBeFalsy()
  })

  it('новое устройство того же типа запрещено', () => {
    const user = { role: 'user', devices: [{ id: 'dev-1', type: 'mobile' }] }
    const res = checkLoginDeviceLimit(user, 'dev-2', 'mobile')
    expect(res.allowed).toBe(false)
    expect(res.message).toMatch(/мобильного телефона/)
  })

  it('новое устройство другого типа разрешено и добавляется', () => {
    const user = { role: 'user', devices: [{ id: 'dev-1', type: 'mobile' }] }
    const res = checkLoginDeviceLimit(user, 'dev-2', 'desktop')
    expect(res.allowed).toBe(true)
    expect(res.isNewDevice).toBe(true)
    expect(res.devices).toHaveLength(2)
    expect(res.devices.some(d => d.id === 'dev-2' && d.type === 'desktop')).toBe(true)
  })
})
