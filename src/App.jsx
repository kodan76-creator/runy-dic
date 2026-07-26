import { useState, useEffect, useMemo, useRef } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { verifyUser, registerUser, logoutUser, getDictionary, logSearch, logAudioPlay, getCategories, getFavoritesForUser, updateFavoritesForUser, emailToFolderName } from './githubApi'
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
        try { window.location.hash = userWithRole.role === 'admin' ? '/admin' : '/' } catch (e) { /* ignore */ }
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

// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [playMode, setPlayMode] = useState('sequential')
  const [sortMode, setSortMode] = useState('translation')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState([]) // array of category ids
  const [favorites, setFavorites] = useState(new Set())
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false)
  const [dictionarySourceFilter, setDictionarySourceFilter] = useState('all')
  const currentAudioRef = useRef(null)
  const stopPlaylistRef = useRef(false)
  const writeQueueRef = useRef(Promise.resolve()) // serialize favorites writes
  const resultsRef = useRef(null)

  const scrollResultsToTop = () => {
    const el = resultsRef.current || document.querySelector('.results')
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  
  // load favorites for current user from localStorage
  useEffect(() => {
    let mounted = true
    if (!user || !user.email) return
    // load from server, fallback to localStorage
    const load = async () => {
      try {
        const server = await getFavoritesForUser(user.email)
        if (mounted && Array.isArray(server)) {
          // normalize ids to strings for consistent comparisons
          setFavorites(new Set(server.map(String)))
          return
        }
      } catch (e) {
        console.warn('Failed to load favorites from server, falling back to localStorage', e)
      }

      try {
        const raw = localStorage.getItem(`favorites:${user.email}`)
        if (raw) {
          const arr = JSON.parse(raw)
          if (mounted) setFavorites(new Set((Array.isArray(arr) ? arr : []).map(String)))
        } else if (mounted) {
          setFavorites(new Set())
        }
      } catch (e) {
        console.error('Failed to load favorites from localStorage', e)
        if (mounted) setFavorites(new Set())
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

  const [favoritesSyncStatus, setFavoritesSyncStatus] = useState('idle') // 'idle' | 'saving' | 'error'

  // persist favorites on change (enqueue write to server, fallback to localStorage)
  useEffect(() => {
    if (!user || !user.email) return
    const saveTask = async () => {
      setFavoritesSyncStatus('saving')
      try {
        const now = new Date().toISOString()
        const ok = await updateFavoritesForUser(user.email, Array.from(favorites), now)
        if (ok) setFavoritesSyncStatus('idle')
        else {
          setFavoritesSyncStatus('error')
          try { localStorage.setItem(`favorites:${user.email}`, JSON.stringify(Array.from(favorites))) } catch (err) { console.error('Failed to save favorites locally', err) }
        }
      } catch (e) {
        console.error('Failed to sync favorites to server:', e)
        setFavoritesSyncStatus('error')
        try { localStorage.setItem(`favorites:${user.email}`, JSON.stringify(Array.from(favorites))) } catch (err) { console.error('Failed to save favorites locally', err) }
      }
    }

    // enqueue write to serialize concurrent updates
    writeQueueRef.current = writeQueueRef.current.then(() => saveTask()).catch(err => { console.error('Favorites queue task error', err) })

    return () => {}
  }, [favorites, user])

  const toggleFavorite = (id) => {
    const idStr = String(id)
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(idStr)) next.delete(idStr)
      else next.add(idStr)
      return next
    })
  }

  const clearFavorites = () => {
    setFavorites(new Set())
  }

  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary(user)
        const sourceFallback = user.role === 'user' ? 'personal' : 'shared'
        const sortedData = [...(data || [])]
          .map(item => ({ ...item, __dictionarySource: item.__dictionarySource || sourceFallback }))
          .sort((a, b) => (a.translation || '').localeCompare(b.translation || ''))
        setWords(sortedData)
      } catch (err) { console.error('Ошибка загрузки:', err); setWords([]) }
    }

    const loadCategories = async () => {
      try {
        const { data } = await getCategories()
        setCategories(Array.isArray(data) ? data : [])
      } catch (err) { console.error('Ошибка загрузки категорий:', err); setCategories([]) }
    }

    Promise.all([loadWords(), loadCategories()]).finally(() => setLoading(false))
  }, [user])

  // toggle category id in selectedFilters
  const toggleFilter = (id) => {
    setSelectedFilters(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const clearFilters = () => setSelectedFilters([])

  const applyFilters = () => setShowFilterModal(false)

  const dictionaryStats = useMemo(() => {
    const personal = words.filter(item => item.__dictionarySource === 'personal').length
    return { personal, total: words.length }
  }, [words])

  const getDictionarySourceLabel = (item) => (
    item.__dictionarySource === 'shared' ? 'Общий словарь' : 'Личный словарь'
  )

  const renderCategory = (category) => {
    const values = Array.isArray(category) ? category : [category]
    const label = values
      .filter(value => (typeof value === 'string' ? value.trim().length > 0 : Boolean(value)))
      .map(id => categories.find(c => c.id === id)?.name || (typeof id === 'string' ? id.trim() : id))
      .filter(Boolean)
      .join('; ')

    return label ? <div className="card-category">({label})</div> : null
  }


  // Логирование поиска
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      if (searchTerm && searchTerm.trim().length > 0) {
        logSearch(searchTerm, user.email)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, user])
  
  const handleLogout = async () => {
    stopAudio()
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  const openAdminPanel = () => {
    const adminUrl = `${window.location.origin}${window.location.pathname}#/admin`
    window.open(adminUrl, '_blank', 'noopener,noreferrer')
  }

  const getAudioSrc = (fileName, userFolder) => {
    if (!fileName) return ''
    if (/^https?:\/\//i.test(fileName)) return fileName
    // Если имя файла содержит "/" — путь уже полный (старый формат)
    if (fileName.includes('/')) return `${import.meta.env.BASE_URL}audio/${fileName}`
    // Если передана папка пользователя — ищем в её подпапке
    if (userFolder) return `${import.meta.env.BASE_URL}audio/${userFolder}/${fileName}`
    return `${import.meta.env.BASE_URL}audio/${fileName}`
  }

  const stopAudio = () => {
    stopPlaylistRef.current = true
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setIsPlaying(false)
  }

  const playAudioFile = (fileName, userFolder) => {
    return new Promise((resolve) => {
      if (!fileName) {
        resolve()
        return
      }

      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }

      const audio = new Audio(getAudioSrc(fileName, userFolder))
      currentAudioRef.current = audio
      logAudioPlay(fileName, user?.email)

      const finish = () => {
        if (currentAudioRef.current === audio) currentAudioRef.current = null
        resolve()
      }

      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', finish, { once: true })
      audio.play().catch(finish)
    })
  }

  const handleSingleAudio = async (fileName) => {
    stopPlaylistRef.current = false
    setIsPlaying(true)
    const userFolder = user?.email ? emailToFolderName(user.email) : null
    await playAudioFile(fileName, userFolder)
    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  const handleListenAll = async () => {
    if (isPlaying) {
      stopAudio()
      return
    }

    const cards = playMode === 'random'
      ? [...filtered].sort(() => Math.random() - 0.5)
      : filtered
    const playlist = cards.flatMap(item => [item.audio, item.audio2].filter(Boolean))
    if (playlist.length === 0) return

    stopPlaylistRef.current = false
    setIsPlaying(true)

    const userFolder = user?.email ? emailToFolderName(user.email) : null
    for (const fileName of playlist) {
      if (stopPlaylistRef.current) break
      await playAudioFile(fileName, userFolder)
    }

    if (!stopPlaylistRef.current) setIsPlaying(false)
  }

  const headerRef = useRef(null)

  useEffect(() => {
    // prevent body scroll so only center results area scrolls
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight
      document.documentElement.style.setProperty('--app-viewport-height', `${viewportHeight}px`)
    }

    const updateHeaderHeight = () => {
      try {
        const h = headerRef.current?.offsetHeight || 110
        document.documentElement.style.setProperty('--app-header-height', `${h}px`)
      } catch (e) {
        document.documentElement.style.setProperty('--app-header-height', `110px`)
      }
    }

    updateViewportHeight()
    updateHeaderHeight()
    document.body.classList.add('app-no-scroll')
    window.addEventListener('resize', updateViewportHeight)
    window.addEventListener('resize', updateHeaderHeight)
    window.visualViewport?.addEventListener('resize', updateViewportHeight)
    window.visualViewport?.addEventListener('scroll', updateViewportHeight)

    // observe size changes to header to update height when content or layout changes
    let observer = null
    try {
      if (headerRef.current) {
        if (window.ResizeObserver) {
          observer = new ResizeObserver(() => updateHeaderHeight())
          observer.observe(headerRef.current)
        } else if (window.MutationObserver) {
          observer = new MutationObserver(() => updateHeaderHeight())
          observer.observe(headerRef.current, { childList: true, subtree: true, attributes: true })
        }
      }
    } catch (e) { /* ignore */ }

    // also respond to orientation changes and force a couple updates to catch late layout shifts
    const onOrientation = () => { updateHeaderHeight(); setTimeout(updateHeaderHeight, 200); setTimeout(updateHeaderHeight, 600) }
    window.addEventListener('orientationchange', onOrientation)

    // small deferred updates to handle font loading / dynamic wrapping
    const deferred1 = setTimeout(updateHeaderHeight, 100)
    const deferred2 = setTimeout(updateHeaderHeight, 500)

    // short polling for cases where browser switches rendering mode (e.g., 'request desktop site')
    const poll = setInterval(updateHeaderHeight, 200)
    const stopPoll = setTimeout(() => clearInterval(poll), 2000)

    // when page becomes visible again, recalc (covers tab switching or browser UI changes)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateHeaderHeight()
        setTimeout(updateHeaderHeight, 120)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.body.classList.remove('app-no-scroll')
      document.documentElement.style.removeProperty('--app-viewport-height')
      window.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('resize', updateHeaderHeight)
      window.removeEventListener('orientationchange', onOrientation)
      window.visualViewport?.removeEventListener('resize', updateViewportHeight)
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight)
      clearTimeout(deferred1)
      clearTimeout(deferred2)
      clearTimeout(stopPoll)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
      if (observer) observer.disconnect()
      stopAudio()
    }
  }, [])
  
  const hasSharedDictionaryAccess = Boolean(user?.paid)

  if (loading) return <div className="loading-full">Загрузка словаря...</div>
  
  const filtered = words
    .filter(w => {
      const term = searchTerm.toLowerCase()
      if (hasSharedDictionaryAccess && dictionarySourceFilter !== 'all') {
        const expectedSource = dictionarySourceFilter === 'shared' ? 'shared' : 'personal'
        if (w.__dictionarySource !== expectedSource) return false
      }
      const matchesText = [
        w.word,
        w.transcription,
        w.translation,
        w.example,
        w.example2,
        w.transcription2,
        w.audio,
        w.audio2,
      ].some(value => value?.toLowerCase().includes(term))

      if (!matchesText) return false

      // category filtering
      if (selectedFilters && selectedFilters.length > 0) {
        // normalize word categories to array of ids
        let wordCats = []
        if (Array.isArray(w.category)) wordCats = w.category
        else if (typeof w.category === 'string' && w.category.trim().length > 0) {
          // try to map legacy string to category id
          const matched = categories.find(c => c.name === w.category || c.name === w.category.trim())
          if (matched) wordCats = [matched.id]
        }

        // if no categories on word, exclude
        if (wordCats.length === 0) return false

        // keep if intersection
        const intersects = wordCats.some(id => selectedFilters.includes(id))
        return intersects
      }

      return true
    })
    .sort((a, b) => {
      const key = sortMode === 'runes' ? 'word' : 'translation'
      return (a[key] || '').localeCompare(b[key] || '', 'ru')
    })
        .filter(item => {
          if (!showOnlyFavorites) return true
        return favorites.has(String(item.id))
        })
  
      return (
    <div className="container">
      <div className="header" ref={headerRef}>
        <button
          className={`listen-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handleListenAll}
          disabled={!filtered.some(item => item.audio || item.audio2)}
        >
          {isPlaying ? 'Стоп' : 'Слушать'}
        </button>
        <div className="play-mode">
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="sequential"
              checked={playMode === 'sequential'}
              onChange={() => setPlayMode('sequential')}
            />
            Подряд
          </label>
          <label className="mode-label">
            <input
              type="radio"
              name="playMode"
              value="random"
              checked={playMode === 'random'}
              onChange={() => setPlayMode('random')}
            />
            Случайно
          </label>
        </div>
        <img src="/runy-dic/run_r.png" alt="Logo" className="logo" />
        <div className="filter-mode">
          <span className="filter-title">Сортировать:</span>
          <label className="mode-label">
            <input
              type="radio"
              name="sortMode"
              value="translation"
              checked={sortMode === 'translation'}
              onChange={() => setSortMode('translation')}
            />
            перевод
          </label>
          <label className="mode-label">
            <input
              type="radio"
              name="sortMode"
              value="runes"
              checked={sortMode === 'runes'}
              onChange={() => setSortMode('runes')}
            />
            руны
          </label>
        </div>
        {hasSharedDictionaryAccess && (
          <div className="dictionary-source-mode">
            <span className="filter-title">Словари:</span>
            <label className="mode-label">
              <input
                type="radio"
                name="dictionarySourceFilter"
                value="all"
                checked={dictionarySourceFilter === 'all'}
                onChange={() => setDictionarySourceFilter('all')}
              />
              все
            </label>
            <label className="mode-label">
              <input
                type="radio"
                name="dictionarySourceFilter"
                value="personal"
                checked={dictionarySourceFilter === 'personal'}
                onChange={() => setDictionarySourceFilter('personal')}
              />
              свой
            </label>
            <label className="mode-label">
              <input
                type="radio"
                name="dictionarySourceFilter"
                value="shared"
                checked={dictionarySourceFilter === 'shared'}
                onChange={() => setDictionarySourceFilter('shared')}
              />
              основной
            </label>
          </div>
        )}
        <div className="search-row">
          <button className="filter-btn" onClick={() => setShowFilterModal(true)}>
            <span className="filter-label">Фильтр</span>
            {selectedFilters.length > 0 && <span className="filter-badge" aria-hidden>{selectedFilters.length}</span>}
          </button>
          <div className="search-wrapper" style={{flex: 1}}>
            <input 
              type="text" 
              placeholder="Поиск по словарю..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="search-input" 
            />
            {searchTerm && (
              <button 
                className="search-clear-btn" 
                onClick={() => setSearchTerm('')}
                title="Очистить поиск"
              >
                ❌
              </button>
            )}
          </div>
        </div>
        <div className="header-actions">
          <div className="dictionary-stats" title="Количество карточек в словарях">
            <span>Личных: {dictionaryStats.personal}</span>
            <span>Всего: {dictionaryStats.total}</span>
          </div>
          <div className="favorites-block">
            <button className={`favorites-toggle ${showOnlyFavorites ? 'active' : ''}`} title={showOnlyFavorites ? 'Показывать все' : 'Показывать только избранное'} onClick={() => setShowOnlyFavorites(s => !s)}>
              {showOnlyFavorites ? '❤️' : '🤍'}
              <span className="fav-count">{favorites.size}</span>
            </button>
            <div className="fav-status" title={favoritesSyncStatus === 'error' ? 'Ошибка синхронизации. Нажмите, чтобы попытаться снова.' : favoritesSyncStatus === 'saving' ? 'Сохраняется...' : 'Синхронизировано'} onClick={async () => {
              if (!user || !user.email) return
              setFavoritesSyncStatus('saving')
              try {
                const now = new Date().toISOString()
                const ok = await updateFavoritesForUser(user.email, Array.from(favorites), now)
                setFavoritesSyncStatus(ok ? 'idle' : 'error')
              } catch (e) {
                console.error('Manual sync failed', e)
                setFavoritesSyncStatus('error')
              }
            }}>
              {favoritesSyncStatus === 'saving' ? '…' : favoritesSyncStatus === 'error' ? '⚠' : '✓'}
            </div>
          </div>
          <button className="header-admin-btn" type="button" onClick={() => { window.open(`${window.location.origin}${window.location.pathname}#/admin`, '_blank', 'noopener,noreferrer') }}>
            Админка
          </button>
          <button className="logout-btn-user" onClick={handleLogout}>
            👤 {user?.email?.split('@')[0]} <br/> <small>Выйти</small>
          </button>
        </div>
      </div>

      {showFilterModal && (
        <div className="modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Фильтр по категориям</h3>
            <div className="filter-list">
              {categories.length === 0 && <p>Категории не загружены</p>}
              {categories.map(cat => (
                <label key={cat.id} className="filter-item cat-item">
                  <input type="checkbox" checked={selectedFilters.includes(cat.id)} onChange={() => toggleFilter(cat.id)} />
                  <span className="checkbox-box" aria-hidden></span>
                  <span className="filter-name">{cat.name}</span>
                </label>
              ))}
            </div>
            <div className="filter-actions">
              <button className="apply-btn" onClick={applyFilters}>Применить</button>
              <button className="cancel-btn" onClick={() => { clearFilters(); applyFilters() }}>Сбросить</button>
              <button className="close-btn" onClick={() => setShowFilterModal(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      <div className="results" ref={resultsRef}>
        {filtered.length > 0 ? filtered.map(item => (
          <div key={item.id} className="card">
            <div className={`dictionary-source ${item.__dictionarySource === 'shared' ? 'shared' : 'personal'}`}>
              {getDictionarySourceLabel(item)}
            </div>
            {/* favorite button top-right */}
            <button className={`favorite-btn ${favorites.has(String(item.id)) ? 'active' : ''}`} onClick={() => toggleFavorite(item.id)} title={favorites.has(String(item.id)) ? 'Убрать из избранного' : 'Добавить в избранное'}>
              {favorites.has(String(item.id)) ? '❤️' : '🤍'}
            </button>
            {item.audio && (
              <button className="audio-btn" onClick={() => handleSingleAudio(item.audio)} title="Слушать слово">
                🔊
              </button>
            )}
            <div className="word-row">
              <h3 className="word">{item.word}</h3>
              {item.transcription && <span className="transcription">[{item.transcription}]</span>}
            </div>
            <p className="translation">{item.translation}</p>
            {renderCategory(item.category)}
            {(item.example || item.example2 || item.transcription2) && (
              <div className="examples">
                {item.example && <span className="example">{item.example}</span>}
                {item.example && item.example2 && <span className="dash"> — </span>}
                {item.example2 && <span className="example2">{item.example2}</span>}
                {item.transcription2 && <span className="transcription2">[{item.transcription2}]</span>}
              </div>
            )}
            {item.audio2 && (
              <button className="audio-btn-bottom" onClick={() => handleSingleAudio(item.audio2)} title="Слушать пример">
                🔊
              </button>
            )}

            {/* Кнопка "вверх" внутри карточки */}
            <button className="card-scroll-top-btn" onClick={scrollResultsToTop} title="Вверх">⬆</button>
          </div>
        )) : <p>Ничего не найдено</p>}
      </div>
    </div>
  )
}

// Главный App
const getSavedUser = () => {
  const adminUser = localStorage.getItem('adminUser')
  const currentUser = localStorage.getItem('currentUser')
  const isAdminRoute = window.location.hash.startsWith('#/admin')

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

function App() {
  const [user, setUser] = useState(getSavedUser)
  
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
  
  return (
    <Router>
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
    </Router>
  )
}

export default App
