// src/hooks/useAudioPlayback.js
// Хук воспроизведения аудио: одиночный файл и плейлист (подряд/случайно).
import { useRef, useState } from 'react'
import { logAudioPlay, emailToFolderName } from '../githubApi'

export function useAudioPlayback({ user, words, playMode }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const currentAudioRef = useRef(null)
  const stopPlaylistRef = useRef(false)

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

  const stopAudio = () => {
    stopPlaylistRef.current = true
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setIsPlaying(false)
  }

  const playAudioFile = (fileName, userFolder) => {
    return new Promise((resolve) => {
      if (!fileName) {
        resolve()
        return
      }

      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }

      const audio = new Audio(getAudioSrc(fileName, userFolder))
      currentAudioRef.current = audio
      logAudioPlay(fileName, user?.email)

      const finish = () => {
        if (currentAudioRef.current === audio) currentAudioRef.current = null
        resolve()
      }

      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', finish, { once: true })
      audio.play().catch(finish)
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
