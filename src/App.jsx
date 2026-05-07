import { useState, useEffect, useRef } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, logoutUser, getDictionary, logSearch } from './githubApi'
import AdminPanel from './AdminPanel'
import './App.css'

// Форма входа/регистрации
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

// Главный экран пользователя (ВОССТАНОВЛЕНЫ ВСЕ КНОПКИ И ПОЛЯ)
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Аудио-состояния
  const [isPlaying, setIsPlaying] = useState(false)
  const [playMode, setPlayMode] = useState('all')
  const [playlist, setPlaylist] = useState([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const audioRef = useRef(null)

  // Загрузка слов
  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        const sorted = [...(data || [])].sort((a, b) => 
          (a.translation || '').localeCompare(b.translation || '', 'ru')
        )
        setWords(sorted)
      } catch (err) { 
        console.error('Ошибка загрузки:', err)
        setWords([]) 
      }
      setLoading(false)
    }
    loadWords()
  }, [user])

  // Логирование поиска
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      if (searchTerm?.trim()) logSearch(searchTerm, user.email)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, user])

  // Формирование плейлиста (audio -> audio2 для каждого слова)
  useEffect(() => {
    if (!words.length) return
    let list = [...words]
    if (playMode === 'random') list.sort(() => Math.random() - 0.5)
    
    const pl = []
    list.forEach(w => {
      if (w.audio?.trim()) pl.push({ word: w, file: w.audio })
      if (w.audio2?.trim()) pl.push({ word: w, file: w.audio2 })
    })
    setPlaylist(pl)
    setCurrentTrackIndex(0)
  }, [words, playMode])

  // Воспроизведение при смене индекса
  useEffect(() => {
    if (!playlist.length || !audioRef.current) return
    if (!isPlaying || currentTrackIndex >= playlist.length) {
      if (currentTrackIndex >= playlist.length) setIsPlaying(false)
      return
    }
    const track = playlist[currentTrackIndex]
    const src = track.file.startsWith('http') ? track.file : `${import.meta.env.BASE_URL || '/'}audio/${track.file}`
    audioRef.current.src = src
    audioRef.current.play().catch(() => setIsPlaying(false))
  }, [currentTrackIndex, isPlaying])

  // Автопереключение
  useEffect(() => {
    const aud = audioRef.current
    if (!aud) return
    aud.onended = () => isPlaying && setCurrentTrackIndex(p => p + 1)
    return () => { aud.onended = null }
  }, [isPlaying])

  const togglePlay = () => {
    if (isPlaying) { 
      setIsPlaying(false)
      audioRef.current?.pause() 
    } else {
      if (!playlist.length) return
      setIsPlaying(true)
      if (currentTrackIndex >= playlist.length) setCurrentTrackIndex(0)
    }
  }

  const playSingle = (file) => {
    setIsPlaying(false)
    const src = file.startsWith('http') ? file : `${import.meta.env.BASE_URL || '/'}audio/${file}`
    if (audioRef.current) {
      audioRef.current.src = src
      audioRef.current.play().catch(console.error)
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
        {/* ✅ КНОПКА СЛУШАТЬ */}
        <button className={`listen-btn ${isPlaying ? 'playing' : ''}`} onClick={togglePlay} disabled={!playlist.length}>
          {isPlaying ? '⏸ Остановить' : '▶ Слушать'}
        </button>
        
        {/* ✅ РАДИОКНОПКИ */}
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
        
        {/* ✅ ПОИСК С КРЕСТИКОМ */}
        <div className="search-wrapper">
          <input type="text" placeholder="Поиск слова..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')} title="Очистить поиск">❌</button>
          )}
        </div>

        <button className="logout-btn-user" onClick={handleLogout}>
          👤 {user?.email?.split('@')[0]} <br/><small>Выйти</small>
        </button>
      </div>
      
      <div className="results">
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            {/* ✅ КНОПКА AUDIO СВЕРХУ */}
            {item.audio && (
              <button className="audio-btn" onClick={() => playSingle(item.audio)}>🔊</button>
            )}
            <div className="word-row">
              <h3 className="word">{item.word}</h3>
              {item.transcription && <span className="transcription">[{item.transcription}]</span>}
            </div>
            <p className="translation">{item.translation}</p>
            
            {/* ✅ ПРИМЕРЫ */}
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
            
            {/* ✅ КНОПКА AUDIO2 СНИЗУ */}
            {item.audio2 && (
              <button className="audio-btn-bottom" onClick={() => playSingle(item.audio2)}>🔊</button>
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
  
  // Умное восстановление сессии по URL
  useEffect(() => {
    const adminUser = localStorage.getItem('adminUser')
    const currentUser = localStorage.getItem('currentUser')
    const hash = window.location.hash || window.location.pathname
    const isAdminRoute = hash.includes('/admin')

    if (isAdminRoute && adminUser) {
      try { setUser({ ...JSON.parse(adminUser), role: 'admin' }) } catch {}
    } else if (currentUser) {
      try { setUser({ ...JSON.parse(currentUser), role: 'user' }) } catch {}
    } else if (adminUser) {
      try { setUser({ ...JSON.parse(adminUser), role: 'admin' }) } catch {}
    }
    setAuthLoading(false)
  }, [])
  
  const handleUserLogin = (userData) => {
    setUser({ ...userData, role: userData.role || 'user' })
  }
  
  const handleLogout = (userRole) => {
    if (userRole === 'admin') {
      localStorage.removeItem('adminUser')
    } else {
      localStorage.removeItem('currentUser')
    }
    setUser(null)
  }
  
  if (authLoading) return <div className="loading-full">Загрузка...</div>
  
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={
          <AdminPanel 
            onAdminLogin={(u) => setUser({ ...u, role: 'admin' })} 
            onAdminLogout={() => handleLogout('admin')}
          /> 
        } />
        
        {/* ✅ Явная проверка ролей */}
        <Route path="/auth" element={
          user?.role === 'admin' ? <Navigate to="/admin" replace /> :
          user?.role === 'user' ? <Navigate to="/" replace /> :
          <UserAuthForm onLogin={handleUserLogin} />
        } />
        
        <Route path="/" element={
          user?.role === 'user' ? <Home user={user} onLogout={() => handleLogout('user')} /> : <Navigate to="/auth" replace />
        } />
        
        <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : user?.role === 'user' ? '/' : '/auth'} replace />} />
      </Routes>
    </Router>
  )
}

export default App