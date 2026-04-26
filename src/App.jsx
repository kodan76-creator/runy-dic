import { useState, useMemo, useEffect } from 'react'
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
  const [playMode, setPlayMode] = useState('sequential')
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [currentPlayIndex, setCurrentPlayIndex] = useState(-1)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)

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

  // Остановка текущего аудио
  const stopAudio = () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setPlayingId(null)
    setPlayingAudio2(null)
  }

  // Воспроизведение audio (верхняя кнопка)
  const playAudio = (wordId, audioFile) => {
    if (!audioFile) return
    
    // Если уже играет этот файл - останавливаем
    if (playingId === wordId) {
      stopAudio()
      return
    }
    
    // Останавливаем всё текущее воспроизведение
    stopAudio()
    
    // Воспроизводим новый файл
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

  // Воспроизведение audio2 (нижняя кнопка)
  const playAudio2 = (wordId, audioFile) => {
    if (!audioFile) return
    
    // Если уже играет этот файл - останавливаем
    if (playingAudio2 === wordId) {
      stopAudio()
      return
    }
    
    // Останавливаем всё текущее воспроизведение
    stopAudio()
    
    // Воспроизводим новый файл
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

  // Воспроизведение всех аудиофайлов
  const playAllAudio = () => {
    const wordsWithAudio = words.filter(word => word.audio || word.audio2)
    
    if (wordsWithAudio.length === 0) {
      alert('Нет слов с аудиофайлами')
      return
    }
    
    if (isPlayingAll) {
      // Остановить воспроизведение
      stopAudio()
      setIsPlayingAll(false)
      setCurrentPlayIndex(-1)
      setCurrentWordIndex(0)
      return
    }
    
    // Создать массив индексов
    let indices = wordsWithAudio.map((_, index) => index)
    
    // Если случайный режим - перемешать
    if (playMode === 'random') {
      indices = indices.sort(() => Math.random() - 0.5)
    }
    
    setIsPlayingAll(true)
    setCurrentWordIndex(0)
    playNextAudioSequence(wordsWithAudio, indices, 0, 0)
  }

  // Воспроизведение последовательности audio и audio2 для каждого слова
  const playNextAudioSequence = (wordsWithAudio, indices, wordIndex, audioType) => {
    // audioType: 0 = audio, 1 = audio2
    
    if (wordIndex >= indices.length) {
      // Все файлы воспроизведены
      setIsPlayingAll(false)
      setCurrentPlayIndex(-1)
      setCurrentWordIndex(0)
      return
    }
    
    const wordRealIndex = indices[wordIndex]
    const word = wordsWithAudio[wordRealIndex]
    
    setCurrentPlayIndex(wordIndex)
    setCurrentWordIndex(wordIndex)
    
    let audioFile = null
    
    if (audioType === 0 && word.audio) {
      audioFile = word.audio
    } else if (audioType === 1 && word.audio2) {
      audioFile = word.audio2
    } else if (audioType === 0 && !word.audio && word.audio2) {
      // Если нет audio, но есть audio2 - воспроизводим audio2
      audioFile = word.audio2
      audioType = 1
    } else if (audioType === 1 && !word.audio2) {
      // Если нет audio2, переходим к следующему слову
      setTimeout(() => {
        playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
      }, 500)
      return
    } else {
      // Нет подходящего файла, переходим к следующему слову
      setTimeout(() => {
        playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
      }, 500)
      return
    }
    
    const baseUrl = import.meta.env.BASE_URL
    const audio = new Audio(`${baseUrl}audio/${audioFile}`)
    audio.play()
    setCurrentAudio(audio)
    
    if (audioType === 0) {
      setPlayingId(word.id)
    } else {
      setPlayingAudio2(word.id)
    }
    
    audio.onended = () => {
      if (audioType === 0) {
        setPlayingId(null)
      } else {
        setPlayingAudio2(null)
      }
      setCurrentAudio(null)
      
      // Переход к следующему типу аудио или следующему слову
      setTimeout(() => {
        if (audioType === 0 && word.audio2) {
          // После audio воспроизводим audio2 того же слова
          playNextAudioSequence(wordsWithAudio, indices, wordIndex, 1)
        } else {
          // Переходим к следующему слову
          playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
        }
      }, 500)
    }
    
    audio.onerror = () => {
      console.error(`Ошибка загрузки файла: ${audioFile}`)
      // Перейти к следующему файлу
      if (audioType === 0) {
        setPlayingId(null)
      } else {
        setPlayingAudio2(null)
      }
      setCurrentAudio(null)
      
      setTimeout(() => {
        if (audioType === 0 && word.audio2) {
          playNextAudioSequence(wordsWithAudio, indices, wordIndex, 1)
        } else {
          playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
        }
      }, 500)
    }
  }

  // Проверка: играет ли что-то сейчас
  const isAnyAudioPlaying = playingId !== null || playingAudio2 !== null

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
        {/* Кнопка "Слушать" слева */}
        <button
          className={`listen-btn ${isPlayingAll ? 'playing' : ''}`}
          onClick={playAllAudio}
          disabled={isAnyAudioPlaying && !isPlayingAll}
          title={isPlayingAll ? 'Остановить' : 'Слушать все слова'}
        >
          {isPlayingAll ? '⏹️' : '🎧'} Слушать
        </button>

        {/* Радио-кнопки выбора режима (вертикально) */}
        <div className="play-mode">
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="sequential"
              checked={playMode === 'sequential'}
              onChange={(e) => setPlayMode(e.target.value)}
              disabled={isPlayingAll || isAnyAudioPlaying}
            />
            <span>подряд</span>
          </label>
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="random"
              checked={playMode === 'random'}
              onChange={(e) => setPlayMode(e.target.value)}
              disabled={isPlayingAll || isAnyAudioPlaying}
            />
            <span>случайно</span>
          </label>
        </div>

        {/* Логотип */}
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

      <div className="results">
        {filteredData.length > 0 ? (
          filteredData.map(item => (
            <div key={item.id} className="card">
              {/* Кнопка воспроизведения audio (левый верхний угол) */}
              {item.audio && (
                <button
                  className={`audio-btn ${playingId === item.id ? 'playing' : ''}`}
                  onClick={() => playAudio(item.id, item.audio)}
                  disabled={isPlayingAll || (isAnyAudioPlaying && playingId !== item.id)}
                  title={playingId === item.id ? 'Остановить' : 'Воспроизвести'}
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

              {/* Кнопка воспроизведения audio2 (левый нижний угол) */}
              {item.audio2 && (
                <button
                  className={`audio-btn-bottom ${playingAudio2 === item.id ? 'playing' : ''}`}
                  onClick={() => playAudio2(item.id, item.audio2)}
                  disabled={isPlayingAll || (isAnyAudioPlaying && playingAudio2 !== item.id)}
                  title={playingAudio2 === item.id ? 'Остановить' : 'Воспроизвести пример'}
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