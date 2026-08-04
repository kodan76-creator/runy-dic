// src/components/UserAuthForm.jsx
// Форма входа/регистрации для ПОЛЬЗОВАТЕЛЕЙ
import { useState } from 'react'
import { verifyUser, registerUser } from '../githubApi'

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
          const userWithRole = { ...user, role: user.role || 'user', paid: user.paid ?? false }
          localStorage.setItem('currentUser', JSON.stringify(userWithRole))
          onLogin(userWithRole)
          // navigate to app: admin -> /admin, user -> /
          try { window.location.hash = userWithRole.role === 'admin' ? '/admin' : '/' } catch { /* ignore */ }
        } else {
          setError('Неверный email или пароль')
        }
      } else {
        if (password !== confirmPassword) throw new Error('Пароли не совпадают')
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов')
        await registerUser(email, password)
        setError('Регистрация успешна. Теперь войдите в аккаунт.')
        setIsLogin(true)
        setPassword('')
        setConfirmPassword('')
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
        <button className="admin-launch-btn" type="button" onClick={() => { window.location.hash = '/admin' }} disabled={loading}>
          Запустить админку
        </button>
      </div>
    </div>
  )
}

export default UserAuthForm
