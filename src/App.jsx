import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, logoutUser, logSearch, logAudioPlay, getDictionary } from './githubApi'
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

// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadWords = async () => {
      try {
        const { data } = await getDictionary()
        const sortedData = [...(data || [])].sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sortedData)
      } catch (err) { console.error('Ошибка загрузки:', err); setWords([]) }
      setLoading(false)
    }
    loadWords()
  }, [])

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
        <input type="text" placeholder="Поиск слова..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <button className="logout-btn-user" onClick={handleLogout}>👤 {user?.email?.split('@')[0]}<br/><small>Выйти</small></button>
      </div>
      <div className="results">
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            <div className="word-row">
              <h3 className="word">{item.word}</h3>
              {item.transcription && <span className="transcription">[{item.transcription}]</span>}
            </div>
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
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Проверяем сессию админа ИЛИ пользователя
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
    const userWithRole = { ...userData, role: userData.role || 'user' }
    setUser(userWithRole)
  }

  const handleAdminLogin = (adminData) => {
    const adminWithRole = { ...adminData, role: 'admin' }
    setUser(adminWithRole)
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
        {/* Админ-панель */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute user={user} requiredRole="admin">
              <AdminPanel adminUser={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        {/* Вход пользователя */}
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
        <Route 
          path="*" 
          element={
            <Navigate to={user?.role === 'admin' ? '/admin' : user ? '/' : '/auth'} replace />
          } 
        />
      </Routes>
    </Router>
  )
}

export default App