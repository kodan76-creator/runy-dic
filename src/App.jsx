import { useState, useMemo, useEffect, useRef } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import AdminPanel from './AdminPanel'
import './App.css'

function Home() {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState(null)
  const [playingAudio2, setPlayingAudio2] = useState(null)
  const [currentAudio, setCurrentAudio] = useState(null)
  
  // ← Новые состояния для кнопки "Слушать"
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [playMode, setPlayMode] = useState('sequential') // 'sequential' или 'random'
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0)
  const audioQueueRef = useRef([])
  const currentAudioRef = useRef(null)

  useEffect(() => {
    const loadWords = async () => {
      try {
        const q = query(
          collection(db, 'dictionary'),
          orderBy('translation', 'asc')
        )
        const querySnapshot = await getDocs(q)
        const wordsList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setWords(wordsList)
      } catch (err) {
        console.error('Ошибка загрузки:', err)
      }
      setLoading(false)
    }
    loadWords()
  }, [])

  // ← Функция воспроизведения audio (верхняя кнопка в карточке)
  const playAudio = (wordId, audioFile) => {
    if (!audioFile) return
    
    if (playingId === wordId) {
      stopAudio()
      return
    }
    
    stopAudio()
    
    const baseUrl = import.meta.env.BASE_URL
    const audio = new Audio(`${baseUrl}audio/${audioFile}`)
    audio.play()
    setCurrentAudio(audio)
    setPlayingId(wordId)
    
    audio.onended = () => {
      setPlayingId(null)
      setCurrentAudio(null)
    }
  }

  // ← Функция воспроизведения audio2 (нижняя кнопка в карточке)
  const playAudio2 = (wordId, audioFile) => {
    if (!audioFile) return
    
    if (playingAudio2 === wordId) {
      stopAudio()
      return
    }
    
    stopAudio()
    
    const baseUrl = import.meta.env.BASE_URL
    const audio = new Audio(`${baseUrl}audio/${audioFile}`)
    audio.play()
    setCurrentAudio(audio)
    setPlayingAudio2(wordId)
    
    audio.onended = () => {
      setPlayingAudio2(null)
      setCurrentAudio(null)
    }
  }

  // ← Функция остановки аудио
  const stopAudio = () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setPlayingId(null)
    setPlayingAudio2(null)
  }

  // ← Функция воспроизведения всех аудиофайлов
  const playAllAudio = () => {
    if (isPlayingAll) {
      // Остановить воспроизведение
      stopAllAudio()
      return
    }
    
    // Фильтруем слова с audio полем
    const wordsWithAudio = words.filter(word => word.audio)
    
    if (wordsWithAudio.length === 0) {
      alert('Нет аудиофайлов для воспроизведения')
      return
    }
    
    // Создаём очередь воспроизведения
    let queue = wordsWithAudio.map(word => ({
      id: word.id,
      audio: word.audio,
      word: word.word
    }))
    
    // Если режим случайный - перемешиваем
    if (playMode === 'random') {
      queue = queue.sort(() => Math.random() - 0.5)
    }
    
    audioQueueRef.current = queue
    setCurrentPlayIndex(0)
    setIsPlayingAll(true)
    
    // Запускаем первый файл
    playNextInQueue(0, queue)
  }

  // ← Воспроизведение следующего файла в очереди
  const playNextInQueue = (index, queue) => {
    if (index >= queue.length || !isPlayingAll) {
      stopAllAudio()
      return
    }
    
    const item = queue[index]
    const baseUrl = import.meta.env.BASE_URL
    const audio = new Audio(`${baseUrl}audio/${item.audio}`)
    
    currentAudioRef.current = audio
    setPlayingId(item.id)
    
    audio.play()
    
    audio.onended = () => {
      setPlayingId(null)
      const nextIndex = index + 1
      setCurrentPlayIndex(nextIndex)
      playNextInQueue(nextIndex, queue)
    }
    
    audio.onerror = () => {
      console.error(`Ошибка воспроизведения: ${item.audio}`)
      const nextIndex = index + 1
      setCurrentPlayIndex(nextIndex)
      playNextInQueue(nextIndex, queue)
    }
  }

  // ← Остановка воспроизведения всех аудио
  const stopAllAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    audioQueueRef.current = []
    setIsPlayingAll(false)
    setCurrentPlayIndex(0)
    setPlayingId(null)
  }

  const isPlaying = playingId !== null || playingAudio2 !== null || isPlayingAll

  const filteredData = useMemo(() => {
    return words.filter(item =>
      item.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.transcription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.example && item.example.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.example2 && item.example2.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.transcription2 && item.transcription2.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [searchTerm, words])

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <img
            src="https://kodan76-creator.github.io/runy-dic/run_r.png"
            alt="Logo"
            className="logo"
            width="130"
            height="119"
          />
          <input
            type="text"
            placeholder="Поиск слова..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="loading">Загрузка словаря...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        {/* ← Кнопка "Слушать" слева от лого */}
        <button 
          className={`listen-btn ${isPlayingAll ? 'playing' : ''}`}
          onClick={playAllAudio}
          disabled={isPlaying && !isPlayingAll}
          title={isPlayingAll ? 'Остановить' : 'Слушать все'}
        >
          {isPlayingAll ? '⏹️ Слушать' : '🔊 Слушать'}
        </button>
        
        <img
          src="https://kodan76-creator.github.io/runy-dic/run_r.png"
          alt="Logo"
          className="logo"
          width="130"
          height="119"
        />
        
        {/* ← Радиокнопки выбора режима справа от лого */}
        <div className="play-mode">
          <label className="mode-option">
            <input
              type="radio"
              name="playMode"
              value="sequential"
              checked={playMode === 'sequential'}
              onChange={(e) => setPlayMode(e.target.value)}
              disabled={isPlayingAll}
            />
            <span>1️⃣ Подряд</span>
          </label>
          <label className="mode-option">
            <input
              type="radio"
              name="playMode"
              value="random"
              checked={playMode === 'random'}
              onChange={(e) => setPlayMode(e.target.value)}
              disabled={isPlayingAll}
            />
            <span>2️⃣ Случайно</span>
          </label>
        </div>
      </div>

      <div className="results">
        {filteredData.length > 0 ? (
          filteredData.map(item => (
            <div key={item.id} className="card">
              {/* ← Кнопка воспроизведения audio (левый верхний угол) */}
              {item.audio && (
                <button
                  className={`audio-btn ${playingId === item.id ? 'playing' : ''}`}
                  onClick={() => playAudio(item.id, item.audio)}
                  disabled={isPlaying && playingId !== item.id && !isPlayingAll}
                  title="Воспроизвести"
                >
                  {playingId === item.id ? '⏹️' : '🔊'}
                </button>
              )}
              
              <div className="word-row">
                <h3 className="word">{item.word}</h3>
                {item.transcription && (
                  <span className="transcription">[{item.transcription}]</span>
                )}
              </div>
              <p className="translation">{item.translation}</p>
              <div className="examples">
                <span className="example">{item.example}</span>
                {item.example2 && (
                  <>
                    <span className="dash"> — </span>
                    <span className="example2">{item.example2}</span>
                    {item.transcription2 && (
                      <span className="transcription2"> [{item.transcription2}]</span>
                    )}
                  </>
                )}
              </div>

              {/* ← Кнопка воспроизведения audio2 (левый нижний угол) */}
              {item.audio2 && (
                <button
                  className={`audio-btn-bottom ${playingAudio2 === item.id ? 'playing' : ''}`}
                  onClick={() => playAudio2(item.id, item.audio2)}
                  disabled={isPlaying && playingAudio2 !== item.id && !isPlayingAll}
                  title="Воспроизвести пример"
                >
                  {playingAudio2 === item.id ? '⏹️' : '🔊'}
                </button>
              )}
            </div>
          ))
        ) : (
          <p>Ничего не найдено</p>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Router>
  )
}

export default App