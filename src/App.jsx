import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, logoutUser, getDictionary } from './githubApi'
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
    console.log('[App.jsx] Форма отправлена:', { isLogin, email })
    setError('')
    setLoading(true)
    try {
      if (isLogin) {
        console.log('[App.jsx] Попытка входа для:', email)
        const user = await verifyUser(email, password)
        console.log('[App.jsx] Результат verifyUser:', user)
        if (user) {
          // ✅ Добавляем role если его нет
          const userWithRole = { ...user, role: user.role || 'user' }
          console.log('[App.jsx] Успешный вход, сохраняем пользователя:', userWithRole)
          localStorage.setItem('currentUser', JSON.stringify(userWithRole))
          onLogin(userWithRole)
        } else {
          console.log('[App.jsx] Ошибка: неверный email или пароль')
          setError('Неверный email или пароль')
        }
      } else {
        console.log('[App.jsx] Попытка регистрации для:', email)
        if (password !== confirmPassword) throw new Error('Пароли не совпадают')
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов')
        const user = await registerUser(email, password)
        console.log('[App.jsx] Результат registerUser:', user)
        // ✅ Добавляем role
        const userWithRole = { ...user, role: 'user' }
        console.log('[App.jsx] Успешная регистрация, сохраняем пользователя:', userWithRole)
        localStorage.setItem('currentUser', JSON.stringify(userWithRole))
        onLogin(userWithRole)
      }
    } catch (err) {
      console.error('[App.jsx] Ошибка авторизации:', err)
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

  useEffect(() => {
    const loadWords = async () => {
      try {
        console.log('[Home] Начало загрузки словаря...')
        const result = await getDictionary()
        console.log('[Home] Результат getDictionary:', result)
        const data = result?.data || []
        console.log('[Home] Данные словаря:', data)
        const sortedData = [...(data || [])].sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sortedData)
        console.log('[Home] Словарь успешно загружен, количество слов:', sortedData.length)
      } catch (err) { 
        console.error('[Home] Ошибка загрузки словаря:', err)
        setWords([]) 
      }
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

// Главный App - теперь без useLocation
function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    console.log('[App.jsx] Проверка сессии при загрузке')
    // Проверяем сессию админа ИЛИ пользователя
    const adminUser = localStorage.getItem('adminUser')
    const currentUser = localStorage.getItem('currentUser')
    console.log('[App.jsx] adminUser из localStorage:', adminUser)
    console.log('[App.jsx] currentUser из localStorage:', currentUser)
    
    if (adminUser) {
      try {
        const parsed = JSON.parse(adminUser)
        console.log('[App.jsx] Восстановлена сессия админа:', parsed)
        setUser({ ...parsed, role: 'admin' })
      } catch {}
    } else if (currentUser) {
      try {
        const parsed = JSON.parse(currentUser)
        console.log('[App.jsx] Восстановлена сессия пользователя:', parsed)
        setUser({ ...parsed, role: parsed.role || 'user' })
      } catch {}
    }
    setAuthLoading(false)
  }, [])

  const handleUserLogin = (userData) => {
    console.log('[App.jsx] handleUserLogin вызван с:', userData)
    setUser({ ...userData, role: userData.role || 'user' })
  }

  const handleLogout = () => {
    console.log('[App.jsx] handleLogout вызван')
    localStorage.removeItem('currentUser')
    localStorage.removeItem('adminUser')
    setUser(null)
  }

  if (authLoading) return <div className="loading-full">Загрузка...</div>

  return (
    <Router>
      <Routes>
        {/* Админ-панель - доступна всегда, внутри сама проверка авторизации */}
        <Route 
          path="/admin" 
          element={
            <AdminPanel 
              adminUser={user?.role === 'admin' ? user : null} 
              onAdminLogin={(userData) => setUser({ ...userData, role: 'admin' })}
              onAdminLogout={() => {
                localStorage.removeItem('adminUser')
                setUser(null)
              }}
            />
          } 
        />
        
        {/* Вход пользователя */}
        <Route 
          path="/auth" 
          element={
            !user || user.role !== 'admin' ? (
              <UserAuthForm onLogin={handleUserLogin} />
            ) : (
              <Navigate to="/" replace />
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
          element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/') : '/auth'} replace />} 
        />
      </Routes>
    </Router>
  )
}

export default App