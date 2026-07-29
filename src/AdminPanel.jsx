import { useState, useEffect, useMemo, useRef } from 'react'
import { verifyAdmin, verifyUser, getDictionary, addWord, updateWord, deleteWord, getUsers, updateUser, blockUser, unblockUser, deleteUser, getLogs, clearLogs, getCategories, addCategory, updateCategory, deleteCategory, ensureUserDictionaryFile, uploadAudioFile, deleteAudioFile, migrateAllFiles, checkFilesEncryptionStatus, decryptFile, decryptFiles, encryptFiles, emailToFolderName } from './githubApi'
import './AdminPanel.css'

const getSavedAdmin = () => {
  const savedAdmin = localStorage.getItem('adminUser')
  if (!savedAdmin) return null

  try {
    const parsed = JSON.parse(savedAdmin)
    if (parsed?.role !== 'admin') {
      localStorage.removeItem('adminUser')
      return null
    }
    return parsed
  } catch (e) {
    console.error('Error parsing adminUser:', e)
    localStorage.removeItem('adminUser')
    return null
  }
}

function AdminPanel({ currentUser, onAdminLogin, onAdminLogout }) {
  const [adminUser, setAdminUser] = useState(getSavedAdmin)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [words, setWords] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [activeTab, setActiveTab] = useState('dictionary')
  const [editingId, setEditingId] = useState(null)
  const [userEditingId, setUserEditingId] = useState(null)
  const [userFormData, setUserFormData] = useState({ email: '', role: 'user', paid: false })
  const [userSaving, setUserSaving] = useState(false)
  const [audioUploading, setAudioUploading] = useState('')
  const currentAudioRef = useRef(null)
  const msgTimeoutRef = useRef(null)

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type })
    if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current)
    msgTimeoutRef.current = setTimeout(() => setMessage(''), 4000)
  }
  const [formData, setFormData] = useState({
    word: '', transcription: '', translation: '', category: [],
    example: '', example2: '', transcription2: '',
    audio: '', audio2: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userPaymentFilter, setUserPaymentFilter] = useState('all')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const wordsListRef = useRef(null)
  const getAudioSrc = (fileName, userFolder) => {
    if (!fileName) return ''
    // Прямая ссылка на raw.githubusercontent.com — не требует пересборки сайта
    const base = 'https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/audio/'
    if (fileName.includes('/')) return `${base}${fileName}`
    if (userFolder) return `${base}${userFolder}/${fileName}`
    return `${base}${fileName}`
  }

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
  }

  const playAudioFile = (fileName) => {
    stopAudio()
    // Админ — общий словарь (audio в корне public/audio/), пользователь — личный (audio/{emailFolder}/)
    const userFolder = isRestrictedUser && activeUser?.email ? emailToFolderName(activeUser.email) : ''
    const src = getAudioSrc(fileName, userFolder)
    const audio = new Audio(src)
    currentAudioRef.current = audio
    const finish = () => { if (currentAudioRef.current === audio) currentAudioRef.current = null }
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', () => {
      finish()
      showMessage(`❌ Файл «${fileName}» не найден на сервере`, 'error')
    }, { once: true })
    audio.play().catch(() => {
      finish()
      showMessage(`❌ Файл «${fileName}» не найден на сервере`, 'error')
    })
  }

  const scrollWordsToTop = () => {
    const el = wordsListRef.current || document.querySelector('.words-list')
    const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent))

    try {
      if (el) {
        const canScroll = el.scrollHeight > el.clientHeight
        if (canScroll && typeof el.scrollTo === 'function') {
          el.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }

        // Try bringing the container (or its first child) to viewport
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        const firstChild = el.firstElementChild || el
        if (firstChild && typeof firstChild.scrollIntoView === 'function') {
          firstChild.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }

      // Try scrolling document/window
      if (document.documentElement && typeof document.documentElement.scrollTo === 'function') {
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })

      // If still on mobile and admin-panel blocks scrolling via CSS overflow hidden, temporarily allow it
      const adminPanel = document.querySelector('.admin-panel')
      if (isMobile && adminPanel && getComputedStyle(adminPanel).overflow === 'hidden') {
        const prev = adminPanel.style.overflow
        adminPanel.style.overflow = 'auto'
        // allow layout update then smooth scroll
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
        setTimeout(() => { adminPanel.style.overflow = prev }, 600)
      }
    } catch (e) {
      // last resort
      try { window.scrollTo({ top: 0 }) } catch (er) { /* ignore */ }
    }
  }
  const [authLoading, setAuthLoading] = useState(false)

  // Миграция шифрования
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [migrationResult, setMigrationResult] = useState(null)
  const [filesStatus, setFilesStatus] = useState([])
  const [filesStatusLoading, setFilesStatusLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [decryptLoading, setDecryptLoading] = useState(false)
  const [decryptResult, setDecryptResult] = useState(null)
  const [encryptLoading, setEncryptLoading] = useState(false)
  const [encryptResult, setEncryptResult] = useState(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [catEditingId, setCatEditingId] = useState(null)

  // Active user: admins get full panel, regular users get restricted dictionary-only panel.
  const activeUser = (adminUser && adminUser.role === 'admin') ? adminUser : (currentUser && ['admin', 'user'].includes(currentUser.role) ? currentUser : null)
  // A non-admin (regular) user is restricted and should not be treated as admin here
  const isRestrictedUser = activeUser?.role === 'user'

  const loadWords = async () => {
    setLoading(true)
    try {
      const dictionaryOwner = isRestrictedUser ? activeUser?.email : activeUser
      const { data } = await getDictionary(dictionaryOwner)
      setWords(data || [])
    } catch (err) { setError('Ошибка: ' + err.message) }
    setLoading(false)
  }
  const loadUsers = async () => { try { setUsers(await getUsers()) } catch (err) { console.error(err) } }
  const loadLogs = async () => { try { setLogs(await getLogs()) } catch (err) { console.error(err) } }

  useEffect(() => {
    if (activeUser) {
      Promise.resolve().then(() => {
        loadWords()
        if (!isRestrictedUser) {
          loadUsers()
          loadLogs()
          loadCategories()
        } else {
          loadCategories()
        }
      })
    }
  }, [activeUser, isRestrictedUser])

  // When AdminPanel is mounted, prevent page/body scrolling so only central words list scrolls
  useEffect(() => {
    const isMobileLayout = typeof window !== 'undefined' && (window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent))
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight
      document.documentElement.style.setProperty('--admin-viewport-height', `${viewportHeight}px`)
    }

    updateViewportHeight()

    if (!isMobileLayout) {
      document.body.classList.add('admin-no-scroll')
    }

    window.addEventListener('resize', updateViewportHeight)
    window.visualViewport?.addEventListener('resize', updateViewportHeight)
    window.visualViewport?.addEventListener('scroll', updateViewportHeight)

    return () => {
      document.body.classList.remove('admin-no-scroll')
      document.documentElement.style.removeProperty('--admin-viewport-height')
      window.removeEventListener('resize', updateViewportHeight)
      window.visualViewport?.removeEventListener('resize', updateViewportHeight)
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight)
    }
  }, [])

  // Автозагрузка статуса файлов при открытии вкладки "Безопасность"
  useEffect(() => {
    if (activeTab === 'security' && !isRestrictedUser) {
      loadFilesStatus()
    }
  }, [activeTab, isRestrictedUser])

  const filteredWords = useMemo(() => {
    let f = words.filter(w =>
      w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    f.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', 'ru'))
    return f
  }, [searchTerm, words])

  const filteredUsers = useMemo(() => {
    const term = userSearchTerm.trim().toLowerCase()

    return users.filter(u => {
      const paymentLabel = u?.paid ? 'оплачено' : 'не оплачено'
      const matchesPaymentFilter = userPaymentFilter === 'all' || (userPaymentFilter === 'paid' ? Boolean(u?.paid) : !u?.paid)
      const matchesRoleFilter = userRoleFilter === 'all' || (userRoleFilter === 'admin' ? u?.role === 'admin' : u?.role !== 'admin')
      const matchesSearch = !term || (
        String(u?.email || '').toLowerCase().includes(term) ||
        String(u?.role || '').toLowerCase().includes(term) ||
        paymentLabel.includes(term) ||
        String(u?.paid ?? '').toLowerCase().includes(term)
      )

      return matchesPaymentFilter && matchesRoleFilter && matchesSearch
    })
  }, [userPaymentFilter, userRoleFilter, userSearchTerm, users])

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setAuthLoading(true)
    try {
      const admin = await verifyAdmin(email, password)
      if (admin) {
        const userData = { ...admin, role: 'admin', loginAt: new Date().toISOString() }
        localStorage.removeItem('currentUser')
        localStorage.setItem('adminUser', JSON.stringify(userData))
        setAdminUser(userData); setEmail(''); setPassword('')
        if (onAdminLogin) onAdminLogin(userData)
        setAuthLoading(false)
        return
      }

      const user = await verifyUser(email, password)
      if (user && user.role === 'user') {
        const userData = { ...user, role: 'user', paid: user.paid ?? false, loginAt: new Date().toISOString() }
        try {
          const ensureResult = await ensureUserDictionaryFile(userData)
          if (ensureResult?.created) {
            console.info(`Created missing personal dictionary file: ${ensureResult.fileName}`)
          }
        } catch (ensureErr) {
          console.error('Failed to ensure personal dictionary file:', ensureErr)
        }

        localStorage.removeItem('adminUser')
        localStorage.setItem('currentUser', JSON.stringify(userData))
        setAdminUser(null); setEmail(''); setPassword('')
        if (onAdminLogin) onAdminLogin(userData)
        setAuthLoading(false)
        return
      }

      setError('Неверный email или пароль')
    } catch (err) { console.error(err); setError('Ошибка авторизации: ' + err.message) }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    localStorage.removeItem('adminUser')
    localStorage.removeItem('currentUser')
    setAdminUser(null)
    setWords([])
    setUsers([])
    setLogs([])
    if (onAdminLogout) onAdminLogout()  // В App.jsx теперь корректно обрабатывает
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (editingId) {
        await updateWord(editingId, formData, activeUser)
        showMessage('✅ Карточка обновлена')
      } else {
        await addWord(formData, activeUser?.email, activeUser)
        showMessage('✅ Карточка добавлена')
      }
      setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '' })
      setEditingId(null); await loadWords()
    } catch (err) {
      setError(err.message)
      showMessage('❌ ' + err.message, 'error')
    }
    setLoading(false)
  }

  const resolveCategoryIds = (categ) => {
    if (!categ) return []
    if (Array.isArray(categ)) return categ
    if (typeof categ === 'string') {
      const found = categories.find(c => c.name === categ || c.id === categ)
      return found ? [found.id] : [categ]
    }
    return []
  }

  const handleAudioUpload = async (e, field) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      setError('Допускаются только MP3-файлы')
      e.target.value = ''
      return
    }
    if (!activeUser?.email) {
      setError('Не удалось определить пользователя')
      return
    }
    const key = field === 'audio2' ? 'audio2' : 'audio'
    setAudioUploading(key)
    setError('')
    const oldName = formData[key]
    try {
      const result = await uploadAudioFile(file, activeUser.email, !isRestrictedUser)
      setFormData(prev => ({ ...prev, [key]: result.path }))
      showMessage(`✅ Аудиофайл «${result.path}» загружен`)
      // Если был старый файл и он не совпадает с новым — удаляем старый
      if (oldName && oldName !== result.path) {
        try {
          await deleteAudioFile(oldName, activeUser.email, !isRestrictedUser)
        } catch { /* файл мог быть уже удалён — не критично */ }
      }
    } catch (err) {
      const errMsg = err.message || 'Неизвестная ошибка'
      setError('❌ Ошибка загрузки аудио: ' + errMsg)
      showMessage('❌ Ошибка загрузки аудио: ' + errMsg, 'error')
    }
    setAudioUploading('')
    e.target.value = ''
  }

  const handleAudioDelete = async (field) => {
    const key = field === 'audio2' ? 'audio2' : 'audio'
    const fileName = formData[key]
    if (!fileName) return
    if (!activeUser?.email) { setError('Не удалось определить пользователя'); return }
    if (!window.confirm(`Удалить аудиофайл «${fileName}»?`)) return
    setAudioUploading(key)
    setError('')
    try {
      await deleteAudioFile(fileName, activeUser.email, !isRestrictedUser)
      setFormData(prev => ({ ...prev, [key]: '' }))
      showMessage(`✅ Аудиофайл «${fileName}» удалён`)
    } catch (err) {
      const errMsg = err.message || 'Неизвестная ошибка'
      // Если файл не найден — всё равно очищаем поле, т.к. файла уже нет
      if (errMsg.includes('не найден')) {
        setFormData(prev => ({ ...prev, [key]: '' }))
        showMessage(`⚠️ Файл «${fileName}» не найден на сервере — поле очищено`)
      } else {
        setError('❌ Ошибка удаления аудио: ' + errMsg)
        showMessage('❌ Ошибка удаления аудио: ' + errMsg, 'error')
      }
    }
    setAudioUploading('')
  }

  const handleEdit = (word) => {
      // Only allow editing if admin or owner
      const isAdmin = activeUser?.role === 'admin'
      const isOwner = activeUser?.role === 'user' && String(activeUser.email).toLowerCase() === String(word.createdBy || '').toLowerCase()
      if (!isAdmin && !isOwner && !isRestrictedUser) {
        setError('Недостаточно прав для редактирования этой записи')
        return
      }

      setEditingId(word.id)
      // Normalize existing category values to ids when possible
      const raw = word.category ? (Array.isArray(word.category) ? word.category : [word.category]) : []
      const normalized = raw.map(item => {
        const found = categories.find(c => c.id === item || c.name === item)
        return found ? found.id : item
      })
      setFormData({
        word: word.word || '', transcription: word.transcription || '', translation: word.translation || '', category: normalized,
        example: word.example || '', example2: word.example2 || '', transcription2: word.transcription2 || '',
        audio: word.audio || '', audio2: word.audio2 || ''
      })
    }

    const handleDelete = async (id, wordOwnerEmail) => {
      if (window.confirm('Удалить эту карточку?')) {
        const isAdmin = activeUser?.role === 'admin'
        const isOwner = activeUser?.role === 'user' && String(activeUser.email).toLowerCase() === String(wordOwnerEmail || '').toLowerCase()
        if (!isAdmin && !isOwner && !isRestrictedUser) {
          setError('Недостаточно прав для удаления этой записи')
          return
        }
        try {
          await deleteWord(id, activeUser)
          await loadWords()
          showMessage('✅ Карточка удалена')
        } catch (err) {
          setError('Ошибка удаления: ' + err.message)
          showMessage('❌ ' + err.message, 'error')
        }
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
  const handleEditUser = (user) => {
    setError('')
    setUserEditingId(user.id)
    setUserFormData({
      email: user.email || '',
      role: user.role === 'admin' ? 'admin' : 'user',
      paid: Boolean(user.paid)
    })
  }
  const handleCancelEditUser = () => {
    setUserEditingId(null)
    setUserFormData({ email: '', role: 'user', paid: false })
  }
  const handleSaveUser = async (e) => {
    e.preventDefault()
    setError('')
    setUserSaving(true)
    try {
      await updateUser(userEditingId, userFormData, adminUser?.email || activeUser?.email)
      handleCancelEditUser()
      await loadUsers()
      await loadLogs()
    } catch (err) {
      setError('Ошибка редактирования пользователя: ' + err.message)
    }
    setUserSaving(false)
  }
  const handleClearLogs = async () => {
    if (window.confirm('Очистить логи?')) {
      try { await clearLogs(); await loadLogs() } catch (err) { setError('Ошибка: ' + err.message) }
    }
  }

  const handleMigrateEncryption = async () => {
    if (!window.confirm('Зашифровать все JSON-файлы в репозитории? Это действие зашифрует данные на GitHub.')) return
    setMigrationLoading(true)
    setMigrationResult(null)
    try {
      const result = await migrateAllFiles()
      setMigrationResult(result)
      // Обновить статус файлов после шифрования
      loadFilesStatus()
    } catch (err) {
      setMigrationResult([{ file: 'error', status: 'error', error: err.message }])
    }
    setMigrationLoading(false)
  }

  const loadFilesStatus = async () => {
    setFilesStatusLoading(true)
    try {
      const status = await checkFilesEncryptionStatus()
      setFilesStatus(status)
      setSelectedFiles(new Set())
      setDecryptResult(null)
      setEncryptResult(null)
    } catch (err) {
      console.error('loadFilesStatus error:', err)
    }
    setFilesStatusLoading(false)
  }

  const handleDecryptSelected = async () => {
    if (selectedFiles.size === 0) return
    if (!window.confirm(`Расшифровать ${selectedFiles.size} файл(ов)? Данные на GitHub будут расшифрованы.`)) return
    setDecryptLoading(true)
    setDecryptResult(null)
    try {
      const result = await decryptFiles(Array.from(selectedFiles))
      setDecryptResult(result)
      await loadFilesStatus()
    } catch (err) {
      setDecryptResult([{ file: 'error', status: 'error', error: err.message }])
    }
    setDecryptLoading(false)
  }

  const handleEncryptSelected = async () => {
    if (selectedFiles.size === 0) return
    if (!window.confirm(`Зашифровать ${selectedFiles.size} файл(ов)? Данные на GitHub будут зашифрованы.`)) return
    setEncryptLoading(true)
    setEncryptResult(null)
    try {
      const result = await encryptFiles(Array.from(selectedFiles))
      setEncryptResult(result)
      await loadFilesStatus()
    } catch (err) {
      setEncryptResult([{ file: 'error', status: 'error', error: err.message }])
    }
    setEncryptLoading(false)
  }

  const toggleFileSelection = (fileName) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileName)) next.delete(fileName)
      else next.add(fileName)
      return next
    })
  }

  const selectAllEncrypted = () => {
    const needAction = filesStatus.filter(f => f.encrypted || f.broken).map(f => f.file)
    setSelectedFiles(new Set(needAction))
  }

  const selectAllPlain = () => {
    const plain = filesStatus.filter(f => f.encrypted === false && f.status === 'plain').map(f => f.file)
    setSelectedFiles(new Set(plain))
  }

  const formatDate = (d) => d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

  if (!adminUser && !(currentUser && ['admin', 'user'].includes(currentUser.role))) {
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
      {message && <div className={`admin-message ${message.type || 'success'}`}>{message.text}</div>}
      <div className="admin-fixed-container">
        <div className="admin-header">
          <h2>⚙️ Управление словарём</h2>
          <div className="admin-info">
            <span>{activeUser?.email || adminUser?.email}</span>
            <button onClick={handleLogout} className="logout-btn">Выйти</button>
          </div>

          {/* UI hint moved to top: explain visibility based on role/paid */}
          {activeUser?.role === 'user' ? (
            <p className="top-hint">Вы видите и редактируете только свой личный словарь.</p>
          ) : null}
        </div>
        <div className="admin-tabs">
          <button
            className={`tab-btn ${activeTab === 'dictionary' ? 'active' : ''}`}
            onClick={() => {
              if (activeTab === 'dictionary') {
                const appUrl = `${window.location.origin}${window.location.pathname}#/`
                window.open(appUrl, '_blank', 'noopener,noreferrer')
              } else {
                setActiveTab('dictionary')
              }
            }}
          >
            📚 Словарь
          </button>
          {!isRestrictedUser && (
            <>
              <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️ Категории</button>
              <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 Пользователи</button>
              <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>📊 Логи</button>
              <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>🔐 Безопасность</button>
            </>
          )}
        </div>

        {activeTab === 'dictionary' && (
          <div className="form-section">
            <div className="dictionary-toolbar">
              <h3 className="words-count">📚 Все слова ({words.length})</h3>
              <button
                type="button"
                className="refresh-logs-btn"
                onClick={loadWords}
                disabled={loading}
                style={{ marginRight: '8px', fontSize: '13px', padding: '4px 10px' }}
              >
                {loading ? '⏳' : '🔄 Обновить'}
              </button>
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
            </div>

            <form onSubmit={handleSubmit} className="word-form">
              <div className="form-column form-column-left">
                <textarea rows={1} className="single-line-textarea" placeholder="Слово на рунном языке" value={formData.word} onChange={e => setFormData({ ...formData, word: e.target.value })} required />
                <textarea rows={1} className="single-line-textarea" placeholder="Транскрипция" value={formData.transcription} onChange={e => setFormData({ ...formData, transcription: e.target.value })} />
                <textarea rows={1} className="single-line-textarea" placeholder="Перевод (на русском языке)" value={formData.translation} onChange={e => setFormData({ ...formData, translation: e.target.value })} required />
                <div className="category-checkboxes">
                  {categories.map(c => (
                    <label key={c.id} className="cat-item">
                      <input type="checkbox" value={c.id} checked={(Array.isArray(formData.category) && (formData.category.includes(c.id) || formData.category.includes(c.name))) || (!Array.isArray(formData.category) && String(formData.category) === String(c.id))} onChange={e => {
                        const checked = e.target.checked
                        const val = e.target.value
                        const current = Array.isArray(formData.category) ? formData.category.slice() : (formData.category ? [formData.category] : [])
                        if (checked) {
                          if (!current.includes(val)) current.push(val)
                        } else {
                          const idx = current.indexOf(val)
                          if (idx !== -1) current.splice(idx, 1)
                        }
                        setFormData({ ...formData, category: current })
                      }} />
                      <span className="checkbox-box" />
                      <span className="cat-name">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-column form-column-right">
                <input type="text" placeholder="Пример (на русском языке)" value={formData.example} onChange={e => setFormData({ ...formData, example: e.target.value })} />
                <input type="text" placeholder="Пример (на рунном языке)" value={formData.example2} onChange={e => setFormData({ ...formData, example2: e.target.value })} />
                <input type="text" placeholder="Транскрипция примера" value={formData.transcription2} onChange={e => setFormData({ ...formData, transcription2: e.target.value })} />
                <div className="audio-upload-row">
                  <input type="text" placeholder="Audio файл (..._runy.mp3)" value={formData.audio} onChange={e => setFormData({ ...formData, audio: e.target.value })} />
                  <label className="audio-upload-btn" title="Загрузить MP3">
                    📎
                    <input type="file" accept=".mp3" hidden onChange={e => handleAudioUpload(e, 'audio')} disabled={audioUploading === 'audio'} />
                  </label>
                  {formData.audio && <button type="button" className="audio-delete-btn" title="Удалить файл" onClick={() => handleAudioDelete('audio')} disabled={audioUploading === 'audio'}>🗑️</button>}
                  {audioUploading === 'audio' && <span className="upload-spinner">⏳</span>}
                </div>
                <div className="audio-upload-row">
                  <input type="text" placeholder="Audio2 файл (..._r_prim.mp3)" value={formData.audio2} onChange={e => setFormData({ ...formData, audio2: e.target.value })} />
                  <label className="audio-upload-btn" title="Загрузить MP3">
                    📎
                    <input type="file" accept=".mp3" hidden onChange={e => handleAudioUpload(e, 'audio2')} disabled={audioUploading === 'audio2'} />
                  </label>
                  {formData.audio2 && <button type="button" className="audio-delete-btn" title="Удалить файл" onClick={() => handleAudioDelete('audio2')} disabled={audioUploading === 'audio2'}>🗑️</button>}
                  {audioUploading === 'audio2' && <span className="upload-spinner">⏳</span>}
                </div>
              </div>
              <div className="form-buttons">
                <button type="submit" className="save-btn" disabled={loading}>{loading ? 'Сохранение...' : (editingId ? 'Обновить' : 'Добавить')}</button>
                {editingId && <button type="button" className="cancel-btn" onClick={() => { setEditingId(null); setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '' }) }}>Отмена</button>}
              </div>
              {error && <div className="error">{error}</div>}
            </form>
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
            <h3>👥 Пользователи ({filteredUsers.length})</h3>
            <div className="users-toolbar">
              <div className="search-container">
                <div className="search-wrapper">
                  <input
                    type="text"
                    placeholder="🔍 Поиск пользователя..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  {userSearchTerm && (
                    <button className="search-clear-btn" onClick={() => setUserSearchTerm('')} title="Очистить поиск">❌</button>
                  )}
                </div>
              </div>
              <div className="user-payment-filters">
                <button type="button" className={`filter-chip ${userPaymentFilter === 'all' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('all')}>Все</button>
                <button type="button" className={`filter-chip ${userPaymentFilter === 'paid' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('paid')}>Оплачено</button>
                <button type="button" className={`filter-chip ${userPaymentFilter === 'unpaid' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('unpaid')}>Не оплачено</button>
              </div>
              <div className="user-role-filters">
                <button type="button" className={`filter-chip ${userRoleFilter === 'all' ? 'active' : ''}`} onClick={() => setUserRoleFilter('all')}>Все</button>
                <button type="button" className={`filter-chip ${userRoleFilter === 'admin' ? 'active' : ''}`} onClick={() => setUserRoleFilter('admin')}>Админ</button>
                <button type="button" className={`filter-chip ${userRoleFilter === 'user' ? 'active' : ''}`} onClick={() => setUserRoleFilter('user')}>Пользователь</button>
              </div>
            </div>
            <div className="users-grid">
              {filteredUsers.length > 0 ? filteredUsers.map(u => (
                <div key={u.id} className={`user-card ${u.isBlocked ? 'blocked' : ''}`}>
                  <div className="user-info">
                    <p className="user-email">{u.email}</p>
                    <p className="user-meta">Роль: {u.role === 'admin' ? 'Админ' : 'Пользователь'}</p>
                    <p className="user-meta">Оплата: {u.paid ? 'Оплачено' : 'Не оплачено'} {formatDate(u.paid ? u.paidAt : u.unpaidAt)}</p>
                    <p className="user-date">Зарегистрирован: {formatDate(u.createdAt)}</p>
                    {u.isBlocked && <p className="user-blocked">Заблокирован: {formatDate(u.blockedAt)} ({u.blockedBy})</p>}
                  </div>
                  {userEditingId === u.id ? (
                    <form className="user-edit-form" onSubmit={handleSaveUser}>
                      <input
                        type="email"
                        value={userFormData.email}
                        onChange={e => setUserFormData({ ...userFormData, email: e.target.value })}
                        required
                      />
                      <select
                        value={userFormData.role}
                        onChange={e => setUserFormData({ ...userFormData, role: e.target.value })}
                      >
                        <option value="admin">Админ</option>
                        <option value="user">Пользователь</option>
                      </select>
                      <select
                        value={userFormData.paid ? 'paid' : 'unpaid'}
                        onChange={e => setUserFormData({ ...userFormData, paid: e.target.value === 'paid' })}
                      >
                        <option value="paid">Оплачено</option>
                        <option value="unpaid">Не оплачено</option>
                      </select>
                      <div className="user-edit-actions">
                        <button type="submit" className="save-user-btn" disabled={userSaving}>{userSaving ? 'Сохранение...' : 'Сохранить'}</button>
                        <button type="button" className="cancel-user-btn" onClick={handleCancelEditUser} disabled={userSaving}>Отмена</button>
                      </div>
                    </form>
                  ) : (
                    <div className="user-actions">
                      <button onClick={() => handleEditUser(u)} className="edit-user-btn">Редактировать</button>
                      {u.isBlocked ? <button onClick={() => handleUnblockUser(u.id, u.email)} className="unblock-btn">✅ Разблокировать</button> : <button onClick={() => handleBlockUser(u.id, u.email)} className="block-btn">🚫 Заблокировать</button>}
                      <button onClick={() => handleDeleteUser(u.id, u.email)} className="delete-user-btn">Удалить пользователя</button>
                    </div>
                  )}
                </div>
              )) : <div className="no-results">{userSearchTerm ? 'Пользователь не найден' : 'Пользователи не найдены'}</div>}
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

        {activeTab === 'security' && (
          <div className="logs-section">
            <div className="logs-header">
              <h3>🔐 Шифрование данных</h3>
            </div>
            <div style={{ padding: '20px' }}>
              {/* Секция 1: Зашифровать */}
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Шифрование</h4>
              <p style={{ marginBottom: '12px', color: '#aaa', fontSize: '13px' }}>
                Зашифрует все JSON-файлы в репозитории с помощью AES-256-GCM.
              </p>
              <button
                onClick={handleMigrateEncryption}
                disabled={migrationLoading}
                className="clear-logs-btn"
                style={{ marginBottom: '8px' }}
              >
                {migrationLoading ? '⏳ Шифрование...' : '🔐 Зашифровать все файлы'}
              </button>
              {migrationResult && (
                <div style={{ marginTop: '8px', marginBottom: '20px' }}>
                  <h4 style={{ color: '#fff', marginBottom: '6px' }}>Результат шифрования:</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #555' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Файл</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrationResult.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #333' }}>
                          <td style={{ padding: '4px 6px' }}>{r.file}</td>
                          <td style={{ padding: '4px 6px' }}>
                            {r.status === 'encrypted' && '✅ Зашифрован'}
                            {r.status === 'already_encrypted' && '🔒 Уже зашифрован'}
                            {r.status === 'not_found' && '⏭️ Не найден'}
                            {r.status === 'error' && `❌ ${r.error}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <hr style={{ border: '1px solid #444', margin: '20px 0' }} />

              {/* Секция 2: Статус файлов и расшифровка */}
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Расшифровка файлов</h4>
              <p style={{ marginBottom: '12px', color: '#aaa', fontSize: '13px' }}>
                Проверяет статус всех файлов и позволяет расшифровать выбранные.
              </p>
              <button
                onClick={loadFilesStatus}
                disabled={filesStatusLoading}
                className="refresh-logs-btn"
                style={{ marginBottom: '12px' }}
              >
                {filesStatusLoading ? '⏳ Проверка...' : '🔄 Проверить статус файлов'}
              </button>

              {filesStatus.length > 0 && (
                <div>
                  <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={selectAllEncrypted}
                      className="refresh-logs-btn"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                    >
                      Выбрать зашифрованные + сломанные
                    </button>
                    <button
                      onClick={selectAllPlain}
                      className="refresh-logs-btn"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                    >
                      Выбрать открытые
                    </button>
                    {selectedFiles.size > 0 && (
                      <>
                        <button
                          onClick={handleDecryptSelected}
                          disabled={decryptLoading}
                          className="clear-logs-btn"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          {decryptLoading ? '⏳ Расшифровка...' : `🔓 Расшифровать (${selectedFiles.size})`}
                        </button>
                        <button
                          onClick={handleEncryptSelected}
                          disabled={encryptLoading}
                          className="clear-logs-btn"
                          style={{ fontSize: '12px', padding: '4px 10px', background: '#2d6a4f', borderColor: '#2d6a4f' }}
                        >
                          {encryptLoading ? '⏳ Шифрование...' : `🔐 Зашифровать (${selectedFiles.size})`}
                        </button>
                      </>
                    )}
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #555' }}>
                        <th style={{ padding: '4px 6px', width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedFiles.size === filesStatus.filter(f => f.encrypted || f.broken).length && filesStatus.filter(f => f.encrypted || f.broken).length > 0}
                            onChange={() => {
                              const needAction = filesStatus.filter(f => f.encrypted || f.broken)
                              if (selectedFiles.size === needAction.length) setSelectedFiles(new Set())
                              else setSelectedFiles(new Set(needAction.map(f => f.file)))
                            }}
                          />
                        </th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Файл</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filesStatus.map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #333', opacity: f.status === 'not_found' ? 0.4 : 1 }}>
                          <td style={{ padding: '4px 6px' }}>
                            {f.encrypted !== null && (
                              <input
                                type="checkbox"
                                checked={selectedFiles.has(f.file)}
                                onChange={() => toggleFileSelection(f.file)}
                              />
                            )}
                          </td>
                          <td style={{ padding: '4px 6px' }}>{f.file}</td>
                          <td style={{ padding: '4px 6px' }}>
                            {f.encrypted === true && '🔒 Зашифрован'}
                            {f.encrypted === false && f.status === 'broken' && '⚠️ Сломан (двойное кодирование)'}
                            {f.encrypted === false && f.status === 'plain' && '📄 Открытый текст'}
                            {f.status === 'not_found' && '⏭️ Не найден'}
                            {f.status === 'error' && '❌ Ошибка'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {decryptResult && (
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ color: '#fff', marginBottom: '6px' }}>Результат расшифровки:</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #555' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Файл</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decryptResult.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #333' }}>
                          <td style={{ padding: '4px 6px' }}>{r.file}</td>
                          <td style={{ padding: '4px 6px' }}>
                            {r.status === 'decrypted' && '🔓 Расшифрован'}
                            {r.status === 'repaired' && '🔧 Восстановлен'}
                            {r.status === 'not_encrypted' && '📄 Уже открытый'}
                            {r.status === 'not_found' && '⏭️ Не найден'}
                            {r.status === 'error' && `❌ ${r.error}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {encryptResult && (
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ color: '#fff', marginBottom: '6px' }}>Результат шифрования:</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #555' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Файл</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {encryptResult.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #333' }}>
                          <td style={{ padding: '4px 6px' }}>{r.file}</td>
                          <td style={{ padding: '4px 6px' }}>
                            {r.status === 'encrypted' && '🔐 Зашифрован'}
                            {r.status === 'already_encrypted' && '🔒 Уже зашифрован'}
                            {r.status === 'not_found' && '⏭️ Не найден'}
                            {r.status === 'error' && `❌ ${r.error}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="admin-content">
        <div className="words-list" ref={wordsListRef}>
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
                      {(Array.isArray(word.category) ? word.category.length > 0 : !!word.category) && (
                        <div className="word-category">({Array.isArray(word.category) ? word.category.map(id => (categories.find(c => c.id === id) || { name: id }).name).join('; ') : (categories.find(c => c.id === word.category)?.name || word.category)})</div>
                      )}
                      <div className="examples">
                        {word.example && <span className="word-example">{word.example}</span>}
                        {word.example2 && <><span className="word-dash"> — </span><span className="word-example2">{word.example2}</span></>}
                        {word.transcription2 && <span className="word-transcription2">[{word.transcription2}]</span>}
                      </div>
                      {word.audio && (
                        <p className="word-audio">
                          🔊 {word.audio}
                          <button type="button" className="audio-play-btn" onClick={() => playAudioFile(word.audio)} title="Воспроизвести" style={{ marginLeft: '8px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px' }}>▶️</button>
                        </p>
                      )}
                      {word.audio2 && (
                        <p className="word-audio">
                          🔊 {word.audio2}
                          <button type="button" className="audio-play-btn" onClick={() => playAudioFile(word.audio2)} title="Воспроизвести" style={{ marginLeft: '8px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px' }}>▶️</button>
                        </p>
                      )}
                    </div>

                                    {/* determine per-card edit permission: admins or owner only */}
                                    {(() => {
                                      const isAdmin = activeUser?.role === 'admin'
                                      const isOwner = activeUser?.role === 'user' && String(activeUser.email).toLowerCase() === String(word.createdBy || '').toLowerCase()
                                      // В пользовательском режиме все видимые слова — его личный словарь, поэтому редактирование доступно всегда
                                      const canEdit = isAdmin || isOwner || isRestrictedUser
                                      return canEdit ? (
                                        <div className="word-actions">
                                          <button onClick={() => handleEdit(word)} className="edit-btn">✏️</button>
                                          <button onClick={() => handleDelete(word.id, word.createdBy)} className="delete-btn">🗑️</button>
                                        </div>
                                      ) : null
                                    })()}

                                    <button className="card-scroll-top-btn admin" onClick={scrollWordsToTop} title="Вверх">⬆</button>
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
