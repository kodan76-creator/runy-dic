import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { verifyAdmin, verifyUser, getDictionary, addWord, updateWord, deleteWord, moveWordUp, moveWordDown, moveWordToTop, moveWordToBottom, moveWordToPosition, getUsers, updateUser, blockUser, unblockUser, deleteUser, getLogs, clearLogs, getCategories, addCategory, updateCategory, deleteCategory, moveCategoryUp, moveCategoryDown, moveCategoryToTop, getRunes, addRune, updateRune, deleteRune, moveRuneUp, moveRuneDown, moveRuneToTop, ensureUserDictionaryFile, uploadAudioFile, deleteAudioFile, uploadImageFile, deleteImageFile, buildImageUrl, migrateAllFiles, checkFilesEncryptionStatus, decryptFiles, encryptFiles, emailToFolderName, importDictionary, humanizeImportError, normalizeImportIds, flushOfflineChanges, collectAudioUrls, precacheUrls } from './githubApi'
import DictionaryTab from './components/admin/DictionaryTab'
import RunesTab from './components/admin/RunesTab'
import { isOnline, cacheDictionaryForOffline, getCachedDictionary, getCachedCategories } from './api/offline'
import CategoriesTab from './components/admin/CategoriesTab'
import UsersTab from './components/admin/UsersTab'
import LogsTab from './components/admin/LogsTab'
import SecurityTab from './components/admin/SecurityTab'
import WordItem from './components/admin/WordItem'
import ThemeToggle from './components/ThemeToggle'
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
  const [words, setWords] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('dictionary')
  const [editingId, setEditingId] = useState(null)
  const [userEditingId, setUserEditingId] = useState(null)
  const [userFormData, setUserFormData] = useState({ email: '', role: 'user', paid: false, runesPaid: false })
  const [userSaving, setUserSaving] = useState(false)
  const [audioUploading, setAudioUploading] = useState('')
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const msgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [message, setMessage] = useState<{ text: string; type?: string } | ''>('')

  const showMessage = useCallback((text, type = 'success') => {
    setMessage({ text, type })
    if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current)
    msgTimeoutRef.current = setTimeout(() => setMessage(''), 4000)
  }, [])
  const [formData, setFormData] = useState({
    word: '', transcription: '', translation: '', category: [],
    example: '', example2: '', transcription2: '',
    audio: '', audio2: '', textAlign: 'center'
  })
  const [runes, setRunes] = useState<any[]>([])
  const [runeEditingId, setRuneEditingId] = useState(null)
  const [runeFormData, setRuneFormData] = useState({
    name: '', graphic: '', letter: '', image: '', power: '', keywords: '', description: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const [searchTerm, setSearchTerm] = useState('')
  const [positionInputs, setPositionInputs] = useState({})
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userPaymentFilter, setUserPaymentFilter] = useState('all')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const wordsListRef = useRef(null)

  // Active user: admins get full panel, regular users get restricted dictionary-only panel.
  const activeUser = (adminUser && adminUser.role === 'admin') ? adminUser : (currentUser && ['admin', 'user'].includes(currentUser.role) ? currentUser : null)
  // A non-admin (regular) user is restricted and should not be treated as admin here
  const isRestrictedUser = activeUser?.role === 'user'

  const getAudioSrc = useCallback((fileName, userFolder) => {
    if (!fileName) return ''
    // Локальный URL (same-origin public/audio/) — кэшируется SW и играет оффлайн
    const base = `${import.meta.env.BASE_URL}audio/`
    if (fileName.includes('/')) return `${base}${fileName}`
    if (userFolder) return `${base}${userFolder}/${fileName}`
    return `${base}${fileName}`
  }, [])

  // Резервный URL на raw.githubusercontent — для свежезагруженных файлов,
  // которые ещё не попали в собранный сайт
  const getRawAudioSrc = useCallback((fileName, userFolder) => {
    if (!fileName) return ''
    const base = 'https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/audio/'
    if (fileName.includes('/')) return `${base}${fileName}`
    if (userFolder) return `${base}${userFolder}/${fileName}`
    return `${base}${fileName}`
  }, [])

  // URL картинки (same-origin public/images/) для превью в админке:
  // админ — общий словарь (корень), обычный пользователь — личный (images/{emailFolder}/)
  const getImageSrc = useCallback((fileName) => {
    if (!fileName) return ''
    if (/^https?:\/\//i.test(fileName)) return fileName
    const userFolder = isRestrictedUser && activeUser?.email ? emailToFolderName(activeUser.email) : ''
    return buildImageUrl(fileName, userFolder)
  }, [isRestrictedUser, activeUser])

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
  }, [])

  const playAudioFile = useCallback((fileName) => {
    stopAudio()
    // Админ — общий словарь (audio в корне public/audio/), пользователь — личный (audio/{emailFolder}/)
    const userFolder = isRestrictedUser && activeUser?.email ? emailToFolderName(activeUser.email) : ''
    const localSrc = getAudioSrc(fileName, userFolder)
    const rawSrc = getRawAudioSrc(fileName, userFolder)
    const fail = () => showMessage(`❌ Файл «${fileName}» не найден на сервере`, 'error')
    // Пробуем локальный URL (кэшируется SW и играет оффлайн); если файл ещё
    // не в сборке сайта — откатываемся на raw.githubusercontent.
    const attempt = (src) => {
      const audio = new Audio(src)
      currentAudioRef.current = audio
      const finish = () => { if (currentAudioRef.current === audio) currentAudioRef.current = null }
      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', () => {
        finish()
        if (src === localSrc && rawSrc && src !== rawSrc) attempt(rawSrc)
        else fail()
      }, { once: true })
      audio.play().catch(() => {
        finish()
        if (src === localSrc && rawSrc && src !== rawSrc) attempt(rawSrc)
        else fail()
      })
    }
    attempt(localSrc)
  }, [stopAudio, getAudioSrc, getRawAudioSrc, isRestrictedUser, activeUser, showMessage])

  const scrollWordsToTop = useCallback(() => {
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
      const adminPanel = document.querySelector('.admin-panel') as HTMLElement | null
      if (isMobile && adminPanel && getComputedStyle(adminPanel).overflow === 'hidden') {
        const prev = adminPanel.style.overflow
        adminPanel.style.overflow = 'auto'
        // allow layout update then smooth scroll
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
        setTimeout(() => { adminPanel.style.overflow = prev }, 600)
      }
    } catch {
      // last resort
      try { window.scrollTo({ top: 0 }) } catch { /* ignore */ }
    }
  }, [])
  const [authLoading, setAuthLoading] = useState(false)

  // Миграция шифрования
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [migrationResult, setMigrationResult] = useState<any[] | null>(null)
  const [filesStatus, setFilesStatus] = useState<any[]>([])
  const [filesStatusLoading, setFilesStatusLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [decryptLoading, setDecryptLoading] = useState(false)
  const [decryptResult, setDecryptResult] = useState<any[] | null>(null)
  const [encryptLoading, setEncryptLoading] = useState(false)
  const [encryptResult, setEncryptResult] = useState<any[] | null>(null)

  // Categories
  const [categories, setCategories] = useState<any[]>([])
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [catEditingId, setCatEditingId] = useState(null)

  const loadWords = useCallback(async () => {
    setLoading(true)
    try {
      const dictionaryOwner = isRestrictedUser ? activeUser?.email : activeUser
      const { data } = await getDictionary(dictionaryOwner)
      const arr = Array.isArray(data) ? data : []
      const offlineNow = !isOnline()
      // getDictionary не выбрасывает ошибку при отсутствии сети — возвращает
      // пустые данные. Поэтому явно проверяем статус сети и берём кэш.
      if (offlineNow && arr.length === 0 && activeUser?.email) {
        // 🌐 Оффлайн: показать словарь из кэша
        const cached = getCachedDictionary(activeUser.email)
        if (Array.isArray(cached)) {
          setWords(cached)
          setIsOffline(true)
          // Категории тоже берём из кэша, иначе вместо названий будут ID
          const cachedCats = getCachedCategories(activeUser.email)
          if (Array.isArray(cachedCats)) setCategories(cachedCats)
        } else {
          setError('Нет интернета. Словарь не загружен — оффлайн-копия ещё не сохранена.')
        }
      } else {
        setWords(arr)
        setIsOffline(false)
        setError('')
        // Кэшируем словарь для оффлайн-режима (для обычного пользователя
        // помечаем слова как личные, чтобы на странице пользователя
        // счётчик «Личных» считался корректно)
        if (activeUser?.email) {
          const cacheArr = isRestrictedUser
            ? arr.map(w => ({ ...w, __dictionarySource: 'personal' }))
            : arr
          cacheDictionaryForOffline(activeUser.email, cacheArr)
        }
        // 🎵 Прогреваем аудио в кэше SW, чтобы оно играло оффлайн
        const audioFolder = isRestrictedUser && activeUser?.email ? emailToFolderName(activeUser.email) : ''
        precacheUrls(collectAudioUrls(arr, audioFolder))
      }
    } catch (err) {
      setError('Ошибка: ' + err.message)
      // 🌐 Оффлайн: пробуем кэш
      if (activeUser?.email) {
        const cached = getCachedDictionary(activeUser.email)
        if (Array.isArray(cached)) {
          setWords(cached)
          setIsOffline(true)
        }
      }
    }
    setLoading(false)
  }, [isRestrictedUser, activeUser, setLoading, setWords, setError, setIsOffline])
  // Обновление списка после записи на GitHub — как кнопка «Обновить», но с повторами,
  // пока GitHub не отдаст актуальный порядок карточек
  const refreshWordsAfterWrite = useCallback(async () => {
    // 🌐 Оффлайн: читаем актуальный список из кэша (изменения уже применены к нему)
    if (!isOnline()) {
      if (activeUser?.email) {
        const cached = getCachedDictionary(activeUser.email)
        if (Array.isArray(cached)) setWords(cached)
      }
      return
    }
    const beforeJson = JSON.stringify(words)
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const dictionaryOwner = isRestrictedUser ? activeUser?.email : activeUser
        const { data } = await getDictionary(dictionaryOwner)
        const arr = Array.isArray(data) ? data : []
        setWords(arr)
        // Обновляем и оффлайн-кэш, чтобы копия была свежей
        if (activeUser?.email) {
          const cacheArr = isRestrictedUser
            ? arr.map(w => ({ ...w, __dictionarySource: 'personal' }))
            : arr
          cacheDictionaryForOffline(activeUser.email, cacheArr)
        }
        // 🎵 Прогреваем аудио (после загрузки/правок словаря)
        const audioFolder = isRestrictedUser && activeUser?.email ? emailToFolderName(activeUser.email) : ''
        precacheUrls(collectAudioUrls(arr, audioFolder))
        if (JSON.stringify(arr) !== beforeJson) return
      } catch { /* пробуем ещё раз */ }
      await new Promise(res => setTimeout(res, 400))
    }
  }, [words, isRestrictedUser, activeUser, setWords, isOnline])
  const loadUsers = async () => { try { setUsers(await getUsers()) } catch (err) { console.error(err) } }
  const loadLogs = async () => { try { setLogs(await getLogs()) } catch (err) { console.error(err) } }
  const loadCategories = async () => {
    try {
      const { data } = await getCategories()
      const arr = Array.isArray(data) ? data : []
      const offlineNow = !isOnline()
      if (offlineNow && arr.length === 0 && activeUser?.email) {
        // 🌐 Оффлайн: категории берём из кэша
        const cached = getCachedCategories(activeUser.email)
        if (Array.isArray(cached)) setCategories(cached)
      } else {
        setCategories(arr)
        // Кэшируем категории для оффлайн-режима (слова сохраняются через prev)
        if (activeUser?.email) cacheDictionaryForOffline(activeUser.email, undefined, arr)
      }
    } catch (err) { console.error('loadCategories error', err) }
  }

  const loadRunes = async () => {
    try {
      const { data } = await getRunes()
      setRunes(Array.isArray(data) ? data : [])
    } catch (err) { console.error('loadRunes error', err) }
  }

  useEffect(() => {
    if (activeUser) {
      Promise.resolve().then(() => {
        loadWords()
        if (!isRestrictedUser) {
          loadUsers()
          loadLogs()
          loadCategories()
          loadRunes()
        } else {
          loadCategories()
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser, isRestrictedUser])

  // 🌐 Реагируем на изменение соединения: оффлайн — берём словарь из кэша,
  // при возврате сети — перезагружаем с сервера
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true)
      // перезагружаем словарь: при оффлайне loadWords возьмёт кэш
      if (activeUser) loadWords()
    }
    const handleOnline = () => {
      setIsOffline(false)
      if (activeUser) {
        loadWords()
        // 🌐 Синхронизируем изменения, сделанные оффлайн, на GitHub
        flushOfflineChanges(activeUser)
          .then(n => {
            if (n > 0) showMessage(`✅ Синхронизировано изменений: ${n}`)
            loadWords()
          })
          .catch(err => console.error('Ошибка синхронизации оффлайн-изменений:', err))
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser])

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

  // Автозагрузка статуса файлов при открытии вкладки "Безопасность"
  useEffect(() => {
    if (activeTab === 'security' && !isRestrictedUser) {
      loadFilesStatus()
    }
  }, [activeTab, isRestrictedUser])

  const filteredWords = useMemo(() => {
    return words.filter(w =>
      w.word?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.translation?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, words])

  // Быстрый поиск индекса карточки в полном списке (вместо O(n²) findIndex в map)
  const wordIndexMap = useMemo(() => {
    const map = new Map()
    words.forEach((w, i) => map.set(w.id, i))
    return map
  }, [words])

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
      // Если нет интернета — сразу сообщаем, не пытаясь обратиться к серверу
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Нет интернета. Для входа необходимо подключение к интернету.')
      }
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
    } catch (err) {
      console.error(err)
      // Для понятных сообщений (например, «Нет интернета») показываем их напрямую
      const msg = err?.message || ''
      setError(msg.includes('Нет интернета') ? msg : 'Ошибка авторизации: ' + msg)
    }
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
      setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '', textAlign: 'center' })
      setEditingId(null); await loadWords()
    } catch (err) {
      setError(err.message)
      showMessage('❌ ' + err.message, 'error')
    }
    setLoading(false)
  }

  // Импорт словаря: replace — заменить всё, merge — добавить к существующим.
  // id импортируемых слов нормализуется: пустой или не последний+1 → назначаем
  // последний+1 (это не ошибка, а авто-исправление).
  const handleImport = useCallback(async (imported, mode) => {
    setLoading(true)
    try {
      const importedCount = Array.isArray(imported) ? imported.length : 0
      let finalArr
      if (mode === 'replace') {
        // Чистый старт: id идут 1,2,3... (уже правильные сохраняются)
        finalArr = normalizeImportIds(imported, 0)
      } else {
        const existing = Array.isArray(words) ? words : []
        const baseId = existing.reduce((m, w) => {
          const n = Number(w.id)
          return Number.isFinite(n) && n > m ? n : m
        }, 0)
        const normalized = normalizeImportIds(imported, baseId)
        const map = new Map()
        const keyOf = (w) => w?.id ? `id:${w.id}` : `w:${String(w?.word || '')}_t:${String(w?.translation || '')}`
        existing.forEach(w => map.set(keyOf(w), w))
        normalized.forEach(w => map.set(keyOf(w), w))
        finalArr = Array.from(map.values())
      }
      await importDictionary(finalArr, activeUser)
      showMessage(`✅ Импортировано слов: ${importedCount}`)
      await loadWords()
    } catch (err) {
      const human = humanizeImportError(err)
      setError(human)
      showMessage(human, 'error')
    }
    setLoading(false)
  }, [words, activeUser, loadWords, showMessage, setError])

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

  const handleRuneImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = String((file.name || '').split('.').pop() || '').toLowerCase()
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
      setError('Допускаются только изображения (PNG, JPG, JPEG, WEBP, GIF, SVG)')
      e.target.value = ''
      return
    }
    if (!activeUser?.email) {
      setError('Не удалось определить пользователя')
      return
    }
    setAudioUploading('runeImage')
    setError('')
    const oldName = runeFormData.image
    try {
      // Руны — общий словарь, поэтому картинка всегда в корень public/images/
      const result = await uploadImageFile(file, activeUser.email, true)
      setRuneFormData(prev => ({ ...prev, image: result.path }))
      showMessage(`✅ Картинка «${result.path}» загружена`)
      // Если был старый файл и он не совпадает с новым — удаляем старый
      if (oldName && oldName !== result.path) {
        try {
          await deleteImageFile(oldName, activeUser.email, true)
        } catch { /* файл мог быть уже удалён — не критично */ }
      }
    } catch (err) {
      const errMsg = err.message || 'Неизвестная ошибка'
      setError('❌ Ошибка загрузки картинки: ' + errMsg)
      showMessage('❌ Ошибка загрузки картинки: ' + errMsg, 'error')
    }
    setAudioUploading('')
    e.target.value = ''
  }

  const handleRuneImageDelete = async () => {
    const fileName = runeFormData.image
    if (!fileName) return
    if (!activeUser?.email) { setError('Не удалось определить пользователя'); return }
    if (!window.confirm(`Удалить картинку «${fileName}»?`)) return
    setAudioUploading('runeImage')
    setError('')
    try {
      await deleteImageFile(fileName, activeUser.email, true)
      setRuneFormData(prev => ({ ...prev, image: '' }))
      showMessage(`✅ Картинка «${fileName}» удалена`)
    } catch (err) {
      const errMsg = err.message || 'Неизвестная ошибка'
      // Если файл не найден — всё равно очищаем поле, т.к. файла уже нет
      if (errMsg.includes('не найден')) {
        setRuneFormData(prev => ({ ...prev, image: '' }))
        showMessage(`⚠️ Файл «${fileName}» не найден на сервере — поле очищено`)
      } else {
        setError('❌ Ошибка удаления картинки: ' + errMsg)
        showMessage('❌ Ошибка удаления картинки: ' + errMsg, 'error')
      }
    }
    setAudioUploading('')
  }

  const handleEdit = useCallback((word) => {
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
        audio: word.audio || '', audio2: word.audio2 || '', textAlign: word.textAlign || 'center'
      })

      // Мобильная версия: после нажатия «Редактировать» прокручиваем страницу
      // в самый вверх, чтобы форма редактирования (вверху) была видна.
      if (typeof window !== 'undefined' && (window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent))) {
        const adminPanel = document.querySelector('.admin-panel')
        if (adminPanel && typeof adminPanel.scrollTo === 'function') {
          adminPanel.scrollTo({ top: 0, behavior: 'smooth' })
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, [activeUser, isRestrictedUser, categories, setEditingId, setFormData, setError])

    const handleDelete = useCallback(async (id, wordOwnerEmail) => {
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
    }, [activeUser, isRestrictedUser, loadWords, showMessage, setError])

  const handleMoveWordUp = useCallback(async (id) => {
    try {
      const moved = await moveWordUp(id, activeUser)
      if (moved) await refreshWordsAfterWrite()
      showMessage(moved ? '✅ Карточка перемещена вверх' : 'Карточка уже вверху')
    } catch (err) { setError('Ошибка перемещения: ' + err.message); showMessage('❌ ' + err.message, 'error') }
  }, [activeUser, refreshWordsAfterWrite, showMessage, setError])
  const handleMoveWordDown = useCallback(async (id) => {
    try {
      const moved = await moveWordDown(id, activeUser)
      if (moved) await refreshWordsAfterWrite()
      showMessage(moved ? '✅ Карточка перемещена вниз' : 'Карточка уже внизу')
    } catch (err) { setError('Ошибка перемещения: ' + err.message); showMessage('❌ ' + err.message, 'error') }
  }, [activeUser, refreshWordsAfterWrite, showMessage, setError])
  const handleMoveWordToTop = useCallback(async (id) => {
    try {
      const moved = await moveWordToTop(id, activeUser)
      if (moved) await refreshWordsAfterWrite()
      showMessage(moved ? '✅ Карточка перемещена в начало' : 'Карточка уже в начале')
    } catch (err) { setError('Ошибка перемещения: ' + err.message); showMessage('❌ ' + err.message, 'error') }
  }, [activeUser, refreshWordsAfterWrite, showMessage, setError])
  const handleMoveWordToBottom = useCallback(async (id) => {
    try {
      const moved = await moveWordToBottom(id, activeUser)
      if (moved) await refreshWordsAfterWrite()
      showMessage(moved ? '✅ Карточка перемещена в конец' : 'Карточка уже в конце')
    } catch (err) { setError('Ошибка перемещения: ' + err.message); showMessage('❌ ' + err.message, 'error') }
  }, [activeUser, refreshWordsAfterWrite, showMessage, setError])
  const handleMoveWordToPosition = useCallback(async (id, posStr) => {
    const pos = parseInt(posStr, 10)
    if (isNaN(pos) || pos < 1 || pos > words.length) {
      showMessage(`Укажите номер от 1 до ${words.length}`, 'error')
      return
    }
    try {
      const moved = await moveWordToPosition(id, pos, activeUser)
      setPositionInputs(prev => { const next = { ...prev }; delete next[id]; return next })
      if (moved) await refreshWordsAfterWrite()
      showMessage(moved ? '✅ Позиция обновлена' : 'Позиция не изменилась')
    } catch (err) {
      setError('Ошибка перемещения: ' + err.message)
      showMessage('❌ ' + err.message, 'error')
    }
  }, [activeUser, refreshWordsAfterWrite, showMessage, setError, words.length, setPositionInputs])

  // Мемоизация сетки карточек: перерисовываем карточки только когда меняются сами данные,
  // а не при вводе символов в любом поле формы (иначе 900+ карточек перерисовываются на каждое нажатие)
  const wordsGrid = useMemo(() => {
    if (!(filteredWords.length > 0)) {
      return <div className="no-results">{searchTerm ? 'Ничего не найдено' : 'Словарь пуст'}</div>
    }
    return filteredWords.map((word, idx) => {
      const isAdmin = activeUser?.role === 'admin'
      const isOwner = activeUser?.role === 'user' && String(activeUser.email).toLowerCase() === String(word.createdBy || '').toLowerCase()
      // В пользовательском режиме все видимые слова — его личный словарь, поэтому редактирование доступно всегда
      const canEdit = isAdmin || isOwner || isRestrictedUser
      const actualIdx = wordIndexMap.get(word.id) ?? -1
      const isFirst = actualIdx === 0
      const isLast = actualIdx === words.length - 1
      return (
        <WordItem
          key={word.id}
          word={word}
          idx={idx}
          canEdit={canEdit}
          isFirst={isFirst}
          isLast={isLast}
          positionValue={positionInputs[word.id] ?? actualIdx + 1}
          wordsLength={words.length}
          categories={categories}
          onMoveToTop={handleMoveWordToTop}
          onMoveUp={handleMoveWordUp}
          onMoveDown={handleMoveWordDown}
          onMoveToBottom={handleMoveWordToBottom}
          onPositionChange={(id, value) => setPositionInputs(prev => ({ ...prev, [id]: value }))}
          onPositionSubmit={handleMoveWordToPosition}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPlayAudio={playAudioFile}
          onScrollTop={scrollWordsToTop}
        />
      )
    })
  }, [filteredWords, searchTerm, categories, words, wordIndexMap, positionInputs, isRestrictedUser, activeUser, handleMoveWordToTop, handleMoveWordUp, handleMoveWordDown, handleMoveWordToBottom, handleMoveWordToPosition, handleEdit, handleDelete, playAudioFile, scrollWordsToTop])

  // Categories handlers
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
      try { await deleteCategory(id); await loadCategories() } catch (err) { setError('Ошибка удаления категории: ' + err.message) }
    }
  }
  const handleMoveCategoryUp = async (id) => {
    try { await moveCategoryUp(id); await loadCategories() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
  }
  const handleMoveCategoryDown = async (id) => {
    try { await moveCategoryDown(id); await loadCategories() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
  }
  const handleMoveCategoryToTop = async (id) => {
    try { await moveCategoryToTop(id); await loadCategories() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
  }

  // 🧿 Новые Руны — обработчики
  const handleRuneSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!runeFormData.name?.trim()) { setError('Название руны не может быть пустым'); return }
    try {
      if (runeEditingId) {
        await updateRune(runeEditingId, runeFormData)
        showMessage('✅ Руна обновлена')
      } else {
        await addRune(runeFormData, adminUser?.email || activeUser?.email)
        showMessage('✅ Руна добавлена')
      }
      setRuneEditingId(null)
      setRuneFormData({ name: '', graphic: '', letter: '', image: '', power: '', keywords: '', description: '' })
      await loadRunes()
    } catch (err) { setError('Ошибка рун: ' + err.message) }
  }

  const handleEditRune = (r) => {
    setError('')
    setRuneEditingId(r.id)
    setRuneFormData({
      name: r.name || '',
      graphic: r.graphic || '',
      letter: r.letter || '',
      image: r.image || '',
      power: r.power || '',
      keywords: r.keywords || '',
      description: r.description || '',
    })
  }

  const handleDeleteRune = async (id) => {
    if (window.confirm('Удалить эту руну?')) {
      try { await deleteRune(id); await loadRunes() } catch (err) { setError('Ошибка удаления руны: ' + err.message) }
    }
  }

  const handleMoveRuneUp = async (id) => {
    try { await moveRuneUp(id); await loadRunes() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
  }
  const handleMoveRuneDown = async (id) => {
    try { await moveRuneDown(id); await loadRunes() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
  }
  const handleMoveRuneToTop = async (id) => {
    try { await moveRuneToTop(id); await loadRunes() } catch (err) { setError('Ошибка перемещения: ' + err.message) }
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
      paid: Boolean(user.paid),
      runesPaid: Boolean(user.runesPaid)
    })
  }
  const handleCancelEditUser = () => {
    setUserEditingId(null)
    setUserFormData({ email: '', role: 'user', paid: false, runesPaid: false })
  }
  const handleSaveUser = async (e) => {
    e.preventDefault()
    setError('')
    setUserSaving(true)
    try {
      if (userFormData.email && !/^[a-zA-Z0-9@._-]+$/.test(userFormData.email)) {
        throw new Error('Логин может содержать только латинские буквы, цифры и символы @ . _ -')
      }
      const prevUser = users.find(u => u.id === userEditingId)
      const becameUnpaid = Boolean(
        prevUser && ((Boolean(prevUser.paid) && !userFormData.paid) || (Boolean(prevUser.runesPaid) && !userFormData.runesPaid))
      )
      await updateUser(userEditingId, userFormData, adminUser?.email || activeUser?.email)
      if (becameUnpaid) {
        showMessage(`⚠️ ${prevUser?.email}: статус «не оплачено» — пользователь будет разлогинен на всех устройствах`, 'error')
      }
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
      {isOffline && (
        <div className="offline-banner" role="status">
          ⚠️ Нет интернета — показана сохранённая копия словаря. Изменения сохранятся, когда появится соединение.
        </div>
      )}
      <div className="admin-fixed-container">
        <div className="admin-header">
          <h2>⚙️ Управление словарём</h2>
          <div className="admin-info">
            <span className="admin-email">{activeUser?.email || adminUser?.email}</span>
            <div className="admin-actions">
              <ThemeToggle className="admin" />
              <button onClick={handleLogout} className="logout-btn">Выйти</button>
            </div>
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
              <button className={`tab-btn ${activeTab === 'runes' ? 'active' : ''}`} onClick={() => setActiveTab('runes')}>🧿 Новые Руны</button>
              <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️ Категории</button>
              <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 Пользователи</button>
              <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>📊 Логи</button>
              <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>🔐 Безопасность</button>
            </>
          )}
        </div>

        {activeTab === 'dictionary' && (
          <DictionaryTab
            words={words}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            formData={formData}
            setFormData={setFormData}
            categories={categories}
            editingId={editingId}
            setEditingId={setEditingId}
            loading={loading}
            error={error}
            audioUploading={audioUploading}
            handleSubmit={handleSubmit}
            handleAudioUpload={handleAudioUpload}
            handleAudioDelete={handleAudioDelete}
            loadWords={loadWords}
            onImport={handleImport}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesTab
            categories={categories}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            catEditingId={catEditingId}
            setCatEditingId={setCatEditingId}
            handleCategorySubmit={handleCategorySubmit}
            handleEditCategory={handleEditCategory}
            handleDeleteCategory={handleDeleteCategory}
            handleMoveCategoryUp={handleMoveCategoryUp}
            handleMoveCategoryDown={handleMoveCategoryDown}
            handleMoveCategoryToTop={handleMoveCategoryToTop}
          />
        )}

        {activeTab === 'runes' && (
          <RunesTab
            runes={runes}
            runeFormData={runeFormData}
            setRuneFormData={setRuneFormData}
            runeEditingId={runeEditingId}
            setRuneEditingId={setRuneEditingId}
            audioUploading={audioUploading}
            getImageSrc={getImageSrc}
            handleRuneSubmit={handleRuneSubmit}
            handleEditRune={handleEditRune}
            handleDeleteRune={handleDeleteRune}
            handleMoveRuneUp={handleMoveRuneUp}
            handleMoveRuneDown={handleMoveRuneDown}
            handleMoveRuneToTop={handleMoveRuneToTop}
            handleRuneImageUpload={handleRuneImageUpload}
            handleRuneImageDelete={handleRuneImageDelete}
          />
        )}

        {activeTab === 'users' && (
          <UsersTab
            filteredUsers={filteredUsers}
            userSearchTerm={userSearchTerm}
            setUserSearchTerm={setUserSearchTerm}
            userPaymentFilter={userPaymentFilter}
            setUserPaymentFilter={setUserPaymentFilter}
            userRoleFilter={userRoleFilter}
            setUserRoleFilter={setUserRoleFilter}
            userEditingId={userEditingId}
            userFormData={userFormData}
            setUserFormData={setUserFormData}
            userSaving={userSaving}
            handleSaveUser={handleSaveUser}
            handleEditUser={handleEditUser}
            handleCancelEditUser={handleCancelEditUser}
            handleBlockUser={handleBlockUser}
            handleUnblockUser={handleUnblockUser}
            handleDeleteUser={handleDeleteUser}
            formatDate={formatDate}
          />
        )}

        {activeTab === 'logs' && (
          <LogsTab
            logs={logs}
            loadLogs={loadLogs}
            handleClearLogs={handleClearLogs}
            formatDate={formatDate}
          />
        )}

        {activeTab === 'security' && (
          <SecurityTab
            filesStatus={filesStatus}
            filesStatusLoading={filesStatusLoading}
            migrationLoading={migrationLoading}
            decryptLoading={decryptLoading}
            encryptLoading={encryptLoading}
            selectedFiles={selectedFiles}
            migrationResult={migrationResult}
            decryptResult={decryptResult}
            encryptResult={encryptResult}
            handleMigrateEncryption={handleMigrateEncryption}
            loadFilesStatus={loadFilesStatus}
            selectAllEncrypted={selectAllEncrypted}
            selectAllPlain={selectAllPlain}
            handleDecryptSelected={handleDecryptSelected}
            handleEncryptSelected={handleEncryptSelected}
            toggleFileSelection={toggleFileSelection}
            setSelectedFiles={setSelectedFiles}
          />
        )}
      </div>

      <div className="admin-content">
        <div className="words-list" ref={wordsListRef}>
          {activeTab === 'dictionary' && (
            <>
              {loading && !editingId && <div className="loading">Загрузка...</div>}
              <div className="words-grid">{wordsGrid}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
