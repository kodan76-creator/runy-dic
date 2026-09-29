// src/hooks/useAudioRecorder.test.ts
// Регрессия: запись аудио с микрофона. Раньше куски аудио складывались в state,
// поэтому onstop читал устаревший (пустой) массив и отдавал пустой Blob.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioRecorder } from './useAudioRecorder'

// ── Заглушка MediaRecorder: реальный микрофон в тестах недоступен ────────────
class MockMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    // Браузер отдаёт последний кусок аудио перед событием stop
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

const stopTrack = vi.fn()
const mockStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
const getUserMedia = vi.fn(async () => mockStream)

const setMediaDevices = (value: unknown) => {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true })
}

describe('useAudioRecorder', () => {
  beforeEach(() => {
    stopTrack.mockClear()
    getUserMedia.mockClear()
    setMediaDevices({ getUserMedia })
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setMediaDevices(undefined)
  })

  it('старт возвращает null, остановка — Blob с записанным аудио', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      expect(await result.current.handleStartRecording('audio')).toBeNull()
    })
    expect(result.current.isRecording).toBe('audio')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })

    let blob: Blob | null = null
    await act(async () => {
      blob = await result.current.handleStartRecording('audio')
    })

    expect(result.current.isRecording).toBeNull()
    expect(blob).toBeInstanceOf(Blob)
    expect(await (blob as unknown as Blob).text()).toBe('chunk')
    expect(stopTrack).toHaveBeenCalled()
  })

  it('прерывает запись другого поля и не отдаёт её аудио', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.handleStartRecording('audio')
    })
    expect(result.current.isRecording).toBe('audio')

    let blob: Blob | null = null
    await act(async () => {
      blob = await result.current.handleStartRecording('audio2')
    })

    expect(blob).toBeNull()
    expect(result.current.isRecording).toBeNull()
  })

  it('сообщает, что браузер не поддерживает запись', async () => {
    setMediaDevices(undefined)
    const { result } = renderHook(() => useAudioRecorder())

    await expect(result.current.handleStartRecording('audio')).rejects.toThrow(/не поддерживает/)
  })

  it('освобождает микрофон при размонтировании во время записи', async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.handleStartRecording('audio')
    })
    unmount()

    expect(stopTrack).toHaveBeenCalled()
  })
})
