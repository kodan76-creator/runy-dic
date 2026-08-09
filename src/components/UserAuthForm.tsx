// src/components/UserAuthForm.jsx
// Форма входа/регистрации для ПОЛЬЗОВАТЕЛЕЙ
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifyUser, registerUser } from '../githubApi'
import ThemeToggle from './ThemeToggle'

// Допустимые символы при вводе (латиница, цифры и символы email)
const LATIN_LOGIN_REGEX = /^[a-zA-Z0-9@._%+-]*$/
// Проверка формата email (как почтовый ящик: имя@домен.зона)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

function UserAuthForm({ onLogin }) {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loginHint, setLoginHint] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Если нет интернета — сразу сообщаем, не пытаясь обратиться к серверу
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('❌ Нет интернета. Для входа или регистрации необходимо подключение к интернету.')
      }
      if (isLogin) {
        const user = await verifyUser(email, password)
        if (user) {
          const userWithRole = { ...user, role: user.role || 'user', paid: user.paid ?? false }
          localStorage.setItem('currentUser', JSON.stringify(userWithRole))
          onLogin(userWithRole)
          // navigate to app: admin -> /admin, user -> /
          navigate(userWithRole.role === 'admin' ? '/admin' : '/')
        } else {
          setError('Неверный email или пароль')
        }
      } else {
        if (!EMAIL_REGEX.test(email)) {
          throw new Error('Введите корректный email, например: user@mail.ru')
        }
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
      <ThemeToggle className="auth-screen" />
      <div className="auth-box">
        <img src={`${import.meta.env.BASE_URL}run_r.png`} alt="Логотип" className="auth-logo" />
        <h2>{isLogin ? '🔐 Вход' : '📝 Регистрация'}</h2>
        <form onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" name="username" placeholder="Email" value={email} onChange={(e) => {
            const value = e.target.value
            if (LATIN_LOGIN_REGEX.test(value)) {
              setEmail(value)
              setLoginHint('')
            } else if (/[\u0400-\u04FF]/.test(value)) {
              setLoginHint('⚠️ Логин не может содержать кириллицу — используйте латинские буквы, цифры и символы @ . _ -')
            }
          }} required disabled={loading} autoComplete="username" />
          {loginHint && <div className="auth-hint" role="alert">{loginHint}</div>}
          <label className="visually-hidden" htmlFor="auth-password">Пароль</label>
          <input id="auth-password" type="password" name="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
          {!isLogin && (
            <>
              <label className="visually-hidden" htmlFor="auth-confirm">Подтвердите пароль</label>
              <input id="auth-confirm" type="password" placeholder="Подтвердите пароль" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} autoComplete="new-password" />
            </>
          )}
          {error && <div className="error" role="alert">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading}>{loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}</button>
        </form>
        <button className="toggle-auth-btn" onClick={() => { setIsLogin(!isLogin); setError(''); setLoginHint(''); setPassword(''); setConfirmPassword('') }} disabled={loading}>
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
        <button className="admin-launch-btn" type="button" onClick={() => navigate('/admin')} disabled={loading}>
          Запустить админку
        </button>
      </div>
    </div>
  )
}

export default UserAuthForm
