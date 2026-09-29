// src/hooks/useAudioRecorder.ts
// 🎤 Запись аудио с микрофона (MediaRecorder) для полей audio/audio2.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Поля карточки, для которых поддерживается запись аудио. */
export type RecordTarget = 'audio' | 'audio2'

/**
 * Хук записи аудио с микрофона.
 *
 * `handleStartRecording(type)` работает как переключатель:
 *  • запись не идёт      → начинаем запись, возвращаем `null`;
 *  • идёт запись `type`  → останавливаем и возвращаем готовый `Blob`;
 *  • идёт запись другого → прерываем её и возвращаем `null`.
 *
 * Кусочки аудио собираются в ref (а не в state), иначе обработчик `onstop`
 * видел бы устаревший пустой массив и отдавал пустой Blob.
 */
export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState<RecordTarget | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  // Освобождаем микрофон и recorder. Готовый Blob забирает обработчик onstop.
  const releaseRecorder = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    setIsRecording(null)
  }, [])

  // Уход со страницы во время записи: гасим микрофон, чтобы не оставалась
  // «горящая» индикация записи в браузере.
  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.onerror = null
      recorder.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const handleStartRecording = useCallback(async (type: RecordTarget): Promise<Blob | null> => {
    const active = recorderRef.current

    // Запись уже идёт: тот же тип — завершаем и отдаём Blob, другой — прерываем.
    if (active && active.state !== 'inactive') {
      const keepAudio = isRecording === type
      return new Promise<Blob | null>((resolve, reject) => {
        active.onstop = () => {
          const result = keepAudio
            ? new Blob(chunksRef.current, { type: active.mimeType || 'audio/webm' })
            : null
          releaseRecorder()
          resolve(result)
        }
        active.onerror = () => {
          releaseRecorder()
          reject(new Error('Не удалось записать аудио'))
        }
        active.stop()
      })
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает запись аудио — используйте Chrome, Firefox или Safari')
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Браузер не поддерживает запись аудио (MediaRecorder недоступен)')
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    let recorder: MediaRecorder
    try {
      // Без явного mimeType: браузер сам выберет поддерживаемый (обычно audio/webm).
      recorder = new MediaRecorder(stream)
    } catch (err) {
      stream.getTracks().forEach(track => track.stop())
      throw err
    }

    recorderRef.current = recorder
    streamRef.current = stream
    chunksRef.current = []

    // Куски аудио приходят во время записи и на финальном dataavailable.
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.start()
    setIsRecording(type)
    return null
  }, [isRecording, releaseRecorder])

  return { isRecording, handleStartRecording }
}
