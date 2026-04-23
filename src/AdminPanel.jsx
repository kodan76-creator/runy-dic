import { useState, useEffect, useMemo } from 'react'
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
    transcription: '',
    translation: '',
    example: '',
    example2: '',
    transcription2: '',
    audio: '',
    audio2: ''  // ← Добавлено поле audio2
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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

  // Фильтрация слов по поиску
  const filteredWords = useMemo(() => {
    return words.filter(item =>
      item.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.transcription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.example && item.example.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.example2 && item.example2.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.transcription2 && item.transcription2.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [searchTerm, words])

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
        const wordRef = doc(db, 'dictionary', editingId)
        await updateDoc(wordRef, formData)
      } else {
        await addDoc(collection(db, 'dictionary'), {
          ...formData,
          createdAt: new Date().toISOString()
        })
      }
      
      setFormData({ word: '', transcription: '', translation: '', example: '', example2: '', transcription2: '', audio: '', audio2: '' })
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
      transcription: word.transcription || '',
      translation: word.translation || '',
      example: word.example || '',
      example2: word.example2 || '',
      transcription2: word.transcription2 || '',
      audio: word.audio || '',
      audio2: word.audio2 || ''
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
    setFormData({ word: '', transcription: '', translation: '', example: '', example2: '', transcription2: '', audio: '', audio2: '' })
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
      {/* ЕДИНЫЙ ФИКСИРОВАННЫЙ КОНТЕЙНЕР */}
      <div className="admin-fixed-container">
        {/* Шапка */}
        <div className="admin-header">
          <h2>⚙️ Управление словарём</h2>
          <div className="admin-info">
            <span>{user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Выйти</button>
          </div>
        </div>

        {/* Форма */}
        <div className="form-section">
          {/* Поле поиска */}
          <div className="search-container">
            <input
              type="text"
              placeholder="🔍 Поиск слова..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          
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
              placeholder="Транскрипция"
              value={formData.transcription}
              onChange={(e) => setFormData({...formData, transcription: e.target.value})}
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
            <input
              type="text"
              placeholder="Транскрипция примера 2"
              value={formData.transcription2}
              onChange={(e) => setFormData({...formData, transcription2: e.target.value})}
            />
            <input
              type="text"
              placeholder="Audio файл (например: word1.mp3)"
              value={formData.audio}
              onChange={(e) => setFormData({...formData, audio: e.target.value})}
            />
            <input
              type="text"
              placeholder="Audio2 файл (пример, например: example1.mp3)"
              value={formData.audio2}
              onChange={(e) => setFormData({...formData, audio2: e.target.value})}
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
          
          {/* Счётчик слов под кнопкой "Добавить" */}
          <h3 className="words-count">📚 Все слова ({words.length})</h3>
        </div>
      </div>

      {/* Прокручиваемый контент */}
      <div className="admin-content">
        <div className="words-list">
          {loading && !editingId && <div className="loading">Загрузка...</div>}
          <div className="words-grid">
            {filteredWords.length > 0 ? (
              filteredWords.map(word => (
                <div key={word.id} className="word-item">
                  <div className="word-content">
                    <div className="word-row">
                      <h4 className="word-title">{word.word}</h4>
                      {word.transcription && (
                        <span className="word-transcription">[{word.transcription}]</span>
                      )}
                    </div>
                    <p className="word-translation">{word.translation}</p>
                    <div className="examples">
                      {word.example && <span className="word-example">{word.example}</span>}
                      {word.example2 && (
                        <>
                          <span className="word-dash"> — </span>
                          <span className="word-example2">{word.example2}</span>
                        </>
                      )}
                      {word.transcription2 && (
                        <span className="word-transcription2">[{word.transcription2}]</span>
                      )}
                    </div>
                    {word.audio && (
                      <p className="word-audio">🔊 {word.audio}</p>
                    )}
                    {word.audio2 && (
                      <p className="word-audio">🔊 {word.audio2}</p>
                    )}
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
              ))
            ) : (
              <div className="no-results">
                {searchTerm ? 'Ничего не найдено' : 'Словарь пуст'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel