import { useState, useEffect, useRef } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
// ✅ Добавлен logSearch в импорт
import { verifyUser, registerUser, logoutUser, getDictionary, logSearch } from './githubApi'
import AdminPanel from './AdminPanel'
import './App.css'

// Форма входа/регистрации для ПОЛЬЗОВАТЕЛЕЙ
function UserAuthForm({ onLogin }) {
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
        const user = await verifyUser(email, password)
        if (user) {
          const userWithRole = { ...user, role: user.role || 'user' }
          localStorage.setItem('currentUser', JSON.stringify(userWithRole))
          onLogin(userWithRole)
        } else {
          setError('Неверный email или пароль')
        }
      } else {
        if (password !== confirmPassword) throw new Error('Пароли не совпадают')
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов')
        const user = await registerUser(email, password)
        const userWithRole = { ...user, role: 'user' }
        localStorage.setItem('currentUser', JSON.stringify(userWithRole))
        onLogin(userWithRole)
      }
    } catch (err) {
      setError(err.message || 'Ошибка авторизации')
    }
    setLoading(false)
  }
  
  return (
    <div className="auth-container">
      <div className="auth-box">
        <img src="/runy-dic/run_r.png" alt="Logo" className="auth-logo" />
        <h2>{isLogin ? '🔐 Вход' : '📝 Регистрация'}</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" name="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} autoComplete="username" />
          <input type="password" name="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
          {!isLogin && <input type="password" placeholder="Подтвердите пароль" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} autoComplete="new-password" />}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading}>{loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}</button>
        </form>
        <button className="toggle-auth-btn" onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setConfirmPassword('') }} disabled={loading}>
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}

