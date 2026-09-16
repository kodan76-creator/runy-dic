// src/api/images.test.ts
// Юнит-тесты валидации загрузки изображений (расширения, объём, размеры).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadImageFile, listUserImages, cleanupUserPhotos, selectRandomRunes } from './images'
import { getGitHubFileSha } from './client'

// Мокаем сетевые вызовы GitHub — тестируем только валидацию до загрузки.
vi.mock('./client', () => ({
  getGitHubFileSha: vi.fn().mockResolvedValue(null),
  getHeaders: vi.fn().mockReturnValue({}),
}))

const makeFile = (name: string, size: number, type = 'image/png'): File =>
  new File([new Uint8Array(size)], name, { type })

// Мокаем чтение размеров изображения (Image + URL.createObjectURL).
// jsdom не реализует createObjectURL/revokeObjectURL — добавляем их.
const stubImageDimensions = (width: number, height: number) => {
  vi.stubGlobal('Image', class {
    naturalWidth = width
    naturalHeight = height
    onload: (() => void) | null = null
    set src(_value: string) {
      // Асинхронно «загружаем» изображение с заданными размерами
      setTimeout(() => this.onload?.(), 0)
    }
  })
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:fake')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadImageFile validation', () => {
  it('rejects unsupported extensions', async () => {
    const file = makeFile('photo.txt', 100)
    await expect(uploadImageFile(file, 'test@test.ru')).rejects.toThrow('Допускаются только изображения')
  })

  it('rejects extensions not in allowedExtensions', async () => {
    const file = makeFile('photo.gif', 100)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'] })
    ).rejects.toThrow('Допускаются только изображения')
  })

  it('rejects files over maxSize', async () => {
    const file = makeFile('photo.png', 11 * 1024 * 1024)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { maxSize: 10 * 1024 * 1024 })
    ).rejects.toThrow('Файл слишком большой')
  })

  it('rejects images narrower than minWidth', async () => {
    stubImageDimensions(300, 900)
    const file = makeFile('photo.png', 1000)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { minWidth: 400, minHeight: 800 })
    ).rejects.toThrow('Фото слишком узкое')
  })

  it('rejects images shorter than minHeight', async () => {
    stubImageDimensions(500, 700)
    const file = makeFile('photo.png', 1000)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { minWidth: 400, minHeight: 800 })
    ).rejects.toThrow('Фото слишком низкое')
  })

  it('rejects images wider than maxWidth', async () => {
    stubImageDimensions(5000, 1000)
    const file = makeFile('photo.png', 1000)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { maxWidth: 4000, maxHeight: 8000 })
    ).rejects.toThrow('Фото слишком широкое')
  })

  it('rejects images taller than maxHeight', async () => {
    stubImageDimensions(1000, 9000)
    const file = makeFile('photo.png', 1000)
    await expect(
      uploadImageFile(file, 'test@test.ru', false, { maxWidth: 4000, maxHeight: 8000 })
    ).rejects.toThrow('Фото слишком высокое')
  })
})

describe('listUserImages', () => {
  it('returns file names from the user folder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { type: 'file', name: 'a.jpg' },
        { type: 'file', name: 'b.png' },
        { type: 'dir', name: 'sub' },
      ]),
    }))
    const files = await listUserImages('test@test.ru')
    expect(files).toEqual(['a.jpg', 'b.png'])
  })

  it('returns empty array when folder is missing (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const files = await listUserImages('test@test.ru')
    expect(files).toEqual([])
  })
})

