// src/App.jsx
// Роутинг приложения: вход/регистрация, главный экран и админ-панель.
import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AdminPanel from './AdminPanel'
import UserAuthForm from './components/UserAuthForm'
import Home from './pages/Home'
import { getUsers } from './githubApi'
import { removeCachedUser } from './api/offline'
import './App.css'

// Определяем сохранённого пользователя при загрузке.
// isAdminRoute приходит из роутера (useLocation) — без чтения window.location.hash.
const getSavedUser = (isAdminRoute) => {
  const adminUser = localStorage.getItem('adminUser')
  const currentUser = localStorage.getItem('currentUser')

  // If opening admin route, prefer adminUser; regular users get restricted dictionary-only admin mode.
  if (isAdminRoute) {
    if (adminUser) {
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
        return { ...parsed, role: parsed.role || 'user', paid: parsed.paid ?? false }
      } catch {
        localStorage.removeItem('currentUser')
      }
    }
    return null
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

function AppContent() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const [user, setUser] = useState(() => getSavedUser(isAdminRoute))

  const handleUserLogin = (userData) => {
    const nextUser = { ...userData, role: userData.role || 'user', paid: userData.paid ?? false }
    if (nextUser.role === 'admin') {
      localStorage.removeItem('currentUser')
      localStorage.setItem('adminUser', JSON.stringify(nextUser))
    } else {
      localStorage.removeItem('adminUser')
      localStorage.setItem('currentUser', JSON.stringify(nextUser))
    }
    setUser(nextUser)
  }

  const handleUserLogout = () => {
    localStorage.removeItem('currentUser')
    setUser(null)
  }

  const handleAdminLogout = () => {
    localStorage.removeItem('adminUser')
    localStorage.removeItem('currentUser')
    setUser(null)
  }

  const navigate = useNavigate()

  // 🔄 Контроль сессий: если администратор сменил любой статус оплаты
  // пользователя на «не оплачено», на сервере увеличивается sessionVersion.
  // Пока пользователь вошёл, периодически сверяем его локальную версию сессии
  // с серверной; при расхождении разлогиниваем — на всех устройствах сразу.
  useEffect(() => {
    const email = user?.email
    const role = user?.role
    const sessionVersion = user?.sessionVersion
    if (!email || role === 'admin') return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const forceLogout = () => {
      localStorage.removeItem('currentUser')
      if (email) removeCachedUser(email)
      setUser(null)
      navigate('/auth', { replace: true })
      window.alert('Ваш доступ был отключён администратором. Войдите снова.')
    }

    const checkSession = async () => {
      try {
        const users = await getUsers()
        if (cancelled) return
        const serverUser = users.find(u =>
          String(u?.email || '').toLowerCase() === String(email || '').toLowerCase()
        )
        if (!serverUser) return
        if (Number(serverUser.sessionVersion ?? 0) !== Number(sessionVersion ?? 0)) {
          forceLogout()
        }
      } catch (e) {
        console.error('Session check failed:', e)
      }
    }

    const onActivity = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) checkSession()
    }
    window.addEventListener('focus', onActivity)
    window.addEventListener('online', onActivity)
    checkSession()
    timer = setInterval(checkSession, 60000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('online', onActivity)
      if (timer) clearInterval(timer)
    }
  }, [user, navigate])

  return (
    <Routes>
      <Route
        path="/admin"
          element={<AdminPanel currentUser={user} onAdminLogin={(u) => {
            const nextUser = { ...u, role: u.role || 'admin', paid: u.paid ?? false }
            if (nextUser.role === 'admin') {
              localStorage.removeItem('currentUser')
              localStorage.setItem('adminUser', JSON.stringify(nextUser))
            } else {
              localStorage.removeItem('adminUser')
              localStorage.setItem('currentUser', JSON.stringify(nextUser))
            }
            setUser(nextUser)
          }} onAdminLogout={handleAdminLogout} />}
        />

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
            user?.role === 'admin' ? (
              <Navigate to="/admin" replace />
            ) : user?.role === 'user' ? (
              <Home user={user} onLogout={handleUserLogout} />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : user?.role === 'user' ? '/' : '/auth'} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
