// src/api/audio.test.ts
// Юнит-тесты для emailToFolderName (имя папки пользователя в public/audio/).
import { describe, it, expect } from 'vitest'
import { emailToFolderName, buildAudioUrl, collectAudioUrls } from './audio'

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

describe('buildAudioUrl', () => {
  const BASE = import.meta.env.BASE_URL

  it('returns empty for empty filename', () => {
    expect(buildAudioUrl('', null)).toBe('')
    expect(buildAudioUrl(undefined, null)).toBe('')
  })

  it('builds a URL under the app base for plain filenames', () => {
    expect(buildAudioUrl('word.mp3', null)).toBe(`${BASE}audio/word.mp3`)
    expect(buildAudioUrl('word.mp3', '')).toBe(`${BASE}audio/word.mp3`)
  })

  it('puts personal files in the user folder', () => {
    expect(buildAudioUrl('word.mp3', 'user_example.com')).toBe(`${BASE}audio/user_example.com/word.mp3`)
  })

  it('keeps full paths as-is', () => {
    expect(buildAudioUrl('sub/word.mp3', null)).toBe(`${BASE}audio/sub/word.mp3`)
  })

  it('keeps absolute http(s) urls unchanged', () => {
    expect(buildAudioUrl('https://example.com/a.mp3', null)).toBe('https://example.com/a.mp3')
  })
})

describe('collectAudioUrls', () => {
  const BASE = import.meta.env.BASE_URL

  it('collects audio and audio2 for each word', () => {
    const words = [
      { audio: 'a.mp3', audio2: 'b.mp3' },
      { audio: 'c.mp3', audio2: undefined },
    ]
    expect(collectAudioUrls(words, null)).toEqual([
      `${BASE}audio/a.mp3`,
      `${BASE}audio/b.mp3`,
      `${BASE}audio/c.mp3`,
    ])
  })

  it('uses folder resolver per word', () => {
    const words = [
      { audio: 'a.mp3', __dictionarySource: 'personal' },
      { audio: 'b.mp3', __dictionarySource: 'shared' },
    ]
    const urls = collectAudioUrls(words, (w) => w.__dictionarySource === 'personal' ? 'user_x' : null)
    expect(urls).toEqual([
      `${BASE}audio/user_x/a.mp3`,
      `${BASE}audio/b.mp3`,
    ])
  })

  it('skips words with no audio', () => {
    expect(collectAudioUrls([{ audio: '', audio2: '' }], null)).toEqual([])
    expect(collectAudioUrls([], null)).toEqual([])
  })
})
