// src/pages/Home.jsx
// Главный экран для ПОЛЬЗОВАТЕЛЕЙ
import { useState, useEffect, useMemo, useRef } from 'react'
import { logoutUser, getDictionary, logSearch, getCategories, getFavoritesForUser, updateFavoritesForUser, collectAudioUrls, collectImageUrls, getRunes, precacheUrls, emailToFolderName, getCachedCategories, getCachedRunes, cacheRunesForOffline } from '../githubApi'
import { useAudioPlayback } from '../hooks/useAudioPlayback'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import WordCard from '../components/WordCard'
import RuneCard from '../components/RuneCard'
import FilterModal from '../components/FilterModal'
import ThemeToggle from '../components/ThemeToggle'
import '../App.css'

export default function Home({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [runesSearchTerm, setRunesSearchTerm] = useState('')
  const [words, setWords] = useState<any[]>([])
  const [runes, setRunes] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const [reloadToken, setReloadToken] = useState(0)
  const [viewMode, setViewMode] = useState<'dictionary' | 'runes'>(() => {
    try {
      const saved = localStorage.getItem('home_view_mode')
      if (saved === 'runes' && user?.runesPaid) return 'runes'
    } catch { /* ignore */ }
    return 'dictionary'
  })
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    try {
      return localStorage.getItem('home_header_collapsed') === '1'
    } catch {
      return false
    }
  })

  // 🌐 Оффлайн-кэш личного словаря: сохраняем только личные слова пользователя,
  // чтобы при отсутствии интернета можно было пользоваться своим словарём.
  const offlineCacheKey = (email) => `offline_dict:${email}`
  const saveOfflineCache = (user, personalWords, cats) => {
    if (!user?.email) return
    try {
      localStorage.setItem(offlineCacheKey(user.email), JSON.stringify({
        words: personalWords,
        categories: Array.isArray(cats) ? cats : [],
        savedAt: Date.now(),
      }))
    } catch (e) {
      console.error('Не удалось сохранить оффлайн-кэш', e)
    }
  }
  const loadOfflineCache = (email) => {
    try {
      const raw = localStorage.getItem(offlineCacheKey(email))
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) {
      console.error('Не удалось прочитать оффлайн-кэш', e)
      return null
    }
  }

  // Отслеживаем статус интернет-соединения
  useEffect(() => {
    // При возврате сети синхронизируем избранное, изменённое оффлайн
    const resyncFavorites = async () => {
      if (!user?.email) return
      try {
        const raw = localStorage.getItem(`favorites:${user.email}`)
        if (!raw) return
        const localFavs = JSON.parse(raw)
        if (!Array.isArray(localFavs)) return
        const now = new Date().toISOString()
        const ok = await updateFavoritesForUser(user.email, localFavs, now)
        if (ok) {
          setFavorites(new Set(localFavs.map(String)))
          setFavoritesSyncStatus('idle')
          // после успешной синхронизации локальная копия больше не нужна
          localStorage.removeItem(`favorites:${user.email}`)
        }
      } catch (e) {
        console.error('Failed to resync favorites after reconnect:', e)
        setFavoritesSyncStatus('error')
      }
    }
    const handleOnline = () => {
      setIsOffline(false)
      setReloadToken(t => t + 1) // перезагружаем словарь при появлении сети
      resyncFavorites() // синхронизируем избранное, изменённое оффлайн
    }
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user])

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
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const runesSectionRef = useRef<HTMLDivElement | null>(null)

  // 💾 Сохраняем/восстанавливаем позицию прокрутки списков при обновлении страницы
  useScrollRestoration(resultsRef, 'scroll_home_results', [viewMode, words.length])
  useScrollRestoration(runesSectionRef, 'scroll_home_runes', [viewMode, runes.length])

  const scrollResultsToTop = () => {
    const el = resultsRef.current || (document.querySelector('.results') as HTMLElement | null)
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
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    const loadWords = async () => {
      const result = await getDictionary(user)
      const { data, ok } = result
      const sourceFallback = user.role === 'user' ? 'personal' : 'shared'
      // Сохраняем порядок карточек как в файле словаря (последовательность, заданная в админке)
      const words = [...(Array.isArray(data) ? data : [])]
        .map(item => ({ ...item, __dictionarySource: item.__dictionarySource || sourceFallback }))
      return { words, ok: ok !== false }
    }

    const loadCategories = async () => {
      const { data, ok } = await getCategories()
      return { categories: Array.isArray(data) ? data : [], ok: ok !== false }
    }

    // Руны — отдельный словарь, виден только оплатившим (runesPaid)
    const loadRunes = async () => {
      if (!user?.runesPaid) return { runes: [], ok: true }
      const { data, ok } = await getRunes()
      return { runes: Array.isArray(data) ? data : [], ok: ok !== false }
    }

    // Оффлайн: показать личный словарь из кэша (слова + категории + руны)
    const applyOfflineCache = () => {
      const cache = loadOfflineCache(user.email)
      if (cache && Array.isArray(cache.words) && cache.words.length > 0) {
        setWords(cache.words)
        setCategories(Array.isArray(cache.categories) ? cache.categories : [])
        setIsOffline(true)
        setLoadError(false)
        // Прогреваем аудио из кэша, чтобы оно играло оффлайн
        const userFolder = user?.email ? emailToFolderName(user.email) : null
        precacheUrls(collectAudioUrls(cache.words, (w) => w.__dictionarySource === 'personal' ? userFolder : null))
        // Руны из кэша
        const cachedRunes = getCachedRunes()
        if (Array.isArray(cachedRunes)) setRunes(cachedRunes)
      } else {
        setLoadError(true)
      }
    }

    Promise.all([loadWords(), loadCategories(), loadRunes()])
      .then(([wordRes, catRes, runeRes]) => {
        if (cancelled) return
        const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine
        const wordsOk = wordRes.ok
        const hasWords = wordRes.words.length > 0
        // getDictionary/getCategories не выбрасывают ошибку при слабом интернете —
        // возвращают пустые данные с ok:false. Если сеть отключена ИЛИ запрос не
        // удался (ok:false) и данных нет — показываем офлайн-кэш.
        if ((offlineNow || !wordsOk) && !hasWords) {
          applyOfflineCache()
          return
        }
        setWords(wordRes.words)
        // Категории: если сервер вернул пусто (слабый интернет) — берём из кэша
        if (catRes.ok || catRes.categories.length > 0) {
          setCategories(catRes.categories)
        } else {
          const cachedCats = getCachedCategories(user.email)
          setCategories(Array.isArray(cachedCats) ? cachedCats : [])
        }
        // Руны: если сервер вернул пусто — берём из кэша
        if (runeRes.ok || runeRes.runes.length > 0) {
          setRunes(runeRes.runes)
        } else {
          const cachedRunes = getCachedRunes()
          setRunes(Array.isArray(cachedRunes) ? cachedRunes : [])
        }
        setIsOffline(false)
        // Кэшируем только личные слова — их и показываем оффлайн
        const personalWords = wordRes.words.filter(w => w.__dictionarySource === 'personal')
        saveOfflineCache(user, personalWords, catRes.categories)
        // Кэшируем руны для офлайн-режима
        cacheRunesForOffline(runeRes.runes)
        // 🎵 Прогреваем аудио в кэше SW, чтобы оно играло оффлайн
        const userFolder = user?.email ? emailToFolderName(user.email) : null
        precacheUrls(collectAudioUrls(wordRes.words, (w) => w.__dictionarySource === 'personal' ? userFolder : null))
        // 🧿 Прогреваем картинки рун для оффлайн-режима
        if (runeRes.runes.length > 0) precacheUrls(collectImageUrls(runeRes.runes, ''))
      })
      .catch((err) => {
        console.error('Ошибка загрузки:', err)
        if (cancelled) return
        // Оффлайн/слабый интернет: пробуем кэш личного словаря
        applyOfflineCache()
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [user, reloadToken])

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

  // Статистика по категориям (для шапки/панели над результатами)
  const categoryCounts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const w of words) {
      let ids: string[] = []
      if (Array.isArray(w.category)) ids = w.category
      else if (typeof w.category === 'string' && w.category.trim().length > 0) {
        const m = categories.find((c: any) => c.name === w.category)
        if (m) ids = [m.id]
      }
      for (const id of ids) {
        const entry = map.get(id) || { id, name: categories.find((c: any) => c.id === id)?.name || String(id), count: 0 }
        entry.count += 1
        map.set(id, entry)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [words, categories])

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
        let wordCats: any[] = []
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

  // 🔎 Фильтрация рун по поисковому запросу (Новые Руны)
  const filteredRunes = useMemo(() => {
    const term = (runesSearchTerm || '').toLowerCase().trim()
    if (!term) return runes
    return runes.filter(r =>
      [r.name, r.power, r.keywords, r.description, r.letter, r.graphic]
        .some(v => v && String(v).toLowerCase().includes(term))
    )
  }, [runes, runesSearchTerm])

  const audio = useAudioPlayback({ user, words: filtered, playMode })

  const handleLogout = async () => {
    audio.stopAudio()
    await logoutUser(user?.email)
    localStorage.removeItem('currentUser')
    onLogout()
  }

  // Запрещаем прокрутку страницы — скроллится только список результатов.
  // Высота шапки больше не замеряется JS (никакого ResizeObserver/polling):
  // раскладка сделана флекс-колонкой на весь экран в App.css.
  useEffect(() => {
    document.body.classList.add('app-no-scroll')
    return () => {
      document.body.classList.remove('app-no-scroll')
      audio.stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="container">
        <div className="results" aria-busy="true" aria-label="Загрузка словаря">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div className="skeleton-card" key={i} aria-hidden="true">
              <div className="skeleton-line skeleton-short" />
              <div className="skeleton-line skeleton-medium" />
              <div className="skeleton-line skeleton-long" />
            </div>
          ))}
          <span className="visually-hidden">Загрузка словаря...</span>
        </div>
      </div>
    )
  }

  if (loadError && words.length === 0) {
    return (
      <div className="container">
        <div className="state-block error-state" role="alert">
          <div className="state-icon" aria-hidden="true">⚠️</div>
          <h2>Не удалось загрузить словарь</h2>
          <p>Проверьте подключение к интернету и попробуйте ещё раз.</p>
          <button className="state-retry-btn" onClick={() => setReloadToken(t => t + 1)}>
            Повторить загрузку
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {isOffline && (
        <div className="offline-banner" role="status">
          ⚠️ Нет интернета или слабое соединение — показан ваш личный словарь (офлайн-копия).
          Изменения сохранятся, когда появится соединение.
        </div>
      )}
      <div className={`header${headerCollapsed ? ' header-collapsed' : ''}`}>
        <button
          type="button"
          className="header-collapse-btn"
          onClick={() => setHeaderCollapsed(c => {
            const next = !c
            try {
              localStorage.setItem('home_header_collapsed', next ? '1' : '0')
            } catch { /* ignore */ }
            return next
          })}
          aria-expanded={!headerCollapsed}
          aria-label={headerCollapsed ? 'Развернуть шапку' : 'Свернуть шапку'}
          title={headerCollapsed ? 'Развернуть шапку' : 'Свернуть шапку'}
        >
          {headerCollapsed ? '▼' : '▲'}
        </button>
        {viewMode === 'dictionary' && (
          <>
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
          </>
        )}
        <img src={`${import.meta.env.BASE_URL}run_r.png`} alt="Логотип" className="logo" />
        {/* Переключатель режима: Словарь / Новые Руны */}
        {user?.runesPaid && (
          <div className="view-toggle" role="group" aria-label="Режим отображения">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'dictionary' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('dictionary')
                try { localStorage.setItem('home_view_mode', 'dictionary') } catch { /* ignore */ }
              }}
            >
              📚 Словарь
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'runes' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('runes')
                try { localStorage.setItem('home_view_mode', 'runes') } catch { /* ignore */ }
              }}
            >
              🧿 Новые Руны
            </button>
          </div>
        )}
        {viewMode === 'runes' && (
          <div className="search-row">
            <div className="search-wrapper" style={{flex: 1}}>
              <input
                type="text"
                placeholder="Поиск по рунам..."
                aria-label="Поиск по рунам"
                value={runesSearchTerm}
                onChange={(e) => setRunesSearchTerm(e.target.value)}
                className="search-input"
              />
              {runesSearchTerm && (
                <button
                  className="search-clear-btn"
                  onClick={() => setRunesSearchTerm('')}
                  aria-label="Очистить поиск"
                  title="Очистить поиск"
                >
                  ❌
                </button>
              )}
            </div>
          </div>
        )}
        {viewMode === 'dictionary' && (
          <>
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
                  aria-label="Поиск по словарю"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button
                    className="search-clear-btn"
                    onClick={() => setSearchTerm('')}
                    aria-label="Очистить поиск"
                    title="Очистить поиск"
                  >
                    ❌
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <div className="header-actions">
          {viewMode === 'dictionary' && (
            <>
              <div className="dictionary-stats" title="Количество карточек в словарях">
                <span>Личных: {dictionaryStats.personal}</span>
                <span>Всего: {dictionaryStats.total}</span>
              </div>
              <div className="favorites-block">
                <button
                  className={`favorites-toggle ${showOnlyFavorites ? 'active' : ''}`}
                  aria-label={showOnlyFavorites ? 'Показывать все карточки' : 'Показывать только избранное'}
                  aria-pressed={showOnlyFavorites}
                  title={showOnlyFavorites ? 'Показывать все' : 'Показывать только избранное'}
                  onClick={() => setShowOnlyFavorites(s => !s)}
                >
                  {showOnlyFavorites ? '❤️' : '🤍'}
                  <span className="fav-count">{favorites.size}</span>
                </button>
                <div
                  className="fav-status"
                  role="status"
                  aria-label={favoritesSyncStatus === 'error' ? 'Ошибка синхронизации избранного' : favoritesSyncStatus === 'saving' ? 'Сохранение избранного' : 'Избранное синхронизировано'}
                  title={favoritesSyncStatus === 'error' ? 'Ошибка синхронизации. Нажмите, чтобы попытаться снова.' : favoritesSyncStatus === 'saving' ? 'Сохраняется...' : 'Синхронизировано'}
                  onClick={async () => {
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
                  }}
                >
                  {favoritesSyncStatus === 'saving' ? '…' : favoritesSyncStatus === 'error' ? '⚠' : '✓'}
                </div>
              </div>
            </>
          )}
          <button className="header-admin-btn" type="button" onClick={() => { window.open(`${window.location.origin}${window.location.pathname}#/admin`, '_blank', 'noopener,noreferrer') }}>
            Админка
          </button>
          <ThemeToggle />
          <button className="logout-btn-user" onClick={handleLogout}>
            👤 {user?.email?.split('@')[0]} <br/> <small>Выйти</small>
          </button>
        </div>
      </div>

      {viewMode === 'dictionary' ? (
        <>
          <FilterModal
            open={showFilterModal}
            categories={categories}
            selectedFilters={selectedFilters}
            onToggleFilter={toggleFilter}
            onApply={applyFilters}
            onClose={() => setShowFilterModal(false)}
            onReset={() => { clearFilters(); applyFilters() }}
          />

          {categoryCounts.length > 0 && (
            <div className="category-stats" aria-label="Статистика по категориям">
              <span className="category-stats-title">Категории:</span>
              {categoryCounts.map(({ id, name, count }) => (
                <button
                  key={id}
                  type="button"
                  className={`category-stat-chip ${selectedFilters.includes(id) ? 'active' : ''}`}
                  aria-pressed={selectedFilters.includes(id)}
                  title={selectedFilters.includes(id) ? 'Снять фильтр по категории' : 'Показать только эту категорию'}
                  onClick={() => toggleFilter(id)}
                >
                  {name} <b>{count}</b>
                </button>
              ))}
            </div>
          )}

          <div className="results" ref={resultsRef}>
            {filtered.length > 0 ? filtered.map(item => (
              <WordCard
                key={item.id}
                item={item}
                categories={categories}
                searchTerm={searchTerm}
                isFavorite={favorites.has(String(item.id))}
                onToggleFavorite={() => toggleFavorite(item.id)}
                onPlayAudio={audio.handleSingleAudio}
                onScrollTop={scrollResultsToTop}
              />
            )) : (
              <div className="state-block empty-state">
                <div className="state-icon" aria-hidden="true">🔍</div>
                <h2>{words.length === 0 ? 'Словарь пуст' : 'Ничего не найдено'}</h2>
                <p>
                  {words.length === 0
                    ? 'В словаре пока нет карточек.'
                    : 'По вашему запросу ничего не найдено. Попробуйте изменить запрос или фильтры.'}
                </p>
                {(searchTerm || selectedFilters.length > 0 || showOnlyFavorites) && (
                  <button
                    className="state-reset-btn"
                    onClick={() => { setSearchTerm(''); clearFilters(); setShowOnlyFavorites(false) }}
                  >
                    Сбросить поиск и фильтры
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="runes-dictionary-section" ref={runesSectionRef}>
          {Array.isArray(runes) && runes.length > 0 ? (
            filteredRunes.length > 0 ? (
              <>
                <h2 className="runes-section-title">🧿 Новые Руны</h2>
                <div className="runes-list-cards">
                  {filteredRunes.map(r => (
                    <RuneCard key={r.id || r.name} rune={r} />
                  ))}
                </div>
              </>
            ) : (
              <div className="state-block empty-state">
                <div className="state-icon" aria-hidden="true">🔍</div>
                <h2>Ничего не найдено</h2>
                <p>По запросу «{runesSearchTerm}» руны не найдены.</p>
                <button className="state-reset-btn" onClick={() => setRunesSearchTerm('')}>
                  Сбросить поиск
                </button>
              </div>
            )
          ) : (
            <div className="state-block empty-state">
              <div className="state-icon" aria-hidden="true">🧿</div>
              <h2>Рун пока нет</h2>
              <p>Новые руны скоро появятся.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
