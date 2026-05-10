import { useState, useEffect, useRef } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, logoutUser, getDictionary, logSearch, logAudioPlay } from './githubApi'
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

// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [playMode, setPlayMode] = useState('word')
  const [isPlaying, setIsPlaying] = useState(false)
  const currentAudioRef = useRef(null)
  const stopPlaylistRef = useRef(false)
  
  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        const sortedData = [...(data || [])].sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sortedData)
      } catch (err) { console.error('Ошибка загрузки:', err); setWords([]) }
      setLoading(false)
    }
    loadWords()
  }, [user])

  // Логирование поиска
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      if (searchTerm && searchTerm.trim().length > 0) {
        logSearch(searchTerm, user.email)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, user])
  
  const handleLogout = async () => {
    stopAudio()
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  const getAudioSrc = (fileName) => {
    if (!fileName) return ''
    if (/^https?:\/\//i.test(fileName)) return fileName
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

  const playAudioFile = (fileName) => {
    return new Promise((resolve) => {
      if (!fileName) {
        resolve()
        return
      }

      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }

      const audio = new Audio(getAudioSrc(fileName))
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

  const handleSingleAudio = async (fileName) => {
    stopPlaylistRef.current = false
    setIsPlaying(true)
    await playAudioFile(fileName)
    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  const handleListenAll = async () => {
    if (isPlaying) {
      stopAudio()
      return
    }

    const audioKey = playMode === 'word' ? 'audio' : 'audio2'
    const playlist = filtered.map(item => item[audioKey]).filter(Boolean)
    if (playlist.length === 0) return

    stopPlaylistRef.current = false
    setIsPlaying(true)

    for (const fileName of playlist) {
      if (stopPlaylistRef.current) break
      await playAudioFile(fileName)
    }

    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  useEffect(() => {
    return () => stopAudio()
  }, [])
  
  if (loading) return <div className="loading-full">Загрузка словаря...</div>
  
  const filtered = words.filter(w =>
    w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  return (
    <div className="container">
      <div className="header">
        <button
          className={`listen-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handleListenAll}
          disabled={!filtered.some(item => playMode === 'word' ? item.audio : item.audio2)}
        >
          {isPlaying ? 'Стоп' : 'Слушать'}
        </button>
        <div className="play-mode">
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="word"
              checked={playMode === 'word'}
              onChange={() => setPlayMode('word')}
            />
            Слова
          </label>
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="example"
              checked={playMode === 'example'}
              onChange={() => setPlayMode('example')}
            />
            Примеры
          </label>
        </div>
        <img src="/runy-dic/run_r.png" alt="Logo" className="logo" />
        <div className="search-wrapper">
          <input 
            type="text" 
            placeholder="Поиск слова..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="search-input" 
          />
          {searchTerm && (
            <button 
              className="search-clear-btn" 
              onClick={() => setSearchTerm('')}
              title="Очистить поиск"
            >
              ❌
            </button>
          )}
        </div>
        <button className="logout-btn-user" onClick={handleLogout}>
          👤 {user?.email?.split('@')[0]} <br/> <small>Выйти</small>
        </button>
      </div>
      <div className="results">
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            {item.audio && (
              <button className="audio-btn" onClick={() => handleSingleAudio(item.audio)} title="Слушать слово">
                🔊
              </button>
            )}
            <div className="word-row">
              <h3 className="word">{item.word}</h3>
              {item.transcription && <span className="transcription">[{item.transcription}]</span>}
            </div>
            <p className="translation">{item.translation}</p>
            {(item.example || item.example2 || item.transcription2) && (
              <div className="examples">
                {item.example && <span className="example">{item.example}</span>}
                {item.example && item.example2 && <span className="dash"> — </span>}
                {item.example2 && <span className="example2">{item.example2}</span>}
                {item.transcription2 && <span className="transcription2">[{item.transcription2}]</span>}
              </div>
            )}
            {item.audio2 && (
              <button className="audio-btn-bottom" onClick={() => handleSingleAudio(item.audio2)} title="Слушать пример">
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
const getSavedUser = () => {
  const adminUser = localStorage.getItem('adminUser')
  const currentUser = localStorage.getItem('currentUser')
  const isAdminRoute = window.location.hash.startsWith('#/admin')

  if (isAdminRoute && adminUser) {
    try {
      const parsed = JSON.parse(adminUser)
      return { ...parsed, role: 'admin' }
    } catch {
      localStorage.removeItem('adminUser')
    }
  }

  if (currentUser) {
    try {
      const parsed = JSON.parse(currentUser)
      return { ...parsed, role: parsed.role || 'user' }
    } catch {
      localStorage.removeItem('currentUser')
    }
  }

  return null
}

function App() {
  const [user, setUser] = useState(getSavedUser)
  
  const handleUserLogin = (userData) => {
    setUser({ ...userData, role: userData.role || 'user' })
  }
  
  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('adminUser')
    setUser(null)
  }
  
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminPanel onAdminLogin={(u) => setUser({ ...u, role: 'admin' })} onAdminLogout={handleLogout} />} />
        
        {/* ✅ ИСПРАВЛЕНО: Правильная проверка ролей */}
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
            user?.role === 'user' ? (
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