// ✅ ВОССТАНОВЛЕННЫЙ главный экран с аудио и логированием поиска
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Состояния для аудио
  const [isPlaying, setIsPlaying] = useState(false)
  const [playMode, setPlayMode] = useState('all')
  const [playlist, setPlaylist] = useState([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  
  const audioRef = useRef(null)

  // 1. Загрузка слов
  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        const sorted = [...(data || [])].sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sorted)
      } catch (err) {
        console.error('Ошибка загрузки:', err)
        setWords([])
      }
      setLoading(false)
    }
    loadWords()
  }, [user])

  // ✅ 2. ЛОГИРОВАНИЕ ПОИСКА (с задержкой 500мс)
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      if (searchTerm && searchTerm.trim().length > 0) {
        logSearch(searchTerm, user.email)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, user])

  // 3. Формирование плейлиста
  useEffect(() => {
    if (words.length === 0) return

    let wordList = [...words]
    if (playMode === 'random') {
      wordList.sort(() => Math.random() - 0.5)
    }

    const newPlaylist = []
    wordList.forEach(w => {
      if (w.audio && w.audio.trim()) {
        newPlaylist.push({ word: w, file: w.audio })
      }
      if (w.audio2 && w.audio2.trim()) {
        newPlaylist.push({ word: w, file: w.audio2 })
      }
    })

    setPlaylist(newPlaylist)
    setCurrentTrackIndex(0)
  }, [words, playMode])

  // 4. Воспроизведение при смене индекса
  useEffect(() => {
    if (playlist.length === 0 || !audioRef.current) return

    if (!isPlaying || currentTrackIndex >= playlist.length) {
      if (currentTrackIndex >= playlist.length) setIsPlaying(false)
      return
    }

    const track = playlist[currentTrackIndex]
    playTrack(track)

  }, [currentTrackIndex, isPlaying])

  // 5. Обработка окончания трека
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    audio.onended = () => {
      if (isPlaying) {
        setCurrentTrackIndex(prev => prev + 1)
      }
    }
    return () => { audio.onended = null }
  }, [isPlaying])

  const playTrack = (track) => {
    if (!audioRef.current || !track?.file) return
    
    let src
    if (track.file.startsWith('http')) {
      src = track.file
    } else {
      const baseUrl = import.meta.env.BASE_URL || '/'
      const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
      src = `${cleanBase}/audio/${track.file}`
    }

    audioRef.current.src = src
    audioRef.current.play().catch((err) => {
      console.error('Audio play error:', err)
      setIsPlaying(false)
    })
  }

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      audioRef.current?.pause()
    } else {
      if (playlist.length === 0) return
      setIsPlaying(true)
      if (currentTrackIndex >= playlist.length) {
        setCurrentTrackIndex(0)
      }
    }
  }

  const handleLogout = async () => {
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  if (loading) return <div className="loading-full">Загрузка словаря...</div>

  const filtered = words.filter(w =>
    w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="container">
      <audio ref={audioRef} style={{ display: 'none' }} />
      
      <div className="header">
        <button className={`listen-btn ${isPlaying ? 'playing' : ''}`} onClick={togglePlay} disabled={playlist.length === 0}>
          {isPlaying ? '⏸ Остановить' : '▶ Слушать'}
        </button>
        
        <div className="play-mode">
          <label className="mode-label">
            <input type="radio" name="mode" value="all" checked={playMode === 'all'} onChange={() => setPlayMode('all')} />
            По порядку
          </label>
          <label className="mode-label">
            <input type="radio" name="mode" value="random" checked={playMode === 'random'} onChange={() => setPlayMode('random')} />
            Случайно
          </label>
        </div>

        <img src="/runy-dic/run_r.png" alt="Logo" className="logo" />
        <input type="text" placeholder="Поиск слова..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <button className="logout-btn-user" onClick={handleLogout}>
          👤 {user?.email?.split('@')[0]} <br/> <small>Выйти</small>
        </button>
      </div>

      <div className="results">
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            {item.audio && (
              <button className="audio-btn" onClick={() => { setIsPlaying(false); playTrack({ word: item, file: item.audio }) }}>
                🔊
              </button>
            )}
            <div className="word-row">
              <h3 className="word">{item.word}</h3>
              {item.transcription && <span className="transcription">[{item.transcription}]</span>}
            </div>
            <p className="translation">{item.translation}</p>
            <div className="examples">
              {item.example && <p className="example">{item.example}</p>}
              {item.example2 && (
                <>
                  <span className="dash">—</span>
                  <p className="example2">{item.example2}</p>
                </>
              )}
              {item.transcription2 && <span className="transcription2">[{item.transcription2}]</span>}
            </div>
            {item.audio2 && (
              <button className="audio-btn-bottom" onClick={() => { setIsPlaying(false); playTrack({ word: item, file: item.audio2 }) }}>
                🔊
              </button>
            )}
          </div>
        )) : <p>Ничего не найдено</p>}
      </div>
    </div>
  )
}

// Главный App
function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  
  useEffect(() => {
    const adminUser = localStorage.getItem('adminUser')
    const currentUser = localStorage.getItem('currentUser')
    if (adminUser) {
      try {
        const parsed = JSON.parse(adminUser)
        setUser({ ...parsed, role: 'admin' })
      } catch {}
    } else if (currentUser) {
      try {
        const parsed = JSON.parse(currentUser)
        setUser({ ...parsed, role: parsed.role || 'user' })
      } catch {}
    }
    setAuthLoading(false)
  }, [])
  
  const handleUserLogin = (userData) => {
    setUser({ ...userData, role: userData.role || 'user' })
  }
  
  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('adminUser')
    setUser(null)
  }
  
  if (authLoading) return <div className="loading-full">Загрузка...</div>
  
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminPanel onAdminLogin={(u) => setUser({ ...u, role: 'admin' })} onAdminLogout={handleLogout} />} />
        
        <Route
          path="/auth"
          element={
            user?.role === 'admin' ? <Navigate to="/admin" replace /> :
            user?.role === 'user' ? <Navigate to="/" replace /> :
            <UserAuthForm onLogin={handleUserLogin} />
          }
        />
        
        <Route
          path="/"
          element={
            user && user.role === 'user' ? (
              <Home user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        
        <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : user?.role === 'user' ? '/' : '/auth'} replace />} />
      </Routes>
    </Router>
  )
}

export default App