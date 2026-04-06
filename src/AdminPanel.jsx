import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from './firebase'
import './AdminPanel.css'

function AdminPanel() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [words, setWords] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    word: '',
    translation: '',
    example: '',
    example2: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Проверка авторизации
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        loadWords()
      }
    })
    return () => unsubscribe()
  }, [])

  // Загрузка слов из Firebase
  const loadWords = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'dictionary'))
      const wordsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setWords(wordsList)
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message)
    }
    setLoading(false)
  }

  // Вход в систему
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError('Неверный email или пароль')
    }
  }

  // Выход
  const handleLogout = async () => {
    await signOut(auth)
    setWords([])
  }

  // Добавление/редактирование
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (editingId) {
        // Редактирование
        const wordRef = doc(db, 'dictionary', editingId)
        await updateDoc(wordRef, formData)
      } else {
        // Добавление
        await addDoc(collection(db, 'dictionary'), {
          ...formData,
          createdAt: new Date().toISOString()
        })
      }
      
      // Очистка формы и перезагрузка
      setFormData({ word: '', translation: '', example: '', example2: '' })
      setEditingId(null)
      await loadWords()
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message)
    }
    setLoading(false)
  }

  // Редактирование
  const handleEdit = (word) => {
    setEditingId(word.id)
    setFormData({
      word: word.word || '',
      translation: word.translation || '',
      example: word.example || '',
      example2: word.example2 || ''
    })
  }

  // Удаление
  const handleDelete = async (id) => {
    if (window.confirm('Удалить эту карточку?')) {
      try {
        await deleteDoc(doc(db, 'dictionary', id))
        await loadWords()
      } catch (err) {
        setError('Ошибка удаления: ' + err.message)
      }
    }
  }

  // Отмена редактирования
  const handleCancel = () => {
    setEditingId(null)
    setFormData({ word: '', translation: '', example: '', example2: '' })
  }

  // Форма входа
  if (!user) {
    return (
      <div className="admin-login">
        <div className="login-box">
          <h2>🔐 Админ-панель</h2>
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="login-btn">Войти</button>
          </form>
        </div>
      </div>
    )
  }

  // Админ-панель
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>⚙️ Управление словарём</h2>
        <div className="admin-info">
          <span>{user.email}</span>
          <button onClick={handleLogout} className="logout-btn">Выйти</button>
        </div>
      </div>

      <div className="admin-content">
        {/* Форма добавления/редактирования */}
        <div className="form-section">
          <h3>{editingId ? '✏️ Редактировать' : '➕ Добавить слово'}</h3>
          <form onSubmit={handleSubmit} className="word-form">
            <input
              type="text"
              placeholder="Слово на рунном языке"
              value={formData.word}
              onChange={(e) => setFormData({...formData, word: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Перевод (на русском языке)"
              value={formData.translation}
              onChange={(e) => setFormData({...formData, translation: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Пример (на русском языке)"
              value={formData.example}
              onChange={(e) => setFormData({...formData, example: e.target.value})}
            />
            <input
              type="text"
              placeholder="Пример (на рунном языке)"
              value={formData.example2}
              onChange={(e) => setFormData({...formData, example2: e.target.value})}
            />
            <div className="form-buttons">
              <button type="submit" className="save-btn" disabled={loading}>
                {loading ? 'Сохранение...' : (editingId ? 'Обновить' : 'Добавить')}
              </button>
              {editingId && (
                <button type="button" onClick={handleCancel} className="cancel-btn">
                  Отмена
                </button>
              )}
            </div>
            {error && <div className="error">{error}</div>}
          </form>
        </div>

        {/* Список слов */}
        <div className="words-list">
          <h3>📚 Все слова ({words.length})</h3>
          {loading && !editingId && <div className="loading">Загрузка...</div>}
          <div className="words-grid">
            {words.map(word => (
              <div key={word.id} className="word-item">
                <div className="word-content">
                  <h4 className="word-title">{word.word}</h4>
                  <p className="word-translation">{word.translation}</p>
                  {word.example && <p className="word-example">{word.example}</p>}
                  {word.example2 && <p className="word-example2">{word.example2}</p>}
                </div>
                <div className="word-actions">
                  <button onClick={() => handleEdit(word)} className="edit-btn">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(word.id)} className="delete-btn">
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel