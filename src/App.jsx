import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, verifyAdmin, logoutUser, logSearch, logAudioPlay } from './githubApi'
import AdminPanel from './AdminPanel'
import './App.css'

// Форма входа для ПОЛЬЗОВАТЕЛЕЙ
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

// Форма входа для АДМИНОВ
function AdminAuthForm({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const admin = await verifyAdmin(email, password)
      if (admin) {
        localStorage.setItem('adminUser', JSON.stringify(admin))
        onLogin(admin)
      } else {
        setError('Неверный email или пароль администратора')
      }
    } catch (err) {
      setError(err.message || 'Ошибка авторизации')
    }
    setLoading(false)
  }

  return (
    <div className="admin-login">
      <div className="login-box">
        <h2>🔐 Админ-панель</h2>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email администратора" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
          {error && <div className="error">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>{loading ? 'Проверка...' : 'Войти'}</button>
        </form>
      </div>
    </div>
  )
}

// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastLoggedSearch, setLastLoggedSearch] = useState('')

  useEffect(() => {
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        setWords(data || [])
      } catch (err) { console.error('Ошибка загрузки:', err) }
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

  const handleLogout = async () => {
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  if (loading) return <div className="loading-full">Загрузка...</div>

  const filtered = words.filter(w =>
    w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="container">
      <div className="header">
        <img src="/runy-dic/run_r.png" alt="Logo" className="logo" />
        <input type="text" placeholder="Поиск слова..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <button className="logout-btn-user" onClick={handleLogout}>👤 {user?.email?.split('@')[0]}<br/><small>Выйти</small></button>
      </div>
      <div className="results">
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            <div className="word-row"><h3 className="word">{item.word}</h3>{item.transcription && <span className="transcription">[{item.transcription}]</span>}</div>
            <p className="translation">{item.translation}</p>
          </div>
        )) : <p>Ничего не найдено</p>}
      </div>
    </div>
  )
}

// Защищённый маршрут
function ProtectedRoute({ children, user, requiredRole }) {
  if (!user) return <Navigate to="/auth" replace />
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/auth" replace />
  return children
}

// Главный App
function App() {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    // Проверяем сессии при загрузке
    const checkAuth = () => {
      const adminData = localStorage.getItem('adminUser')
      const userData = localStorage.getItem('currentUser')
      
      if (adminData) {
        try { setUser(JSON.parse(adminData)) } catch {}
      } else if (userData) {
        try { setUser(JSON.parse(userData)) } catch {}
      }
      setCheckingAuth(false)
    }
    checkAuth()
  }, [])

  const handleUserLogin = (userData) => setUser(userData)
  const handleAdminLogin = (adminData) => setUser(adminData)
  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('adminUser')
    setUser(null)
  }

  if (checkingAuth) return <div className="loading-full">Загрузка...</div>

  return (
    <Router>
      <Routes>
        {/* Админ-панель */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute user={user} requiredRole="admin">
              <AdminPanel adminUser={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        {/* Форма входа админа */}
        <Route 
          path="/admin/login" 
          element={
            user?.role === 'admin' ? <Navigate to="/admin" replace /> : <AdminAuthForm onLogin={handleAdminLogin} />
          } 
        />
        
        {/* Форма входа пользователя */}
        <Route 
          path="/auth" 
          element={
            user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <UserAuthForm onLogin={handleUserLogin} />
          } 
        />
        
        {/* Главная для пользователей */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute user={user} requiredRole="user">
              <Home user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        {/* Перенаправление */}
        <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/') : '/auth'} replace />} />
      </Routes>
    </Router>
  )
}

export default App