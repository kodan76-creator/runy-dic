// src/pages/Home.jsx
// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
import { useState, useEffect, useMemo, useRef } from 'react'
import { logoutUser, getDictionary, logSearch, getCategories, getFavoritesForUser, updateFavoritesForUser } from '../githubApi'
import { useAudioPlayback } from '../hooks/useAudioPlayback'
import WordCard from '../components/WordCard'
import FilterModal from '../components/FilterModal'
import '../App.css'

export default function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Настройки пользователя, сохраняемые в localStorage (по email, как и избранное)
  const DEFAULT_SETTINGS = {
    playMode: 'sequential',
    sortMode: 'order',
    dictionarySourceFilter: 'all',
    selectedFilters: [],
    showOnlyFavorites: false,
  }
  const loadSettings = () => {
    if (!user?.email) return { ...DEFAULT_SETTINGS }
    try {
      const raw = localStorage.getItem(`settings:${user.email}`)
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch (e) {
      console.error('Failed to load settings from localStorage', e)
    }
    return { ...DEFAULT_SETTINGS }
  }
  const savedSettings = loadSettings()

  const [playMode, setPlayMode] = useState(savedSettings.playMode)
  const [sortMode, setSortMode] = useState(savedSettings.sortMode)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState(savedSettings.selectedFilters) // array of category ids
  const [favorites, setFavorites] = useState(new Set())
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(savedSettings.showOnlyFavorites)
  const [dictionarySourceFilter, setDictionarySourceFilter] = useState(savedSettings.dictionarySourceFilter)
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

  // Сохраняем выбранные настройки (сортировка, режим воспроизведения, фильтры) в localStorage
  useEffect(() => {
    if (!user?.email) return
    try {
      localStorage.setItem(`settings:${user.email}`, JSON.stringify({
        playMode,
        sortMode,
        dictionarySourceFilter,
        selectedFilters,
        showOnlyFavorites,
      }))
    } catch (e) {
      console.error('Failed to save settings to localStorage', e)
    }
  }, [user, playMode, sortMode, dictionarySourceFilter, selectedFilters, showOnlyFavorites])

  useEffect(() => {
    if (!user) return
    const loadWords = async () => {
      try {
        const { data } = await getDictionary(user)
        const sourceFallback = user.role === 'user' ? 'personal' : 'shared'
        // Сохраняем порядок карточек как в файле словаря (последовательность, заданная в админке)
        const orderedData = [...(data || [])]
          .map(item => ({ ...item, __dictionarySource: item.__dictionarySource || sourceFallback }))
        setWords(orderedData)
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

  const hasSharedDictionaryAccess = Boolean(user?.paid)

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
      if (sortMode === 'order') return 0 // порядок админки (как в файле)
      const key = sortMode === 'runes' ? 'word' : 'translation'
      return (a[key] || '').localeCompare(b[key] || '', 'ru')
    })
    .filter(item => {
      if (!showOnlyFavorites) return true
      return favorites.has(String(item.id))
    })

  const audio = useAudioPlayback({ user, words: filtered, playMode })

  const handleLogout = async () => {
    audio.stopAudio()
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
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
      } catch {
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
    } catch { /* ignore */ }

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
      audio.stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div className="loading-full">Загрузка словаря...</div>

  return (
    <div className="container">
      <div className="header" ref={headerRef}>
        <button
          className={`listen-btn ${audio.isPlaying ? 'playing' : ''}`}
          onClick={audio.handleListenAll}
          disabled={!filtered.some(item => item.audio || item.audio2)}
        >
          {audio.isPlaying ? 'Стоп' : 'Слушать'}
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
              value="order"
              checked={sortMode === 'order'}
              onChange={() => setSortMode('order')}
            />
            порядок
          </label>
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

      <FilterModal
        open={showFilterModal}
        categories={categories}
        selectedFilters={selectedFilters}
        onToggleFilter={toggleFilter}
        onApply={applyFilters}
        onClose={() => setShowFilterModal(false)}
        onReset={() => { clearFilters(); applyFilters() }}
      />

      <div className="results" ref={resultsRef}>
        {filtered.length > 0 ? filtered.map(item => (
          <WordCard
            key={item.id}
            item={item}
            categories={categories}
            isFavorite={favorites.has(String(item.id))}
            onToggleFavorite={() => toggleFavorite(item.id)}
            onPlayAudio={audio.handleSingleAudio}
            onScrollTop={scrollResultsToTop}
          />
        )) : <p>Ничего не найдено</p>}
      </div>
    </div>
  )
}
