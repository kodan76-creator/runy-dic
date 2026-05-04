import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { 
  verifyUser, 
  registerUser, 
  logoutUser, 
  logSearch, 
  logAudioPlay,
  getDictionary 
} from './githubApi'
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
          localStorage.setItem('currentUser', JSON.stringify(user))
          onLogin(user)
        } else {
          setError('Неверный email или пароль')
        }
      } else {
        if (password !== confirmPassword) throw new Error('Пароли не совпадают')
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов')
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
        <img src="/runy-dic/run_r.png" alt="Logo" className="auth-logo" />
        <h2>{isLogin ? '🔐 Вход' : '📝 Регистрация'}</h2>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
          {!isLogin && <input type="password" placeholder="Подтвердите пароль" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} />}
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

// Главный экран приложения для ПОЛЬЗОВАТЕЛЕЙ
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState(null)
  const [playingAudio2, setPlayingAudio2] = useState(null)
  const [currentAudio, setCurrentAudio] = useState(null)
  const [playMode, setPlayMode] = useState('sequential')
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [lastLoggedSearch, setLastLoggedSearch] = useState('')

  useEffect(() => {
    const loadWords = async () => {
      try {
        // ✅ ИСПРАВЛЕНО: правильный вызов getDictionary
        const { data } = await getDictionary()
        const sortedData = [...(data || [])].sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sortedData)
      } catch (err) { 
        console.error('Ошибка загрузки:', err)
        setWords([]) 
      }
      setLoading(false)
    }
    loadWords()
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm && searchTerm !== lastLoggedSearch) {
        await logSearch(searchTerm, user?.email)
        setLastLoggedSearch(searchTerm)
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [searchTerm, user?.email, lastLoggedSearch])

  const stopAudio = () => {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; setCurrentAudio(null) }
    setPlayingId(null); setPlayingAudio2(null)
  }

  const playAudio = async (wordId, audioFile) => {
    if (!audioFile) return
    if (playingId === wordId) { stopAudio(); return }
    stopAudio()
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${audioFile}`)
    audio.play(); setCurrentAudio(audio); setPlayingId(wordId)
    await logAudioPlay(audioFile, user?.email)
    audio.onended = () => { setPlayingId(null); setCurrentAudio(null) }
  }

  const playAudio2 = async (wordId, audioFile) => {
    if (!audioFile) return
    if (playingAudio2 === wordId) { stopAudio(); return }
    stopAudio()
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${audioFile}`)
    audio.play(); setCurrentAudio(audio); setPlayingAudio2(wordId)
    await logAudioPlay(audioFile, user?.email)
    audio.onended = () => { setPlayingAudio2(null); setCurrentAudio(null) }
  }

  const filteredData = words.filter(item =>
    item.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.transcription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.translation?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleLogout = async () => {
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  if (loading) return <div className="loading-full">Загрузка словаря...</div>

  return (
    <div className="container">
      <div className="header">
        <button className="listen-btn" onClick={() => {}} disabled>🎧 Слушать</button>
        <div className="play-mode">
          <label className="mode-label"><input type="radio" name="playMode" value="sequential" checked={playMode === 'sequential'} onChange={(e) => setPlayMode(e.target.value)} /> <span>подряд</span></label>
          <label className="mode-label"><input type="radio" name="playMode" value="random" checked={playMode === 'random'} onChange={(e) => setPlayMode(e.target.value)} /> <span>случайно</span></label>
        </div>
        <img src="/runy-dic/run_r.png" alt="Logo" className="logo" />
        <input type="text" placeholder="Поиск слова..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <button className="logout-btn-user" onClick={handleLogout}>👤 {user?.email?.split('@')[0]}<br/><small>Выйти</small></button>
      </div>
      <div className="results">
        {filteredData.length > 0 ? filteredData.map(item => (
          <div key={item.id} className="card">
            {item.audio && <button className="audio-btn" onClick={() => playAudio(item.id, item.audio)}>🔊</button>}
            <div className="word-row"><h3 className="word">{item.word}</h3>{item.transcription && <span className="transcription">[{item.transcription}]</span>}</div>
            <p className="translation">{item.translation}</p>
            <div className="examples">
              <span className="example">{item.example}</span>
              {item.example2 && <><span className="dash"> — </span><span className="example2">{item.example2}</span>{item.transcription2 && <span className="transcription2"> [{item.transcription2}]</span>}</>}
            </div>
            {item.audio2 && <button className="audio-btn-bottom" onClick={() => playAudio2(item.id, item.audio2)}>🔊</button>}
          </div>
        )) : <p>Ничего не найдено</p>}
      </div>
    </div>
  )
}

// Защищённый маршрут
function ProtectedRoute({ children, isAuthenticated }) {
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  return children
}

// Главный компонент App
function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const location = useLocation()
  const isAdminRoute = location.pathname === '/admin'

  useEffect(() => {
    // Проверяем сессию админа ИЛИ пользователя
    const adminUser = localStorage.getItem('adminUser')
    const currentUser = localStorage.getItem('currentUser')
    
    if (adminUser) {
      setUser(JSON.parse(adminUser))
    } else if (currentUser) {
      setUser(JSON.parse(currentUser))
    }
    setAuthLoading(false)
  }, [])

  const handleUserLogin = (userData) => setUser(userData)
  const handleUserLogout = () => {
    localStorage.removeItem('currentUser')
    setUser(null)
  }

  if (authLoading) return <div className="loading-full">Загрузка...</div>

  return (
    <Routes>
      {/* Маршрут /admin — только для админов */}
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute isAuthenticated={user?.role === 'admin'}>
            <AdminPanel adminUser={user} onLogout={() => { localStorage.removeItem('adminUser'); setUser(null) }} />
          </ProtectedRoute>
        } 
      />
      
      {/* Маршрут /auth — форма входа для пользователей */}
      <Route 
        path="/auth" 
        element={
          !user || user.role !== 'admin' ? (
            <UserAuthForm onLogin={handleUserLogin} />
          ) : (
            <Navigate to="/admin" replace />
          )
        } 
      />
      
      {/* Маршрут / — главная страница для пользователей */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute isAuthenticated={!!user && user.role !== 'admin'}>
            <Home user={user} onLogout={handleUserLogout} />
          </ProtectedRoute>
        } 
      />
      
      {/* Перенаправление неизвестных маршрутов */}
      <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : user ? '/' : '/auth'} replace />} />
    </Routes>
  )
}

// Экспортируем App внутри Router
export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  )
}