describe('cleanupUserPhotos', () => {
  it('deletes all image files except the one to keep', async () => {
    const listResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { type: 'file', name: 'old.jpg' },
        { type: 'file', name: 'keep.png' },
        { type: 'file', name: 'orphan_layout.jpg' },
        { type: 'dir', name: 'sub' },
      ]),
    }
    const deleteResponse = { ok: true, status: 200, json: () => Promise.resolve({}) }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValue(deleteResponse)
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getGitHubFileSha).mockResolvedValue('sha123')

    const deleted = await cleanupUserPhotos('test@test.ru', 'keep.png')

    expect(deleted).toBe(2)
    const deleteUrls = fetchMock.mock.calls
      .filter(c => c[1]?.method === 'DELETE')
      .map(c => c[0])
    expect(deleteUrls.some(u => u.includes('old.jpg'))).toBe(true)
    expect(deleteUrls.some(u => u.includes('orphan_layout.jpg'))).toBe(true)
    expect(deleteUrls.some(u => u.includes('keep.png'))).toBe(false)
  })

  it('returns 0 and does not throw when listing fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }))
    const deleted = await cleanupUserPhotos('test@test.ru', 'keep.png')
    expect(deleted).toBe(0)
  })

  it('treats already-deleted files (404) as success, not an error', async () => {
    const listResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { type: 'file', name: 'old.jpg' },
        { type: 'file', name: 'keep.png' },
      ]),
    }
    // DELETE возвращает 404 — файл уже удалён (например, гонка или устаревший список)
    const deleteResponse = { ok: false, status: 404, json: () => Promise.resolve({ message: 'Not Found' }) }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValue(deleteResponse)
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getGitHubFileSha).mockResolvedValue('sha123')

    // Не должно бросать исключение — 404 считается успешной очисткой
    const deleted = await cleanupUserPhotos('test@test.ru', 'keep.png')
    expect(deleted).toBe(1)
  })

  it('treats missing file (no SHA) as already deleted', async () => {
    const listResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { type: 'file', name: 'ghost.jpg' },
        { type: 'file', name: 'keep.png' },
      ]),
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(listResponse)
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getGitHubFileSha).mockResolvedValue(null)

    const deleted = await cleanupUserPhotos('test@test.ru', 'keep.png')
    expect(deleted).toBe(1)
  })
})

describe('selectRandomRunes', () => {
  const files = [
    '1_ФАИС-СУ.png', '2_ФАИС-СУ_П.png', '3_ОРС.png', '4_ОРС_П.png',
    '5_ТУРЗ.png', '6_АЗ.png', '7_РАДО.png', '8_РАДО_П.png', '9_АЛУ.png',
    '10_ХЕБО.png', '11_ХЕБО_П.png', '12_ВИНЬО.png', '13_ВИНЬО_П.png',
    '14_ПУСТАЯ.png', '15_ТАК.png', '16_ТАК_П.png', '17_ЙЕХ.png', '18_ЙЕХ_П.png',
    '19_АЙЯ.png', '20_ЭЙСА.png', '21_ЫРД.png', '22_АЛЬ-ГО.png', '23_ЭЛЬ.png',
    '24_АМАЮН.png', '25_АМАЮН_П.png', '26_БЕРКУТ.png', '27_БЕРКУТ_П.png',
    '28_ВОЗ.png', '29_МЭТР.png', '30_МЭТР_П.png', '31_ЛАТХУ.png', '32_ЛАУКАР.png',
    '33_ША.png', '34_ША_П.png', '35_КИЙГ.png', '36_ЦЭРЭ.png', '37_ЦЭРЭ.png',
    '38_РУНА ТИШИНЫ.png',
  ]

  it('selects exactly 7 unique files', () => {
    const selected = selectRandomRunes(files, 7)
    expect(selected).toHaveLength(7)
    expect(new Set(selected).size).toBe(7)
  })

  it('never selects both «N_НАЗВАНИЕ» and «N_НАЗВАНИЕ_П» together', () => {
    // Ключ группы: имя без порядкового номера и суффикса «_П»
    const key = (f: string) => f.replace(/\.\w+$/, '').replace(/^\d+_/, '').replace(/_П$/, '')
    for (let i = 0; i < 50; i++) {
      const selected = selectRandomRunes(files, 7)
      const keys = selected.map(key)
      // Все ключи должны быть уникальны — значит «_П» и базовая версия не выбраны вместе
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('never selects both duplicate ЦЭРЭ files (same base name)', () => {
    for (let i = 0; i < 50; i++) {
      const selected = selectRandomRunes(files, 7)
      const chere = selected.filter(f => f.includes('ЦЭРЭ'))
      expect(chere.length).toBeLessThanOrEqual(1)
    }
  })

  it('returns all files when count exceeds group count', () => {
    const selected = selectRandomRunes(files, 100)
    expect(selected.length).toBeLessThanOrEqual(files.length)
    expect(new Set(selected).size).toBe(selected.length)
  })
})