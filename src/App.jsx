import { useState, useEffect } from 'react'
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

// Главный экран пользователя
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        // ✅ ИСПРАВЛЕНА СОРТИРОВКА: добавлен параметр 'ru' для правильной сортировки русских слов
        const sortedData = [...(data || [])].sort((a, b) => 
          (a.translation || '').localeCompare(b.translation || '', 'ru')
        )
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

  // Функция воспроизведения аудио
  const playAudio = (file) => {
    if (!file) return
    const src = file.startsWith('http') ? file : `${import.meta.env.BASE_URL || '/'}audio/${file}`
    const audio = new Audio(src)
    audio.play().catch(console.error)
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
      <div className="header">
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
            {/* ✅ КНОПКА AUDIO СВЕРХУ */}
            {item.audio && (
              <button className="audio-btn" onClick={() => playAudio(item.audio)}>🔊</button>
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
              <button className="audio-btn-bottom" onClick={() => playAudio(item.audio2)}>🔊</button>
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
            !user || user.role !== 'admin' ? (
              <UserAuthForm onLogin={handleUserLogin} />
            ) : (
              <Navigate to="/admin" replace />
            )
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