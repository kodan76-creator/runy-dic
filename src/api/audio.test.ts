// src/api/audio.test.ts
// Юнит-тесты для emailToFolderName (имя папки пользователя в public/audio/).
import { describe, it, expect } from 'vitest'
import { emailToFolderName } from './audio'

describe('emailToFolderName', () => {
  it('lowercases the email and replaces unsafe chars with underscores', () => {
    expect(emailToFolderName('User@Example.COM')).toBe('user_example.com')
    expect(emailToFolderName('ivan.petrov@mail.ru')).toBe('ivan.petrov_mail.ru')
    expect(emailToFolderName('i+van@yandex.ru')).toBe('i_van_yandex.ru')
  })

  it('keeps dots, dashes and underscores', () => {
    expect(emailToFolderName('a.b-c_d@e.f')).toBe('a.b-c_d_e.f')
  })

  it('handles empty or missing input', () => {
    expect(emailToFolderName('')).toBe('')
    expect(emailToFolderName(null)).toBe('')
    expect(emailToFolderName(undefined)).toBe('')
  })
})
