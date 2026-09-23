// src/components/RuneLayout.tsx
// Подраздел «Рунная раскладка» (в разделе «Новые Руны», для оплативших).
// Показывает фото пользователя во весь рост, обрезанное эллипсом-«яйцом»,
// с возможностью увеличивать/уменьшать фото, чтобы подогнать человека
// под внутренний размер эллипса. Если фото нет — диалог загрузки.
// Файл принимается двумя способами: через <input type="file"> и
// drag-and-drop — перетаскиванием из проводника на зону загрузки.
import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { validateImageFile, buildImageUrl, listRuneLayoutImages, selectRandomRunes, collectRuneLayoutImageUrls } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
import RuneCard from './RuneCard'
import {
  getPositionLabel,
  getLayoutName,
  PERSON_LINE_PLACEHOLDER,
  PERSON_LINE_MAX_LENGTH,
} from './runeLayoutTexts'
import type { Rune } from '../types'
import { getRunes } from '../api/runes'
import { getCachedRunes, cacheRunesForOffline } from '../api/offline'
import { saveRuneLayoutType } from '../api/auth'
import { precacheUrls } from '../api/audio'
import {
  cacheRuneLayoutImageList,
  getCachedRuneLayoutImageList,
  isRuneLayoutPrecached,
  markRuneLayoutPrecached,
} from '../api/offline'
import {
  cachePhotoBlob,
  getCachedPhotoBlob,
  processPhotoToEllipse,
  saveLayoutState,
  loadLayoutState,
  clearLayoutState,
} from '../api/photoCache'
import '../App.css'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

// 📏 Требования к фото во весь рост
const PHOTO_ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const PHOTO_MAX_SIZE = 10 * 1024 * 1024 // 10 МБ
const PHOTO_MIN_WIDTH = 400
const PHOTO_MIN_HEIGHT = 800
const PHOTO_MAX_WIDTH = 4000
const PHOTO_MAX_HEIGHT = 8000
const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp'
const PHOTO_REQUIREMENTS_TEXT = `PNG, JPG, JPEG, WEBP · от ${PHOTO_MIN_WIDTH}×${PHOTO_MIN_HEIGHT} до ${PHOTO_MAX_WIDTH}×${PHOTO_MAX_HEIGHT} px · до ${Math.round(PHOTO_MAX_SIZE / 1024 / 1024)} МБ`

// 🃏 Имя файла раскладки → карточка «Новых Рун» (раздел «Новые Руны»).
// Файлы вида «N_НАЗВАНИЕ.png» (прямое положение) и «N_НАЗВАНИЕ_П.png»
// (перевёрнутое положение, суффикс «_П»). Карточка ищется по имени руны:
// для «_П» — запись «НАЗВАНИЕ (перевернутое положение)» / «(перевёрнутое
// положение)» (в runes.json встречаются оба написания «е/ё»), иначе —
// запись с чистым именем. Сравнение — по нормализованной строке
// (регистр/ё/пробелы-дефисы), т.к. имена файлов и карточек могут
// расходиться в мелочах (например «ФАИС-СУ» в файле и карточке).
function normalizeRuneName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')

    .replace(/[_\s\-–—]+/g, ' ')
    .trim()
}

// Разбирает имя файла раскладки: «1_ФАИС-СУ.png» → { baseName: 'ФАИС-СУ', inverted: false },
// «2_ФАИС-СУ_П.png» → { baseName: 'ФАИС-СУ', inverted: true }.
function parseLayoutFileName(fileName) {
  const withoutExt = String(fileName ?? '').replace(/\.\w+$/, '')
  const withoutNum = withoutExt.replace(/^\d+_/, '')
  const inverted = /_П$/.test(withoutNum)
  const baseName = inverted ? withoutNum.replace(/_П$/, '') : withoutNum
  return { baseName, inverted }
}

// Находит карточку руны для файла раскладки среди карточек раздела «Новые Руны».
// Возвращает null, если карточки нет (модалка тогда покажет только картинку).
function findLayoutRune(fileName, runes) {
  const list = Array.isArray(runes) ? runes : []
  if (list.length === 0) return null
  const { baseName, inverted } = parseLayoutFileName(fileName)
  const base = normalizeRuneName(baseName)
  // 1) Точное совпадение по имени: прямое — «НАЗВАНИЕ», перевёрнутое —
  // «НАЗВАНИЕ (перевернутое положение)».
  const directHit = list.find((r) => normalizeRuneName(r?.name) === base) ?? null
  const invertedHit = list.find((r) => {
    const n = normalizeRuneName(r?.name)
    return n === `${base} (перевернутое положение)` || n === `${base} (перевернутое)` || n.startsWith(`${base} (`)
  }) ?? null
  if (inverted && invertedHit) return invertedHit
  if (!inverted && directHit) return directHit
  // 2) Запасной вариант: запись, чьё нормализованное имя содержит базу
  // (например файл «22_АЛЬ-ГО» ↔ карточка «АЛЬ-ГО»).
  return list.find((r) => {
    const n = normalizeRuneName(r?.name)
    return n === base || n.startsWith(`${base} `) || n.startsWith(`${base}(`)
  }) ?? (inverted ? invertedHit ?? directHit : directHit ?? invertedHit) ?? null
}

