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
  const [playingId, setPlayingId] = useState(null) // ← Для отслеживания воспроизведения

  useEffect(() => {
    const loadWords = async () => {
      try {
        const q = query(
          collection(db, 'dictionary'),
          orderBy('createdAt', 'asc')
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

  // ← Функция воспроизведения аудио
  const playAudio = (wordId, audioFile) => {
    if (!audioFile) return
    
    // Если уже играет этот файл - останавливаем
    if (playingId === wordId) {
      const existingAudio = document.querySelector(`audio[data-id="${wordId}"]`)
      if (existingAudio) {
        existingAudio.pause()
        existingAudio.currentTime = 0
      }
      setPlayingId(null)
      return
    }
    
    // Останавливаем предыдущее воспроизведение
    const allAudios = document.querySelectorAll('audio')
    allAudios.forEach(audio => {
      audio.pause()
      audio.currentTime = 0
    })
    
    // Воспроизводим новый файл
    const audio = new Audio(`/runy-dic/audio/${audioFile}`)
    audio.dataset.id = wordId
    audio.play()
    setPlayingId(wordId)
    
    // Сбрасываем состояние после окончания
    audio.onended = () => {
      setPlayingId(null)
    }
  }

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
              {/* ← Кнопка воспроизведения в левом верхнем углу */}
              {item.audio && (
                <button
                  className={`audio-btn ${playingId === item.id ? 'playing' : ''}`}
                  onClick={() => playAudio(item.id, item.audio)}
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