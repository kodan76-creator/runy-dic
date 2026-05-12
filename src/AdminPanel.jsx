import { useState, useEffect, useMemo } from 'react'
import { verifyAdmin, getDictionary, addWord, updateWord, deleteWord, getUsers, blockUser, unblockUser, deleteUser, getLogs, clearLogs, getCategories, addCategory, updateCategory, deleteCategory } from './githubApi'
import './AdminPanel.css'

const getSavedAdmin = () => {
  const savedAdmin = localStorage.getItem('adminUser')
  if (!savedAdmin) return null

  try {
    return JSON.parse(savedAdmin)
  } catch (e) {
    console.error('Error parsing adminUser:', e)
    localStorage.removeItem('adminUser')
    return null
  }
}

function AdminPanel({ onAdminLogin, onAdminLogout }) {
  const [adminUser, setAdminUser] = useState(getSavedAdmin)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [words, setWords] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [activeTab, setActiveTab] = useState('dictionary')
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    word: '', transcription: '', translation: '', category: [],
    example: '', example2: '', transcription2: '',
    audio: '', audio2: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Categories
  const [categories, setCategories] = useState([])
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [catEditingId, setCatEditingId] = useState(null)

  const loadWords = async () => {
    setLoading(true)
    try {
      const { data } = await getDictionary()
      setWords(data || [])
    } catch (err) { setError('Ошибка: ' + err.message) }
    setLoading(false)
  }
  const loadUsers = async () => { try { setUsers(await getUsers()) } catch (err) { console.error(err) } }
  const loadLogs = async () => { try { setLogs(await getLogs()) } catch (err) { console.error(err) } }

  useEffect(() => {
    if (adminUser) {
      Promise.resolve().then(() => {
        loadWords()
        loadUsers()
        loadLogs()
        loadCategories()
      })
    }
  }, [adminUser])

  const filteredWords = useMemo(() => {
    let f = words.filter(w =>
      w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    f.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', 'ru'))
    return f
  }, [searchTerm, words])

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setAuthLoading(true)
    try {
      const admin = await verifyAdmin(email, password)
      if (admin) {
        const userData = { email, role: 'admin', loginAt: new Date().toISOString() }
        localStorage.setItem('adminUser', JSON.stringify(userData))
        setAdminUser(userData); setEmail(''); setPassword('')
        if (onAdminLogin) onAdminLogin(userData)
        await loadWords(); await loadUsers(); await loadLogs()
      } else { setError('Неверный email или пароль') }
    } catch (err) { console.error(err); setError('Ошибка авторизации: ' + err.message) }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    localStorage.removeItem('adminUser')  // ✅ Только админ
    setAdminUser(null)
    setWords([])
    setUsers([])
    setLogs([])
    if (onAdminLogout) onAdminLogout()  // В App.jsx теперь корректно обрабатывает
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (editingId) await updateWord(editingId, formData, adminUser?.email)
      else await addWord(formData, adminUser?.email)
      setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '' })
      setEditingId(null); await loadWords()
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  const resolveCategoryIds = (categ) => {
    if (!categ) return []
    if (Array.isArray(categ)) return categ
    if (typeof categ === 'string') {
      const found = categories.find(c => c.name === categ || c.id === categ)
      return found ? [found.id] : []
    }
    return []
  }

  const handleEdit = (word) => {
    setEditingId(word.id)
    setFormData({
      word: word.word || '', transcription: word.transcription || '', translation: word.translation || '', category: resolveCategoryIds(word.category),
      example: word.example || '', example2: word.example2 || '', transcription2: word.transcription2 || '',
      audio: word.audio || '', audio2: word.audio2 || ''
    })
  }

  const handleDelete = async (id) => {
    if (window.confirm('Удалить эту карточку?')) {
      try { await deleteWord(id, adminUser?.email); await loadWords() } catch (err) { setError('Ошибка удаления: ' + err.message) }
    }
  }

  // Categories handlers
  const loadCategories = async () => {
    try {
      const { data } = await getCategories()
      setCategories(data || [])
    } catch (err) { console.error('loadCategories error', err) }
  }

  const handleCategorySubmit = async (e) => {
    e?.preventDefault?.()
    if (!categoryForm.name?.trim()) { setError('Имя категории не может быть пустым'); return }
    try {
      if (catEditingId) {
        await updateCategory(catEditingId, { name: categoryForm.name, description: categoryForm.description })
        setCatEditingId(null)
      } else {
        await addCategory({ name: categoryForm.name, description: categoryForm.description }, adminUser?.email)
      }
      setCategoryForm({ name: '', description: '' })
      await loadCategories()
    } catch (err) { setError('Ошибка категорий: ' + err.message) }
  }

  const handleEditCategory = (cat) => {
    setCatEditingId(cat.id)
    setCategoryForm({ name: cat.name || '', description: cat.description || '' })
  }

  const handleDeleteCategory = async (id) => {
    if (window.confirm('Удалить эту категорию?')) {
      try { await deleteCategory(id, adminUser?.email); await loadCategories() } catch (err) { setError('Ошибка удаления категории: ' + err.message) }
    }
  }

  const handleBlockUser = async (userId, userEmail) => {
    if (window.confirm(`Заблокировать ${userEmail}?`)) {
      try { await blockUser(userId, adminUser?.email); await loadUsers(); await loadLogs() } catch (err) { setError('Ошибка: ' + err.message) }
    }
  }
  const handleUnblockUser = async (userId, userEmail) => {
    if (window.confirm(`Разблокировать ${userEmail}?`)) {
      try { await unblockUser(userId, adminUser?.email); await loadUsers(); await loadLogs() } catch (err) { setError('Ошибка: ' + err.message) }
    }
  }
  const handleDeleteUser = async (userId, userEmail) => {
    if (window.confirm(`Удалить пользователя ${userEmail}? Это действие нельзя отменить.`)) {
      try { await deleteUser(userId, adminUser?.email); await loadUsers(); await loadLogs() } catch (err) { setError('Ошибка: ' + err.message) }
    }
  }
  const handleClearLogs = async () => {
    if (window.confirm('Очистить логи?')) {
      try { await clearLogs(); await loadLogs() } catch (err) { setError('Ошибка: ' + err.message) }
    }
  }

  const formatDate = (d) => d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

  if (!adminUser) {
    return (
      <div className="admin-login">
        <div className="login-box">
          <h2>🔐 Админ-панель</h2>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required disabled={authLoading} />
            <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required disabled={authLoading} />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="login-btn" disabled={authLoading}>{authLoading ? 'Проверка...' : 'Войти'}</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-fixed-container">
        <div className="admin-header">
          <h2>⚙️ Управление словарём</h2>
          <div className="admin-info">
            <span>{adminUser.email}</span>
            <button onClick={handleLogout} className="logout-btn">Выйти</button>
          </div>
        </div>
        <div className="admin-tabs">
          <button className={`tab-btn ${activeTab === 'dictionary' ? 'active' : ''}`} onClick={() => setActiveTab('dictionary')}>📚 Словарь</button>
          <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️ Категории</button>
          <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 Пользователи</button>
          <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>📊 Логи</button>
        </div>

        {activeTab === 'dictionary' && (
          <div className="form-section">
            <div className="search-container">
              {/* ✅ ИСПРАВЛЕНО: Обёртка и крестик */}
              <div className="search-wrapper">
                <input
                  type="text"
                  placeholder="🔍 Поиск слова..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button className="search-clear-btn" onClick={() => setSearchTerm('')} title="Очистить поиск">❌</button>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="word-form">
              <div className="form-column form-column-left">
                <input type="text" placeholder="Слово на рунном языке" value={formData.word} onChange={e => setFormData({ ...formData, word: e.target.value })} required />
                <input type="text" placeholder="Транскрипция" value={formData.transcription} onChange={e => setFormData({ ...formData, transcription: e.target.value })} />
                <input type="text" placeholder="Перевод (на русском языке)" value={formData.translation} onChange={e => setFormData({ ...formData, translation: e.target.value })} required />
                <select multiple value={formData.category} onChange={e => {
                  const vals = Array.from(e.target.selectedOptions).map(o => o.value)
                  setFormData({ ...formData, category: vals })
                }} style={{ padding: '10px', border: '3px solid #7b1fa2', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff', color: '#000', minHeight: '90px' }}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-column form-column-right">
                <input type="text" placeholder="Пример (на русском языке)" value={formData.example} onChange={e => setFormData({ ...formData, example: e.target.value })} />
                <input type="text" placeholder="Пример (на рунном языке)" value={formData.example2} onChange={e => setFormData({ ...formData, example2: e.target.value })} />
                <input type="text" placeholder="Транскрипция примера" value={formData.transcription2} onChange={e => setFormData({ ...formData, transcription2: e.target.value })} />
                <input type="text" placeholder="Audio файл (..._runy.mp3)" value={formData.audio} onChange={e => setFormData({ ...formData, audio: e.target.value })} />
                <input type="text" placeholder="Audio2 файл (..._r_prim.mp3)" value={formData.audio2} onChange={e => setFormData({ ...formData, audio2: e.target.value })} />
              </div>
              <div className="form-buttons">
                <button type="submit" className="save-btn" disabled={loading}>{loading ? 'Сохранение...' : (editingId ? 'Обновить' : 'Добавить')}</button>
                {editingId && <button type="button" className="cancel-btn" onClick={() => { setEditingId(null); setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '' }) }}>Отмена</button>}
              </div>
              {error && <div className="error">{error}</div>}
            </form>
            <h3 className="words-count">📚 Все слова ({words.length})</h3>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="categories-section">
            <h3>🗂️ Категории ({categories.length})</h3>
            <div className="category-form">
              <input type="text" placeholder="Название категории" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} />
              <input type="text" placeholder="Описание (необязательно)" value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })} />
              <div className="form-buttons">
                <button className="save-btn" onClick={handleCategorySubmit}>{catEditingId ? 'Обновить' : 'Добавить'}</button>
                {catEditingId && <button className="cancel-btn" onClick={() => { setCatEditingId(null); setCategoryForm({ name: '', description: '' }) }}>Отмена</button>}
              </div>
            </div>

            <div className="categories-list">
              {categories.length === 0 ? <div className="no-results">Категории отсутствуют</div> : categories.map(cat => (
                <div key={cat.id} className="category-item">
                  <div className="category-info">
                    <strong>{cat.name}</strong>
                    {cat.description && <div className="category-desc">{cat.description}</div>}
                  </div>
                  <div className="category-actions">
                    <button onClick={() => handleEditCategory(cat)} className="edit-btn">✏️</button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="delete-btn">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-section">
            <h3>👥 Пользователи ({users.length})</h3>
            <div className="users-grid">
              {users.map(u => (
                <div key={u.id} className={`user-card ${u.isBlocked ? 'blocked' : ''}`}>
                  <div className="user-info">
                    <p className="user-email">{u.email}</p>
                    <p className="user-date">Зарегистрирован: {formatDate(u.createdAt)}</p>
                    {u.isBlocked && <p className="user-blocked">Заблокирован: {formatDate(u.blockedAt)} ({u.blockedBy})</p>}
                  </div>
                  <div className="user-actions">
                    {u.isBlocked ? <button onClick={() => handleUnblockUser(u.id, u.email)} className="unblock-btn">✅ Разблокировать</button> : <button onClick={() => handleBlockUser(u.id, u.email)} className="block-btn">🚫 Заблокировать</button>}
                    <button onClick={() => handleDeleteUser(u.id, u.email)} className="delete-user-btn">Удалить пользователя</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-section">
            <div className="logs-header">
              <h3>📊 Логи действий ({logs.length})</h3>
              <div className="logs-actions">
                <button onClick={loadLogs} className="refresh-logs-btn">Обновить логи</button>
                <button onClick={handleClearLogs} className="clear-logs-btn">🗑️ Очистить логи</button>
              </div>
            </div>
            <div className="logs-list">
              {logs.map(log => (
                <div key={log.id} className="log-item">
                  <span className="log-time">{formatDate(log.timestamp)}</span>
                  <span className="log-action">{log.action}</span>
                  <span className="log-user">{log.userEmail || 'system'}</span>
                  <span className="log-details">{log.details}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="admin-content">
        <div className="words-list">
          {activeTab === 'dictionary' && (
            <>
              {loading && !editingId && <div className="loading">Загрузка...</div>}
              <div className="words-grid">
                {filteredWords.length > 0 ? filteredWords.map(word => (
                  <div key={word.id} className="word-item">
                    <div className="word-content">
                      <div className="word-row">
                        <h4 className="word-title">{word.word}</h4>
                        {word.transcription && <span className="word-transcription">[{word.transcription}]</span>}
                      </div>
                      <p className="word-translation">{word.translation}</p>
                      {word.category && <div className="word-category">({Array.isArray(word.category) ? word.category.map(id => (categories.find(c => c.id === id) || { name: id }).name).join('; ') : (categories.find(c => c.id === word.category)?.name || word.category)})</div>}
                      <div className="examples">
                        {word.example && <span className="word-example">{word.example}</span>}
                        {word.example2 && <><span className="word-dash"> — </span><span className="word-example2">{word.example2}</span></>}
                        {word.transcription2 && <span className="word-transcription2">[{word.transcription2}]</span>}
                      </div>
                      {word.audio && <p className="word-audio">🔊 {word.audio}</p>}
                      {word.audio2 && <p className="word-audio">🔊 {word.audio2}</p>}
                    </div>
                    <div className="word-actions">
                      <button onClick={() => handleEdit(word)} className="edit-btn">✏️</button>
                      <button onClick={() => handleDelete(word.id)} className="delete-btn">🗑️</button>
                    </div>
                  </div>
                )) : <div className="no-results">{searchTerm ? 'Ничего не найдено' : 'Словарь пуст'}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
