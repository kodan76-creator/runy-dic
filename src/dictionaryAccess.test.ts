// src/dictionaryAccess.test.ts
// Юнит-тесты выбора файла словаря по пользователю (vitest).
import { describe, it, expect } from 'vitest'
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from './dictionaryAccess'

describe('getDictionaryFileNameForEmail', () => {
  it('normalizes email to a safe lowercase file name', () => {
    expect(getDictionaryFileNameForEmail('User@Example.COM')).toBe('user.json')
    expect(getDictionaryFileNameForEmail('ivan.petrov@mail.ru')).toBe('ivan.petrov.json')
    expect(getDictionaryFileNameForEmail('ivan+tag@mail.ru')).toBe('ivan+tag.json')
  })

  it('handles empty or missing input', () => {
    expect(getDictionaryFileNameForEmail('')).toBe('user.json')
    expect(getDictionaryFileNameForEmail(null)).toBe('user.json')
    expect(getDictionaryFileNameForEmail(undefined)).toBe('user.json')
  })
})

describe('resolveDictionaryFile', () => {
  it('returns shared dictionary for admins', () => {
    expect(resolveDictionaryFile({ role: 'admin' })).toBe('dictionary.json')
  })

  it('returns shared dictionary for paid users', () => {
    expect(resolveDictionaryFile({ role: 'user', paid: true, email: 'vasya@mail.ru' })).toBe('dictionary.json')
  })

  it('returns personal file for regular users', () => {
    expect(resolveDictionaryFile({ role: 'user', paid: false, email: 'Vasya@Mail.ru' })).toBe('vasya.json')
  })

  it('handles string and empty input', () => {
    expect(resolveDictionaryFile('user@mail.ru')).toBe('user.json')
    expect(resolveDictionaryFile(null)).toBe('user.json')
    expect(resolveDictionaryFile(undefined)).toBe('user.json')
  })
})
