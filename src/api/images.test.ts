// src/api/images.test.ts
// Юнит-тесты валидации загрузки изображений (расширения, объём, размеры).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadImageFile } from './images'

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