// 🎲 Резервный список файлов рун раскладки (если GitHub API недоступен)
const RUNES_LAYOUT_FALLBACK = [
  '1_ФАИС-СУ.png', '2_ФАИС-СУ_П.png', '3_ОРС.png', '4_ОРС_П.png',
  '5_ТУРЗ.png', '6_АЗ.png', '7_РАДО.png', '8_РАДО_П.png', '9_АЛУ.png',
  '10_ХЕБО.png', '11_ХЕБО_П.png', '12_ВИНЬО.png', '13_ВИНЬО_П.png',
  '14_ПУСТАЯ.png', '15_ТАК.png', '16_ТАК_П.png', '17_ЙЕХ.png', '18_ЙЕХ_П.png',
  '19_АЙЯ.png', '20_ЭЙСА.png', '21_ЫРД.png', '22_АЛЬ-ГО.png', '23_ЭЛЬ.png',
  '24_АМАЮН.png', '25_АМАЮН_П.png', '26_БЕРКУТ.png', '27_БЕРКУТ_П.png',
  '28_ВОЗ.png', '29_МЭТР.png', '30_МЭТР_П.png', '31_ЛАТХУ.png', '32_ЛАУКАР.png',
  '33_ША.png', '34_ША_П.png', '35_КИЙГ.png', '36_ЦЭРЭ.png', '37_ЦЭРЭ_П.png',
  '38_РУНА ТИШИНЫ.png',
]

// 🖨️ Данные для печати: та же картинка руны, что на плитке креста
// (buildImageUrl), карточка из раздела «Новые Руны» (findLayoutRune) и та же
// шапка позиции, что в модалке (getPositionLabel). На 1-й странице под
// названием раскладки печатается строка «Фамилия Имя Отчество, возраст».
function printLayout() {
  window.print()
}

