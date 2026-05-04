import { useState, useEffect, useMemo } from 'react'
import { getDictionary, addWord, updateWord, deleteWord, getUsers, blockUser, unblockUser, getLogs, clearLogs } from './githubApi'
import './AdminPanel.css'

function AdminPanel({ adminUser, onLogout }) {
  const [words, setWords] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [activeTab, setActiveTab] = useState('dictionary')
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ 
    word: '', transcription: '', translation: '', example: '', 
    example2: '', transcription2: '', audio: '', audio2: '' 
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadWords()
    loadUsers()
    loadLogs()
  }, [])

  const loadWords = async () => {
    setLoading(true)
    try { 
      const { data } = await getDictionary()
      setWords(data || []) 
    } catch (err) { 
      setError('Ошибка: ' + err.message) 
    }
    setLoading(false)
  }

  const loadUsers = async () => { 
    try { 
      const allUsers = await getUsers()
      setUsers(allUsers) 
    } catch {} 
  }

  const loadLogs = async () => { 
    try { 
      const allLogs = await getLogs()
      setLogs(allLogs) 
    } catch {} 
  }

  const filteredWords = useMemo(() => {
    let f = words.filter(w => 
      w.word?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    f.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', 'ru'))
    return f
  }, [searchTerm, words])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (editingId) await updateWord(editingId, formData)
      else await addWord(formData)
      setFormData({ word: '', transcription: '', translation: '', example: '', example2: '', transcription2: '', audio: '', audio2: '' })
      setEditingId(null)
      await loadWords()
    } catch (err) { 
      setError(err.message) 
    }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Удалить?')) { 
      try { 
        await deleteWord(id)
        await loadWords() 
      } catch (err) { 
        setError(err.message) 
      } 
    }
  }

  const handleBlock = async (userId, email) => {
    if (window.confirm(`Заблокировать ${email}?`)) { 
      try { 
        await blockUser(userId, adminUser?.email)
        loadUsers() 
      } catch {} 
    }
  }

  const handleUnblock = async (userId, email) => {
    if (window.confirm(`Разблокировать ${email}?`)) { 
      try { 
        await unblockUser(userId, adminUser?.email)
        loadUsers() 
      } catch {} 
    }
  }

  const formatDate = (d) => {
    if (!d) return '-'
    return new Date(d).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="admin-panel">
      <div className="admin-fixed-container">
        <div className="admin-header">
          <h2>⚙️ Админ-панель</h2>
          <div className="admin-info">
            <span>{adminUser?.email}</span>
            <button onClick={onLogout} className="logout-btn">Выйти</button>
          </div>
        </div>
        
        <div className="admin-tabs">
          <button className={`tab-btn ${activeTab==='dictionary'?'active':''}`} onClick={()=>setActiveTab('dictionary')}>📚 Словарь</button>
          <button className={`tab-btn ${activeTab==='users'?'active':''}`} onClick={()=>setActiveTab('users')}>👥 Пользователи</button>
          <button className={`tab-btn ${activeTab==='logs'?'active':''}`} onClick={()=>setActiveTab('logs')}>📊 Логи</button>
        </div>

        {activeTab==='dictionary' && (
          <div className="form-section">
            <input type="text" placeholder="🔍 Поиск..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="search-input" />
            <form onSubmit={handleSubmit} className="word-form">
              <input placeholder="Слово" value={formData.word} onChange={e=>setFormData({...formData,word:e.target.value})} required />
              <input placeholder="Транскрипция" value={formData.transcription} onChange={e=>setFormData({...formData,transcription:e.target.value})} />
              <input placeholder="Перевод" value={formData.translation} onChange={e=>setFormData({...formData,translation:e.target.value})} required />
              <input placeholder="Пример (рус)" value={formData.example} onChange={e=>setFormData({...formData,example:e.target.value})} />
              <input placeholder="Пример (руны)" value={formData.example2} onChange={e=>setFormData({...formData,example2:e.target.value})} />
              <input placeholder="Транскрипция примера" value={formData.transcription2} onChange={e=>setFormData({...formData,transcription2:e.target.value})} />
              <input placeholder="Audio (..._runy.mp3)" value={formData.audio} onChange={e=>setFormData({...formData,audio:e.target.value})} />
              <input placeholder="Audio2 (..._r_prim.mp3)" value={formData.audio2} onChange={e=>setFormData({...formData,audio2:e.target.value})} />
              <div className="form-buttons">
                <button type="submit" className="save-btn" disabled={loading}>{loading?'...':(editingId?'Обновить':'Добавить')}</button>
                {editingId && <button type="button" className="cancel-btn" onClick={()=>{setEditingId(null);setFormData({word:'',transcription:'',translation:'',example:'',example2:'',transcription2:'',audio:'',audio2:''})}}>Отмена</button>}
              </div>
              {error && <div className="error">{error}</div>}
            </form>
            <h3>📚 Слова: {words.length}</h3>
          </div>
        )}

        {activeTab==='users' && (
          <div className="users-section">
            <h3>👥 Пользователи: {users.length}</h3>
            <div className="users-grid">
              {users.map(u => (
                <div key={u.id} className={`user-card ${u.isBlocked === true ? 'blocked' : ''}`}>
                  <div>
                    <p className="user-email">{u.email}</p>
                    <p className="user-date">{formatDate(u.createdAt)}</p>
                    {/* ✅ ИСПРАВЛЕНО: Проверяем строго === true */}
                    {u.isBlocked === true && (
                      <p className="user-blocked">Заблокирован: {formatDate(u.blockedAt)}</p>
                    )}
                    {u.isBlocked !== true && (
                      <p className="user-active" style={{color: '#4caf50'}}>✅ Активен</p>
                    )}
                  </div>
                  <div>
                    {u.isBlocked === true ? (
                      <button onClick={()=>handleUnblock(u.id,u.email)} className="unblock-btn">✅ Разблокировать</button>
                    ) : (
                      <button onClick={()=>handleBlock(u.id,u.email)} className="block-btn">🚫 Заблокировать</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==='logs' && (
          <div className="logs-section">
            <div className="logs-header">
              <h3>📊 Логи: {logs.length}</h3>
              <button onClick={async()=>{if(window.confirm('Очистить?')){await clearLogs();loadLogs()}}} className="clear-logs-btn">🗑️</button>
            </div>
            <div className="logs-list">
              {logs.map(l => (
                <div key={l.id} className="log-item">
                  <span>{formatDate(l.timestamp)}</span>
                  <span>{l.action}</span>
                  <span>{l.userEmail||'-'}</span>
                  <span>{l.details}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="admin-content">
        {activeTab==='dictionary' && (
          <div className="words-list">
            {loading && <div className="loading">Загрузка...</div>}
            <div className="words-grid">
              {filteredWords.map(w => (
                <div key={w.id} className="word-item">
                  <div>
                    <div className="word-row">
                      <h4>{w.word}</h4>
                      {w.transcription && <span>[{w.transcription}]</span>}
                    </div>
                    <p>{w.translation}</p>
                  </div>
                  <div>
                    <button onClick={()=>{setEditingId(w.id);setFormData({word:w.word||'',transcription:w.transcription||'',translation:w.translation||'',example:w.example||'',example2:w.example2||'',transcription2:w.transcription2||'',audio:w.audio||'',audio2:w.audio2||''})}} className="edit-btn">✏️</button>
                    <button onClick={()=>handleDelete(w.id)} className="delete-btn">🗑️</button>
                  </div>
                </div>
              ))}
              {filteredWords.length===0 && <p className="no-results">Ничего не найдено</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminPanel