import { useState, useEffect } from 'react'
import { 
  getDictionary, 
  verifyUser, 
  registerUser, 
  logoutUser,
  logSearch,
  logAudioPlay
} from './githubApi'
import './App.css'

// Компонент формы входа/регистрации
function AuthForm({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        // Вход
        const user = await verifyUser(email, password)
        if (user) {
          localStorage.setItem('currentUser', JSON.stringify(user))
          onLogin(user)
        } else {
          setError('Неверный email или пароль')
        }
      } else {
        // Регистрация
        if (password !== confirmPassword) {
          throw new Error('Пароли не совпадают')
        }
        if (password.length < 6) {
          throw new Error('Пароль должен быть не менее 6 символов')
        }
        
        const user = await registerUser(email, password)
        localStorage.setItem('currentUser', JSON.stringify(user))
        onLogin(user)
      }
    } catch (err) {
      setError(err.message || 'Ошибка авторизации')
    }
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <img
          src="/runy-dic/run_r.png"
          alt="Logo"
          className="auth-logo"
        />
        <h2>{isLogin ? '🔐 Вход' : '📝 Регистрация'}</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          {!isLogin && (
            <input
              type="password"
              placeholder="Подтвердите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
        
        <button 
          className="toggle-auth-btn"
          onClick={() => {
            setIsLogin(!isLogin)
            setError('')
            setPassword('')
            setConfirmPassword('')
          }}
          disabled={loading}
        >
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}

// Главный компонент приложения
function Home({ user, onLogout }) {
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
  const [lastLoggedSearch, setLastLoggedSearch] = useState('')

  useEffect(() => {
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        const sortedData = [...(data || [])].sort((a, b) => 
          (a.translation || '').localeCompare(b.translation || '')
        )
        setWords(sortedData)
      } catch (err) {
        console.error('Ошибка загрузки:', err)
        setWords([])
      }
      setLoading(false)
    }
    loadWords()
  }, [])

  // ✅ ЛОГИРОВАНИЕ ПОИСКА (с задержкой чтобы не спамить)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm && searchTerm !== lastLoggedSearch) {
        await logSearch(searchTerm, user?.email)
        setLastLoggedSearch(searchTerm)
      }
    }, 1000) // Ждём 1 секунду после окончания ввода
    
    return () => clearTimeout(timer)
  }, [searchTerm, user?.email, lastLoggedSearch])

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
  const playAudio = async (wordId, audioFile) => {
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
    
    // ✅ ЛОГИРОВАНИЕ прослушивания
    await logAudioPlay(audioFile, user?.email)
    
    audio.onended = () => {
      setPlayingId(null)
      setCurrentAudio(null)
    }
  }

  // Воспроизведение audio2 (нижняя кнопка)
  const playAudio2 = async (wordId, audioFile) => {
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
    
    // ✅ ЛОГИРОВАНИЕ прослушивания примера
    await logAudioPlay(audioFile, user?.email)
    
    audio.onended = () => {
      setPlayingAudio2(null)
      setCurrentAudio(null)
    }
  }

  // Воспроизведение всех аудиофайлов
  const playAllAudio = async () => {
    const wordsWithAudio = words.filter(word => word.audio || word.audio2)
    
    if (wordsWithAudio.length === 0) {
      alert('Нет слов с аудиофайлами')
      return
    }
    
    if (isPlayingAll) {
      stopAudio()
      setIsPlayingAll(false)
      setCurrentPlayIndex(-1)
      setCurrentWordIndex(0)
      return
    }
    
    let indices = wordsWithAudio.map((_, index) => index)
    
    if (playMode === 'random') {
      indices = indices.sort(() => Math.random() - 0.5)
    }
    
    setIsPlayingAll(true)
    setCurrentWordIndex(0)
    playNextAudioSequence(wordsWithAudio, indices, 0, 0)
  }

  // Воспроизведение последовательности audio и audio2
  const playNextAudioSequence = (wordsWithAudio, indices, wordIndex, audioType) => {
    if (wordIndex >= indices.length) {
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
      audioFile = word.audio2
      audioType = 1
    } else if (audioType === 1 && !word.audio2) {
      setTimeout(() => {
        playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
      }, 500)
      return
    } else {
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
      
      setTimeout(() => {
        if (audioType === 0 && word.audio2) {
          playNextAudioSequence(wordsWithAudio, indices, wordIndex, 1)
        } else {
          playNextAudioSequence(wordsWithAudio, indices, wordIndex + 1, 0)
        }
      }, 500)
    }
    
    audio.onerror = () => {
      console.error(`Ошибка загрузки файла: ${audioFile}`)
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

  const isAnyAudioPlaying = playingId !== null || playingAudio2 !== null

  const filteredData = words.filter(item =>
    item.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.transcription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.translation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.example && item.example.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.example2 && item.example2.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.transcription2 && item.transcription2.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Обработчик выхода
  const handleLogout = async () => {
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <img
            src="/runy-dic/run_r.png"
            alt="Logo"
            className="logo"
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
        <button
          className={`listen-btn ${isPlayingAll ? 'playing' : ''}`}
          onClick={playAllAudio}
          disabled={isAnyAudioPlaying && !isPlayingAll}
          title={isPlayingAll ? 'Остановить' : 'Слушать все слова'}
        >
          {isPlayingAll ? '⏹️' : '🎧'} Слушать
        </button>

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

        <img
          src="/runy-dic/run_r.png"
          alt="Logo"
          className="logo"
        />

        <input
          type="text"
          placeholder="Поиск слова..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />

        {/* Кнопка выхода для пользователя */}
        <button className="logout-btn-user" onClick={handleLogout}>
          👤 {user?.email?.split('@')[0]} <br/> <small>Выйти</small>
        </button>
      </div>

      <div className="results">
        {filteredData.length > 0 ? (
          filteredData.map(item => (
            <div key={item.id} className="card">
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

// Главный компонент App
function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Проверка авторизации при загрузке
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setAuthLoading(false)
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
  }

  if (authLoading) {
    return <div className="loading-full">Загрузка...</div>
  }

  return (
    <>
      {!user ? (
        <AuthForm onLogin={handleLogin} />
      ) : (
        <Home user={user} onLogout={handleLogout} />
      )}
    </>
  )
}

export default App