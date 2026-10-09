// src/hooks/useAudioPlayback.js
// Хук воспроизведения аудио: одиночный файл и плейлист (подряд/случайно).
import { useRef, useState } from 'react'
import { logAudioPlay, emailToFolderName } from '../githubApi'
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } from '../api/constants'
import { getOfflineBlob } from '../api/offlineContent'

export function useAudioPlayback({ user, words, playMode }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const stopPlaylistRef = useRef(false)
  // Номер текущей попытки воспроизведения: отменяет откат на raw для файла,
  // который уже остановили или заменили другим.
  const playTokenRef = useRef(0)

  const getAudioSrc = (fileName, userFolder) => {
    if (!fileName) return ''
    if (/^https?:\/\//i.test(fileName)) return fileName
    // Если имя файла содержит "/" — путь уже полный (старый формат)
    if (fileName.includes('/')) return `${import.meta.env.BASE_URL}audio/${fileName}`
    // Если передана папка пользователя — ищем в её подпапке (личный словарь)
    if (userFolder) return `${import.meta.env.BASE_URL}audio/${userFolder}/${fileName}`
    // Общий словарь — файлы в корне public/audio/
    return `${import.meta.env.BASE_URL}audio/${fileName}`
  }

  // Резервный URL на raw.githubusercontent — для файлов, которые уже есть в
  // репозитории (только что записаны/загружены в админке), но ещё не попали в
  // собранный сайт. Иначе карточка молчит до следующего деплоя.
  const getRawAudioSrc = (fileName, userFolder) => {
    if (!fileName) return ''
    if (/^https?:\/\//i.test(fileName)) return fileName
    const base = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/public/audio/`
    if (fileName.includes('/')) return `${base}${fileName}`
    if (userFolder) return `${base}${userFolder}/${fileName}`
    return `${base}${fileName}`
  }

  const stopAudio = () => {
    stopPlaylistRef.current = true
    playTokenRef.current++ // отменяем откат на raw для остановленного файла
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setIsPlaying(false)
  }

  const playAudioFile = (fileName, userFolder) => {
    return new Promise<void>((resolve) => {
      if (!fileName) {
        resolve()
        return
      }

      // Новая попытка отменяет незавершённый откат на raw у предыдущего файла
      const token = ++playTokenRef.current
      const isCurrent = () => token === playTokenRef.current
      const finish = () => resolve()

      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }

      const localSrc = getAudioSrc(fileName, userFolder)
      const rawSrc = getRawAudioSrc(fileName, userFolder)
      logAudioPlay(fileName, user?.email)

      // Оффлайн-приоритет: если файл уже сохранён в IndexedDB — играем из
      // локального blob-URL, не дожидаясь сети. Blob-URL живёт до revokeBlob.
      let blobUrl = ''
      const revokeBlob = () => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
          blobUrl = ''
        }
      }

      const attempt = (src) => {
        // Файл остановили или запустили другой — откат уже не нужен
        if (!isCurrent()) { revokeBlob(); finish(); return }

        const audio = new Audio(src)
        currentAudioRef.current = audio
        let settled = false

        const release = () => {
          if (currentAudioRef.current === audio) currentAudioRef.current = null
        }
        const done = () => {
          if (settled) return
          settled = true
          release()
          revokeBlob()
          finish()
        }
        // Сбой локального URL (файл ещё не в сборке сайта) — пробуем raw.githubusercontent
        const fail = () => {
          if (settled) return
          settled = true
          release()
          // Откат на raw только для сетевого localSrc; blob-URL — сразу finish
          if (src === localSrc && rawSrc && rawSrc !== localSrc) attempt(rawSrc)
          else { revokeBlob(); finish() }
        }

        audio.addEventListener('ended', done, { once: true })
        audio.addEventListener('error', fail, { once: true })
        audio.play().catch(fail)
      }

      // Сначала пробуем локальный blob из IndexedDB (гарантированный оффлайн).
      // Если хранилища нет (jsdom, приватный режим) — сразу обычная цепочка,
      // чтобы не задерживать воспроизведение лишней микротаской.
      const playFromBlobOrNetwork = async () => {
        const blob = await getOfflineBlob(localSrc)
        if (!isCurrent()) { finish(); return }
        if (blob) {
          blobUrl = URL.createObjectURL(blob)
          attempt(blobUrl)
        } else {
          attempt(localSrc)
        }
      }

      if (typeof indexedDB === 'undefined') attempt(localSrc)
      else playFromBlobOrNetwork()
    })
  }

  const handleSingleAudio = async (fileName, isPersonal) => {
    stopPlaylistRef.current = false
    setIsPlaying(true)
    const userFolder = isPersonal && user?.email ? emailToFolderName(user.email) : null
    await playAudioFile(fileName, userFolder)
    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  const handleListenAll = async () => {
    if (isPlaying) {
      stopAudio()
      return
    }

    const cards = playMode === 'random'
      ? [...words].sort(() => Math.random() - 0.5)
      : words
    const playlist = cards.flatMap(item => {
      const isPersonal = item.__dictionarySource === 'personal'
      return [item.audio, item.audio2].filter(Boolean).map(f => ({ fileName: f, isPersonal }))
    })
    if (playlist.length === 0) return

    stopPlaylistRef.current = false
    setIsPlaying(true)

    const userFolderBase = user?.email ? emailToFolderName(user.email) : null
    for (const { fileName, isPersonal } of playlist) {
      if (stopPlaylistRef.current) break
      const userFolder = isPersonal ? userFolderBase : null
      await playAudioFile(fileName, userFolder)
    }

    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  return { isPlaying, stopAudio, handleSingleAudio, handleListenAll }
}