export default function RuneLayout({ user, onUserUpdate }) {
  // 📖 Каталог «Новых Рун» (тексты карточек раздела) — для модалки по клику.
  // Сначала берём оффлайн-кэш (мгновенно и без сети), затем тихо обновляем
  // онлайн-версией с GitHub и освежаем кэш. Тот же источник данных, что и
  // карточки раздела «Новые руны», — тексты в модалке совпадают с ними.
  const [runesCatalog, setRunesCatalog] = useState<Rune[]>(() => getCachedRunes() || [])
  useEffect(() => {
    let cancelled = false
    getRunes()
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data) || data.length === 0) return
        setRunesCatalog(data)
        cacheRunesForOffline(data)
      })
      .catch(() => { /* оффлайн: остаёмся на кэше */ })
    return () => { cancelled = true }
  }, [])
  // 🔎 Выбранная руна креста (модальное окно с карточкой из раздела «Новые руны»)
  const [selectedRuneIndex, setSelectedRuneIndex] = useState<number | null>(null)
  // 📱 Мобильная версия: модалка руны не ниже эллипса. Высоту эллипса замеряем
  // при открытии модалки (и на resize, пока она открыта) и отдаём в CSS через
  // переменную --rune-modal-min-h: media-запрос применяет её только на мобильных.
  const [runeModalMinH, setRuneModalMinH] = useState(0)
  useEffect(() => {
    if (selectedRuneIndex === null) return
    const measure = () => setRuneModalMinH(ellipseRef.current?.clientHeight ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [selectedRuneIndex])
  // 💾 Восстановление pan/zoom из localStorage (кэширование состояния)
  const savedState = user?.email ? loadLayoutState(user.email) : null
  const [zoom, setZoom] = useState(savedState?.zoom ?? 1)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // 📂 Файл перетаскивается из проводника — подсветка зоны дропа
  const [dndOver, setDndOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 🖐️ Drag-to-pan state (восстанавливаем из кэша)
  const [panX, setPanX] = useState(savedState?.panX ?? 0)
  const [panY, setPanY] = useState(savedState?.panY ?? 0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0 })
  const ellipseRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  // ⚪ Белый фон вместо фото: раскладку можно делать без загруженного фото.
  // Выбор сохраняется в localStorage (по email) и переживает перезагрузку.
  const whiteBgKey = user?.email ? 'rune_layout_white_bg:' + user.email : null
  const [whiteBackground, setWhiteBackground] = useState(() => {
    try {
      if (!user?.email) return false
      return localStorage.getItem('rune_layout_white_bg:' + user.email) === '1'
    } catch { return false }
  })
  // Если user подставился позже первого рендера — подтягиваем сохранённый выбор
  useEffect(() => {
    if (!whiteBgKey) return
    try {
      setWhiteBackground(localStorage.getItem(whiteBgKey) === '1')
    } catch { /* ignore */ }
  }, [whiteBgKey])
  const toggleWhiteBackground = () => {
    const next = !whiteBackground
    setWhiteBackground(next)
    try {
      if (whiteBgKey) {
        if (next) localStorage.setItem(whiteBgKey, '1')
        else localStorage.removeItem(whiteBgKey)
      }
    } catch { /* ignore */ }
  }
  // 🔘 Кнопка-переключатель «Фото / Белый фон» (одна и та же во всех панелях)
  const whiteBgToggle = (
    <button
      type="button"
      className={`rune-layout-bg-toggle${whiteBackground ? ' active' : ''}`}
      onClick={toggleWhiteBackground}
      aria-pressed={whiteBackground}
      title={whiteBackground ? 'Вернуться к фото (если оно загружено)' : 'Сделать раскладку на белом фоне, без фото'}
    >
      ⚪ Белый фон
    </button>
  )
  // 🧾 Строка «Фамилия Имя Отчество, возраст»: показывается под названием
  // выбранной раскладки на странице с крестом и печатается на 1-й странице.
  // Как и фото, строка хранится только локально (localStorage по email) и на
  // сервер не отправляется. Пустая строка ничего не добавляет в раскладку.
  const personKey = user?.email ? 'rune_layout_person:' + user.email : null
  const [personLine, setPersonLine] = useState(() => {
    try {
      if (!user?.email) return ''
      return localStorage.getItem('rune_layout_person:' + user.email) ?? ''
    } catch { return '' }
  })
  // Если user подставился позже первого рендера — подтягиваем сохранённую строку
  useEffect(() => {
    if (!personKey) return
    try {
      setPersonLine(localStorage.getItem(personKey) ?? '')
    } catch { /* ignore */ }
  }, [personKey])
  const handlePersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPersonLine(value)
    try {
      if (!personKey) return
      // Пустая/пробельная строка — как отсутствие данных: чистим запись
      if (value.trim()) localStorage.setItem(personKey, value)
      else localStorage.removeItem(personKey)
    } catch { /* ignore */ }
  }
  // Данные строки для показа под названием раскладки (пробелы по краям не нужны)
  const personLineText = personLine.trim()
  // 🔧 Apply (фиксация фото)
  const [applying, setApplying] = useState(false)
  // 🎲 Раскладка Новых Рун: выбранные 7 рун вокруг эллипса.
  // 💾 Страница с крестом переживает перезагрузку: выбранный тип раскладки и
  // сами 7 рун храним в localStorage (по email). Руны кешируем вместе с типом —
  // иначе после обновления получили бы те же места, но другие картинки.
  const savedSpread = (() => {
    try {
      if (!user?.email) return null
      const raw = localStorage.getItem('rune_spread:' + user.email)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed?.type !== 'evaluation' && parsed?.type !== 'healing') return null
      if (!Array.isArray(parsed?.runes) || parsed.runes.length !== 7) return null
      if (!parsed.runes.every((name) => typeof name === 'string' && name.length > 0)) return null
      return { type: parsed.type, runes: parsed.runes }
    } catch { return null }
  })()
  const [spreadRunes, setSpreadRunes] = useState(() => savedSpread?.runes ?? [])
  const [spreadLoading, setSpreadLoading] = useState(false)
  // 🎛️ Выбор раскладки: после фиксации фото показываем 2 кнопки
  // (оценка / исцеление). После выбора — крест с рунами + кнопка возврата.
  // Начальное значение — из localStorage, чтобы страница с крестом переживала F5.
  const [selectedLayoutChoice, setSelectedLayoutChoice] = useState(() => savedSpread?.type ?? '')
  const [showLayoutChoice, setShowLayoutChoice] = useState(false)
  // Ключ localStorage для запомненной страницы с крестом (по email).
  const spreadKey = user?.email ? 'rune_spread:' + user.email : null
  const persistSpread = (type, runes) => {
    try {
      if (!spreadKey) return
      localStorage.setItem(spreadKey, JSON.stringify({ type, runes }))
    } catch { /* ignore */ }
  }
  const clearPersistedSpread = () => {
    try {
      if (!spreadKey) return
      localStorage.removeItem(spreadKey)
    } catch { /* ignore */ }
  }
  // Если user подставился позже первого рендера — подтягиваем сохранённый крест.
  useEffect(() => {
    if (!user?.email) return
    if (spreadRunes.length > 0 || selectedLayoutChoice) return
    try {
      const raw = localStorage.getItem('rune_spread:' + user.email)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.type !== 'evaluation' && parsed?.type !== 'healing') return
      if (!Array.isArray(parsed?.runes) || parsed.runes.length !== 7) return
      setSpreadRunes(parsed.runes)
      setSelectedLayoutChoice(parsed.type)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])
  // Локальный blob-URL обработанного фото — показываем сразу после
  // «Зафиксировать», чтобы фото не исчезало, пока серверный файл не готов.
  const [localPhotoUrl, setLocalPhotoUrl] = useState('')
  const localPhotoUrlRef = useRef('')
  // Проверяем, есть ли в IndexedDB кэш для текущего фото, и восстанавливаем blob URL
  useEffect(() => {
    if (!user?.email) return
    getCachedPhotoBlob(user.email).then(blob => {
      if (blob) {
        if (localPhotoUrlRef.current) URL.revokeObjectURL(localPhotoUrlRef.current)
        const url = URL.createObjectURL(blob)
        localPhotoUrlRef.current = url
        setLocalPhotoUrl(url)
      }
    }).catch(() => {})
  }, [user?.email])

  // 🖼️ Фото хранится только локально (IndexedDB + blob-URL) и НИКОГДА
  // не отправляется на сервер: оно нужно лишь этому устройству для раскладки.
  const photoUrl = localPhotoUrl
  // 🧹 Освобождаем blob-URL при размонтировании
  useEffect(() => () => {
    if (localPhotoUrlRef.current) URL.revokeObjectURL(localPhotoUrlRef.current)
  }, [])

  // 💾 Автосохранение pan/zoom при каждом изменении
  useEffect(() => {
    if (!user?.email) return
    saveLayoutState(user.email, { panX, panY, zoom })
  }, [panX, panY, zoom, user?.email])

  // 📂 Единая загрузка фото: и из <input type="file">, и drag-and-drop из
  // проводника идут одним и тем же путём — валидация, blob-URL, кэш IndexedDB.
  const processPhotoFile = async (file) => {
    if (!file || !user?.email) return
    setUploading(true)
    setUploadError('')
    try {
      // 📏 Проверяем файл локально (расширение, объём, размеры) — без загрузки на сервер
      await validateImageFile(file, {
        allowedExtensions: PHOTO_ALLOWED_EXTENSIONS,
        maxSize: PHOTO_MAX_SIZE,
        minWidth: PHOTO_MIN_WIDTH,
        minHeight: PHOTO_MIN_HEIGHT,
        maxWidth: PHOTO_MAX_WIDTH,
        maxHeight: PHOTO_MAX_HEIGHT,
      })
      setZoom(1)
      setPanX(0)
      setPanY(0)
      if (user?.email) clearLayoutState(user.email)
      // Новое фото выбрано — выключаем белый фон, чтобы фото было видно сразу
      if (whiteBackground) {
        setWhiteBackground(false)
        try { if (whiteBgKey) localStorage.removeItem(whiteBgKey) } catch { /* ignore */ }
      }
      // Сбрасываем blob-URL при загрузке нового файла
      if (localPhotoUrlRef.current) {
        URL.revokeObjectURL(localPhotoUrlRef.current)
        localPhotoUrlRef.current = ''
        setLocalPhotoUrl('')
      }
      // 🖼️ Фото хранится только локально: показываем через blob-URL и кэшируем
      if (user?.email) {
        const newLocalUrl = URL.createObjectURL(file)
        localPhotoUrlRef.current = newLocalUrl
        setLocalPhotoUrl(newLocalUrl)
        // Кэшируем, чтобы фото пережило перезагрузку страницы (best-effort)
        try {
          await cachePhotoBlob(user.email, file)
        } catch (e) {
          console.warn('Failed to cache photo blob:', e)
        }
      }
      setShowUpload(false)
    } catch (err) {
      setUploadError(err?.message || 'Ошибка загрузки фото')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileSelected = (e) => processPhotoFile(e.target.files?.[0])

  // 🖱️📂 Drag-and-drop: файл перетаскивается из проводника прямо на раскладку.
  // Обработчики висят на корне .rune-layout — работают на пустом экране, на
  // сцене с фото и под модалкой (drop всплывает от детей к корню).
  // Drop разрешён, пока раскладка не выбрана (пусто / редактирование / выбор
  // раскладки) и в открытой модалке загрузки — после сбора креста замена фото
  // идёт только через «Заменить фото», чтобы дропом не затереть раскладку.
  const canDropPhoto = () => showUpload || !selectedLayoutChoice

  const dndHasFiles = (e: React.DragEvent) => {
    const dt = e.dataTransfer
    if (!dt) return false
    if (dt.files && dt.files.length > 0) return true
    return Array.from(dt.types || []).includes('Files')
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!dndHasFiles(e)) return
    // Без preventDefault браузер откроет файл сам — drop не сработает
    e.preventDefault()
    if (!uploading && canDropPhoto()) setDndOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Уход курсора на дочерний элемент — не выход из зоны дропа
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return
    setDndOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDndOver(false)
    if (uploading || !canDropPhoto()) return
    const file = e.dataTransfer?.files?.[0]
    if (file) processPhotoFile(file)
  }

  const changeZoom = (delta) => {
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)))
  }

  // 🔧 Зафиксировать позицию фото: обрезать по эллипсу + минимизация JPEG
  // Фото хранится только локально (blob-URL + кэш IndexedDB), на сервер не отправляется.
  // НЕ сбрасываем zoom/pan и НЕ вызываем onUserUpdate — фото остаётся видимым.
  // Также НЕ делаем setPhotoTs(Date.now()) — иначе src меняется и фото
  // перезагружается (мигает/пропадает). Blob URL уже показывает результат.
  const handleApplyPhoto = async () => {
    if (!user?.email || !imgRef.current || !ellipseRef.current) return
    setApplying(true)
    setUploadError('')
    let blob: Blob | null = null
    try {
      const ew = ellipseRef.current.clientWidth
      const eh = ellipseRef.current.clientHeight
      blob = await processPhotoToEllipse(imgRef.current, panX, panY, zoom, ew, eh)
      // 🖼️ Показываем обработанное фото сразу (blob-URL), чтобы оно не исчезало
      if (localPhotoUrlRef.current) URL.revokeObjectURL(localPhotoUrlRef.current)
      const newLocalUrl = URL.createObjectURL(blob)
      localPhotoUrlRef.current = newLocalUrl
      setLocalPhotoUrl(newLocalUrl)
      // Сбрасываем трансформацию — зафиксированное фото уже обрезано
      setZoom(1)
      setPanX(0)
      setPanY(0)
      clearLayoutState(user.email)
      // После фиксации фото — показываем выбор раскладки (2 кнопки)
      setShowLayoutChoice(true)
      setSelectedLayoutChoice('')
      setSpreadRunes([])
      // 🖼️ Фото хранится только локально — кэшируем обработанное фото,
      // чтобы оно пережило перезагрузку страницы и переключение подразделов
      await cachePhotoBlob(user.email, blob)
    } catch (err) {
      // При ошибке обработки возвращаем кэшированное/серверное фото
      if (localPhotoUrlRef.current) {
        URL.revokeObjectURL(localPhotoUrlRef.current)
        localPhotoUrlRef.current = ''
        setLocalPhotoUrl('')
      }
      // Если есть кэш — показываем его, чтобы фото не пропало
      if (user?.email) {
        getCachedPhotoBlob(user.email).then(cached => {
          if (cached && !localPhotoUrlRef.current) {
            const url = URL.createObjectURL(cached)
            localPhotoUrlRef.current = url
            setLocalPhotoUrl(url)
          }
        }).catch(() => {})
      }
      setUploadError(err?.message || 'Ошибка обработки фото')
    } finally {
      setApplying(false)
    }
  }

  // ⚪ Зафиксировать белый фон: без фото — просто переходим к выбору раскладки.
  // Картинка с белым эллипсом в кэш не пишется: белый фон — это отсутствие фото,
  // он и так восстанавливается из localStorage при перезагрузке.
  const handleApplyWhitePhoto = async () => {
    if (!user?.email) return
    setApplying(true)
    setUploadError('')
    try {
      setShowLayoutChoice(true)
      setSelectedLayoutChoice('')
      setSpreadRunes([])
    } finally {
      setApplying(false)
    }
  }

  // 🧿 Прогрев картинок раскладки в кэш Service Worker.
  // Выбранные руны кэшируем всегда (их показываем прямо сейчас), а весь набор
  // из папки runy — один раз, чтобы оффлайн-выбор любых рун тоже отображался.
  const precacheLayoutImages = (names: string[]) => {
    // 🌐 Оффлайн прогрев бессмысленен (скачать картинки нельзя), а ставить
    // флаг «прогрето» нельзя — иначе полный набор не догреется даже при
    // появлении сети и картинки рун навсегда пропадали бы в оффлайн.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    precacheUrls(collectRuneLayoutImageUrls(names))
    if (isRuneLayoutPrecached()) return
    // Отмечаем прогрев только если SW реально принял список (иначе повторим позже)
    if (precacheUrls(collectRuneLayoutImageUrls(RUNES_LAYOUT_FALLBACK))) {
      markRuneLayoutPrecached()
    }
  }

  // 🔁 Догреваем полный набор картинок рун, когда SW-контроллер появился
  // (первый визит / обновление SW: при загрузке страницы controller ещё был
  // null, и прогрев не срабатывал — без этого картинки пропадали в оффлайн).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    let cancelled = false
    navigator.serviceWorker.ready.then(() => {
      if (cancelled) return
      setTimeout(() => { if (!cancelled) precacheLayoutImages(RUNES_LAYOUT_FALLBACK) }, 1000)
    }).catch(() => { /* нет SW — оффлайн-прогрев недоступен */ })
    return () => { cancelled = true }
  }, [])

  // 🎲 Раскладка Новых Рун: случайный выбор 7 рун из папки runy
  // layoutType передаём параметром: setState асинхронен, и чтение
  // selectedLayoutChoice сразу после setSelectedLayoutChoice дало бы старое значение.
  const handleSpread = async (layoutType = selectedLayoutChoice) => {
    setSpreadLoading(true)
    try {
      let files = await listRuneLayoutImages()
      // Оставляем только файлы с порядковым номером до «_»
      files = files.filter(f => /^\d+_/.test(f))
      if (files.length > 0) {
        // Список доступен — кэшируем его, чтобы оффлайн выбирать руны
        // из реального набора, а не только из резервного списка в коде
        cacheRuneLayoutImageList(files)
      } else {
        // Нет сети/GitHub API — берём список из кэша, иначе резервный
        files = getCachedRuneLayoutImageList() || [...RUNES_LAYOUT_FALLBACK]
      }
      const chosen = selectRandomRunes(files, 7)
      setSpreadRunes(chosen)
      persistSpread(layoutType, chosen)
      precacheLayoutImages(chosen)
    } catch (e) {
      console.warn('handleSpread error:', e)
      const chosen = selectRandomRunes(RUNES_LAYOUT_FALLBACK, 7)
      setSpreadRunes(chosen)
      persistSpread(layoutType, chosen)
      precacheLayoutImages(chosen)
    } finally {
      setSpreadLoading(false)
    }
  }

  // 🎛️ Выбор типа раскладки (оценка / исцеление): генерируем руны и сохраняем тип
  const handleChooseLayout = async (type) => {
    setSelectedLayoutChoice(type)
    setShowLayoutChoice(false)
    await handleSpread(type)
    // 🌐 Оффлайн записывать в users.json нельзя: сервер недоступен, а попытка
    // выдаёт бессмысленную «Пользователь не найден» (users.json отдаётся пустым).
    // Тип сохранится на сервере при следующем онлайн-выборе раскладки.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    try {
      const updated = await saveRuneLayoutType(user.email, type)
      onUserUpdate(updated)
    } catch (err) {
      setUploadError(err?.message || 'Ошибка сохранения типа раскладки')
    }
  }

  // ↩️ Вернуться к выбору раскладки (2 кнопки)
  // Запомненный крест тоже стираем — страница выбора после F5 покажет выбор, а не крест.
  const handleReturnToChoice = () => {
    setSelectedLayoutChoice('')
    setShowLayoutChoice(true)
    setSpreadRunes([])
    clearPersistedSpread()
  }

  // 📷 Вернуться к выбору фото (режим редактирования: масштаб/замена/фиксация)
  const handleReturnToPhoto = () => {
    setShowLayoutChoice(false)
    setSelectedLayoutChoice('')
    setSpreadRunes([])
    clearPersistedSpread()
    setZoom(1)
    setPanX(0)
    setPanY(0)
    clearLayoutState(user.email)
  }

  // 🖐️ Drag-to-pan handlers (mouse + touch)
  // Фото заполняет эллипс через object-fit: cover, а transform применяется
  // к самому элементу (бокс = размер эллипса). Поэтому предел сдвига зависит
  // только от размера эллипса и зума: (размер * (zoom - 1)) / 2.
  const clampPan = useCallback((px: number, py: number, s: number) => {
    if (!ellipseRef.current) return { x: px, y: py }
    const ew = ellipseRef.current.clientWidth
    const eh = ellipseRef.current.clientHeight
    const maxPanX = Math.max(0, (ew * (s - 1)) / 2)
    const maxPanY = Math.max(0, (eh * (s - 1)) / 2)
    return {
      x: Math.round(Math.max(-maxPanX, Math.min(maxPanX, px)) * 10) / 10,
      y: Math.round(Math.max(-maxPanY, Math.min(maxPanY, py)) * 10) / 10,
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button && e.button !== 0) return
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY }
    setDragging(true)
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch { /* pointer may already be gone (e.g. synthetic events) */ }
  }, [panX, panY])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return
    e.preventDefault()
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const clamped = clampPan(
      dragRef.current.origPanX + dx,
      dragRef.current.origPanY + dy,
      zoom
    )
    setPanX(clamped.x)
    setPanY(clamped.y)
  }, [zoom, clampPan])

  const handlePointerUp = useCallback(() => {
    dragRef.current.dragging = false
    setDragging(false)
  }, [])

  // 🧾 Поле ввода строки доступно только на странице фото — там же, где кнопка
  // «Зафиксировать» (фото/белый фон уже выбран, но раскладка ещё не зафиксирована).
  // На остальных страницах строка показывается простым текстом, а на странице с
  // крестом — под названием раскладки, чтобы поле не «висело» над готовой
  // раскладкой и не мешало печати.
  const personEditable =
    (Boolean(photoUrl) || whiteBackground) && !showLayoutChoice && !selectedLayoutChoice

  return (
    <div
      className={`rune-layout${dndOver ? ' dnd-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 🧾 Строка «Фамилия Имя Отчество, возраст»: вводить можно только на
          странице фото (там же, где «Зафиксировать»). Дальше — только текст:
          на странице выбора раскладки сверху, на странице с крестом — под
          названием выбранной раскладки (сверху не дублируем). На 1-ю печатную
          страницу строка попадает под названием раскладки. */}
      {personEditable ? (
        <div className="rune-layout-person">
          <input
            type="text"
            className="rune-layout-person-input"
            placeholder={PERSON_LINE_PLACEHOLDER}
            aria-label={PERSON_LINE_PLACEHOLDER}
            maxLength={PERSON_LINE_MAX_LENGTH}
            value={personLine}
            onChange={handlePersonChange}
          />
        </div>
      ) : (
        !selectedLayoutChoice && personLineText && (
          <p className="rune-layout-person-text">{personLineText}</p>
        )
      )}

      {/* 📛 Название выбранной раскладки: показываем на странице с эллипсом и крестом */}
      {selectedLayoutChoice && (
        <>
          <p className="rune-layout-active-name">{getLayoutName(selectedLayoutChoice)}</p>
          {personLineText && <p className="rune-layout-person-value">{personLineText}</p>}
        </>
      )}

      {photoUrl || whiteBackground ? (
        <>
          <div className="rune-layout-stage">
            <div className={`rune-layout-ellipse${whiteBackground ? ' white-bg' : ''}`} ref={ellipseRef}>
              {photoUrl && !whiteBackground && (
                <img
                  ref={imgRef}
                  className={`rune-layout-photo${dragging ? ' dragging' : ''}${!showLayoutChoice && !selectedLayoutChoice ? ' editable' : ''}`}
                  src={photoUrl}
                  alt="Ваше фото во весь рост"
                  style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
                  draggable={false}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              )}
              {spreadRunes.length > 0 && (
                <div
                  className={`rune-layout-spread${selectedLayoutChoice === 'healing' ? ' healing' : ''}`}
                  aria-label="Раскладка Новых Рун"
                >
                  {spreadRunes.map((name, i) => {
                    const rune = findLayoutRune(name, runesCatalog)
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`rune-layout-spread-item pos-${i + 1}`}
                        onClick={() => setSelectedRuneIndex(i)}
                        aria-label={rune?.name ? `Руна ${i + 1}: ${rune.name}` : `Руна ${i + 1}`}
                        title={rune?.name ? `Руна ${i + 1}: ${rune.name}` : `Руна ${i + 1}`}
                      >
                        <img
                          src={buildImageUrl(name, `${RUNES_IMAGE_DIR}/runy`)}
                          alt={rune?.name ? `Руна ${i + 1}: ${rune.name}` : `Руна ${i + 1}`}
                          draggable={false}
                        />
                        <span className="rune-layout-spread-num" aria-hidden="true">{i + 1}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          {showLayoutChoice && !selectedLayoutChoice ? (
            <div className="rune-layout-choice-panel">
              <button
                type="button"
                className="rune-layout-choice-btn"
                onClick={() => handleChooseLayout('evaluation')}
              >
                Раскладка Новых Рун для оценки Пути Духовного развития или ситуации явления
              </button>
              <button
                type="button"
                className="rune-layout-choice-btn"
                onClick={() => handleChooseLayout('healing')}
              >
                Раскладка Новых Рун для исцеления
              </button>
              <button
                type="button"
                className="rune-layout-return-btn"
                onClick={handleReturnToPhoto}
                title="Вернуться к выбору фото"
              >
                Вернуться к выбору фото
              </button>
            </div>
          ) : selectedLayoutChoice ? (
            <div className="rune-layout-controls rune-layout-controls-row">
              <button
                type="button"
                className="rune-layout-return-btn"
                onClick={handleReturnToChoice}
                title="Вернуться к выбору раскладок"
              >
                Вернуться к выбору раскладок
              </button>
              <button
                type="button"
                className="rune-layout-print-btn"
                onClick={printLayout}
                disabled={spreadRunes.length !== 7}
                title="Распечатать раскладку на листах А4: эллипс с крестом и описания рун"
              >
                🖨️ Печать
              </button>
              {spreadLoading && (
                <span className="rune-layout-spread-loading">⏳ Выбор рун…</span>
              )}
            </div>
          ) : (
            <div className="rune-layout-controls">
              {whiteBackground ? (
                <>
                  <button type="button" className="rune-layout-replace-btn" onClick={() => setShowUpload(true)}>
                    Заменить фото
                  </button>
                  {whiteBgToggle}
                  <button
                    type="button"
                    className="rune-layout-apply-btn"
                    onClick={handleApplyWhitePhoto}
                    disabled={applying}
                    title="Подтвердить белый фон и перейти к выбору раскладки"
                  >
                    {applying ? '⏳ Обработка…' : '✓ Зафиксировать'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="rune-layout-zoom-btn"
                    onClick={() => changeZoom(-ZOOM_STEP)}
                    disabled={zoom <= MIN_ZOOM}
                    aria-label="Уменьшить фото"
                    title="Уменьшить фото"
                  >
                    −
                  </button>
                  <span className="rune-layout-zoom-value">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="rune-layout-zoom-btn"
                    onClick={() => changeZoom(ZOOM_STEP)}
                    disabled={zoom >= MAX_ZOOM}
                    aria-label="Увеличить фото"
                    title="Увеличить фото"
                  >
                    +
                  </button>
                  <button type="button" className="rune-layout-replace-btn" onClick={() => setShowUpload(true)}>
                    Заменить фото
                  </button>
                  {whiteBgToggle}
                  <button
                    type="button"
                    className="rune-layout-apply-btn"
                    onClick={handleApplyPhoto}
                    disabled={applying}
                    title="Зафиксировать текущую позицию и размер фото"
                  >
                    {applying ? '⏳ Обработка…' : '✓ Зафиксировать'}
                  </button>
                </>
              )}
            </div>
          )}
          {uploadError && <p className="rune-layout-error" role="alert">{uploadError}</p>}
        </>
      ) : (
        <div className="rune-layout-empty">
          <div className="state-icon" aria-hidden="true">📷</div>
          <h3>Загрузите фото во весь рост</h3>
          <p>
            Фото будет показано в эллипсе «Рунной раскладки». Человек должен быть виден целиком,
            по центру кадра.
          </p>
          <p className="rune-layout-dnd-hint">
            📂 Или просто перетащите файл фото из проводника прямо на эту страницу
          </p>
          <button type="button" className="rune-layout-upload-btn" onClick={() => setShowUpload(true)}>
            Загрузить фото
          </button>
          {whiteBgToggle}
          {uploadError && <p className="rune-layout-error" role="alert">{uploadError}</p>}
        </div>
      )}

      {showUpload && (
        <div
          className="modal-backdrop"
          onClick={() => { if (!uploading) setShowUpload(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Загрузка фото во весь рост"
        >
          <div className="filter-modal rune-layout-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Загрузка фото во весь рост</h3>
            <p className="rune-layout-modal-hint">
              Выберите фотографию, где человек виден во весь рост. Фото будет обрезано эллипсом.
            </p>
            <p className="rune-layout-dnd-hint">
              📂 Или перетащите файл из проводника прямо в это окно
            </p>
            <p className="rune-layout-modal-req">Требования: {PHOTO_REQUIREMENTS_TEXT}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={handleFileSelected}
              disabled={uploading}
              className="visually-hidden"
            />
            {uploadError && <p className="rune-layout-error" role="alert">{uploadError}</p>}
            <div className="filter-actions">
              <button
                className="apply-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Загрузка…' : 'Выбрать файл'}
              </button>
              <button className="close-btn" onClick={() => setShowUpload(false)} disabled={uploading}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🖨️ Печатная версия раскладки — порталом в body, чтобы на неё не влияли
          overflow/clip предков и её можно было изолировать в @media print.
          Видна только при печати: 1-я страница — название раскладки, строка
          «Фамилия Имя Отчество, возраст» и эллипс с крестом, далее по одной
          странице на руну — та же шапка позиции и та же карточка, что в модалке. */}
      {selectedLayoutChoice && spreadRunes.length === 7 && createPortal(
        <div className="rune-layout-print" aria-hidden="true">
          <section className="rune-layout-print-cover">
            <h1 className="rune-layout-print-name">{getLayoutName(selectedLayoutChoice)}</h1>
            {/* 🧾 Строка «Фамилия Имя Отчество, возраст» — под названием раскладки */}
            {personLineText && <p className="rune-layout-print-person">{personLineText}</p>}
            <div className="rune-layout-print-scene">
              <div className={`rune-layout-ellipse${whiteBackground ? ' white-bg' : ''}`}>
                {photoUrl && !whiteBackground && (
                  <img
                    className="rune-layout-photo"
                    src={photoUrl}
                    alt=""
                    style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
                  />
                )}
                <div
                  className={`rune-layout-spread${selectedLayoutChoice === 'healing' ? ' healing' : ''}`}
                >
                  {spreadRunes.map((name, i) => (
                    <div key={name} className={`rune-layout-spread-item pos-${i + 1}`}>
                      <img
                        src={buildImageUrl(name, `${RUNES_IMAGE_DIR}/runy`)}
                        alt=""
                      />
                      <span className="rune-layout-spread-num" aria-hidden="true">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          {spreadRunes.map((name, i) => {
            const rune = findLayoutRune(name, runesCatalog)
            return (
              <section key={name} className="rune-layout-print-rune">
                <h2 className="rune-layout-print-rune-position">
                  {getPositionLabel(selectedLayoutChoice, i + 1)}
                </h2>
                <div className="rune-layout-print-rune-card">
                  <RuneCard
                    rune={rune
                      ?? { name: name.replace(/^\d+_/, '').replace(/\.[^.]+$/, '').replace(/_П$/i, ' (перевернутое положение)') }}
                    hidePower
                  />
                </div>
              </section>
            )
          })}
        </div>,
        document.body
      )}

      {selectedRuneIndex !== null && spreadRunes[selectedRuneIndex] && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedRuneIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={findLayoutRune(spreadRunes[selectedRuneIndex], runesCatalog)?.name
            ? `Руна ${selectedRuneIndex + 1}: ${findLayoutRune(spreadRunes[selectedRuneIndex], runesCatalog)?.name}`
            : `Руна ${selectedRuneIndex + 1}`}
        >
          <div
            className="filter-modal rune-layout-rune-modal"
            style={runeModalMinH > 0 ? { '--rune-modal-min-h': `${runeModalMinH}px` } as CSSProperties : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 📌 Закреплённая шапка: смысл позиции руны + кнопка «Закрыть» */}
            <div className="rune-layout-rune-header">
              <p className="rune-layout-rune-position">
                {getPositionLabel(selectedLayoutChoice, selectedRuneIndex + 1)}
              </p>
              <button
                type="button"
                className="rune-layout-rune-close"
                onClick={() => setSelectedRuneIndex(null)}
                aria-label="Закрыть"
                title="Закрыть"
              >
                ✕
              </button>
            </div>
            <RuneCard
              rune={findLayoutRune(spreadRunes[selectedRuneIndex], runesCatalog)
                ?? { name: spreadRunes[selectedRuneIndex].replace(/^\d+_/, '').replace(/\.[^.]+$/, '').replace(/_П$/i, ' (перевернутое положение)') }}
              hidePower
            />
          </div>
        </div>
      )}
    </div>
  )
}