// src/components/RuneLayout.tsx
// Подраздел «Рунная раскладка» (в разделе «Новые Руны», для оплативших).
// Показывает фото пользователя во весь рост, обрезанное эллипсом-«яйцом»,
// с возможностью увеличивать/уменьшать фото, чтобы подогнать человека
// под внутренний размер эллипса. Если фото нет — диалог загрузки.
import { useState, useRef, useCallback, useEffect } from 'react'
import { validateImageFile, buildImageUrl, listRuneLayoutImages, selectRandomRunes } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
import { saveRuneLayoutType } from '../api/auth'
import { emailToFolderName } from '../api/audio'
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

// 🎲 Резервный список файлов рун раскладки (если GitHub API недоступен)
const RUNES_LAYOUT_FALLBACK = [
  '1_ФАИС-СУ.png', '2_ФАИС-СУ_П.png', '3_ОРС.png', '4_ОРС_П.png',
  '5_ТУРЗ.png', '6_АЗ.png', '7_РАДО.png', '8_РАДО_П.png', '9_АЛУ.png',
  '10_ХЕБО.png', '11_ХЕБО_П.png', '12_ВИНЬО.png', '13_ВИНЬО_П.png',
  '14_ПУСТАЯ.png', '15_ТАК.png', '16_ТАК_П.png', '17_ЙЕХ.png', '18_ЙЕХ_П.png',
  '19_АЙЯ.png', '20_ЭЙСА.png', '21_ЫРД.png', '22_АЛЬ-ГО.png', '23_ЭЛЬ.png',
  '24_АМАЮН.png', '25_АМАЮН_П.png', '26_БЕРКУТ.png', '27_БЕРКУТ_П.png',
  '28_ВОЗ.png', '29_МЭТР.png', '30_МЭТР_П.png', '31_ЛАТХУ.png', '32_ЛАУКАР.png',
  '33_ША.png', '34_ША_П.png', '35_КИЙГ.png', '36_ЦЭРЭ.png', '37_ЦЭРЭ.png',
  '38_РУНА ТИШИНЫ.png',
]

export default function RuneLayout({ user, onUserUpdate }) {
  // 💾 Восстановление pan/zoom из localStorage (кэширование состояния)
  const savedState = user?.email ? loadLayoutState(user.email) : null
  const [zoom, setZoom] = useState(savedState?.zoom ?? 1)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // Версия фото для сброса кэша браузера после замены файла
  const [photoTs, setPhotoTs] = useState(() => Date.now())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 🖐️ Drag-to-pan state (восстанавливаем из кэша)
  const [panX, setPanX] = useState(savedState?.panX ?? 0)
  const [panY, setPanY] = useState(savedState?.panY ?? 0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0 })
  const ellipseRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  // 🔧 Apply (фиксация фото)
  const [applying, setApplying] = useState(false)
  // 🎲 Раскладка Новых Рун: выбранные 7 рун вокруг эллипса
  const [spreadRunes, setSpreadRunes] = useState<string[]>([])
  const [spreadLoading, setSpreadLoading] = useState(false)
  // 🎛️ Выбор раскладки: после фиксации фото показываем 2 кнопки
  // (оценка / исцеление). После выбора — крест с рунами + кнопка возврата.
  const [showLayoutChoice, setShowLayoutChoice] = useState(false)
  const [selectedLayoutChoice, setSelectedLayoutChoice] = useState('')
  // 🖼️ Локальный blob-URL обработанного фото — показываем сразу после
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

  const photoName = user?.fullBodyPhoto
  const folder = user?.email ? emailToFolderName(user.email) : ''
  // Если есть локальный blob URL — показываем его (приоритет), иначе серверный URL
  const photoUrl = localPhotoUrl
    || (photoName ? `${buildImageUrl(photoName, folder)}?t=${photoTs}` : '')

  // 🧹 Освобождаем blob-URL при размонтировании
  useEffect(() => () => {
    if (localPhotoUrlRef.current) URL.revokeObjectURL(localPhotoUrlRef.current)
  }, [])

  // 💾 Автосохранение pan/zoom при каждом изменении
  useEffect(() => {
    if (!user?.email) return
    saveLayoutState(user.email, { panX, panY, zoom })
  }, [panX, panY, zoom, user?.email])

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
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
      setPhotoTs(Date.now())
      setZoom(1)
      setPanX(0)
      setPanY(0)
      if (user?.email) clearLayoutState(user.email)
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

  // 🎲 Раскладка Новых Рун: случайный выбор 7 рун из папки runy
  const handleSpread = async () => {
    setSpreadLoading(true)
    try {
      let files = await listRuneLayoutImages()
      // Оставляем только файлы с порядковым номером до «_»
      files = files.filter(f => /^\d+_/.test(f))
      if (files.length === 0) files = [...RUNES_LAYOUT_FALLBACK]
      setSpreadRunes(selectRandomRunes(files, 7))
    } catch (e) {
      console.warn('handleSpread error:', e)
      setSpreadRunes(selectRandomRunes(RUNES_LAYOUT_FALLBACK, 7))
    } finally {
      setSpreadLoading(false)
    }
  }

  // 🎛️ Выбор типа раскладки (оценка / исцеление): генерируем руны и сохраняем тип
  const handleChooseLayout = async (type) => {
    setSelectedLayoutChoice(type)
    setShowLayoutChoice(false)
    handleSpread()
    try {
      const updated = await saveRuneLayoutType(user.email, type)
      onUserUpdate(updated)
    } catch (err) {
      setUploadError(err?.message || 'Ошибка сохранения типа раскладки')
    }
  }

  // ↩️ Вернуться к выбору раскладки (2 кнопки)
  const handleReturnToChoice = () => {
    setSelectedLayoutChoice('')
    setShowLayoutChoice(true)
    setSpreadRunes([])
  }

  // 📷 Вернуться к выбору фото (режим редактирования: масштаб/замена/фиксация)
  const handleReturnToPhoto = () => {
    setShowLayoutChoice(false)
    setSelectedLayoutChoice('')
    setSpreadRunes([])
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

  // 🖱️ Клик по фото после «Зафиксировать»: переход к следующему сценарию —
  // раскладке Новых Рун (оценка). Пока фото в режиме редактирования
  // (масштаб/сдвиг) клик не делает ничего — там работает drag-to-pan.
  const handlePhotoClick = () => {
    if (!showLayoutChoice || selectedLayoutChoice) return
    handleChooseLayout('evaluation')
  }

  return (
    <div className="rune-layout">
      <h2 className="runes-section-title">
        <img src={`${import.meta.env.BASE_URL}golub-icon.png`} alt="" className="rune-title-icon" />
        Рунная раскладка
      </h2>

      {photoUrl ? (
        <>
          <div className="rune-layout-stage">
            <div className="rune-layout-ellipse" ref={ellipseRef}>
              <img
                ref={imgRef}
                className={`rune-layout-photo${dragging ? ' dragging' : ''}${showLayoutChoice && !selectedLayoutChoice ? ' clickable' : ''}`}
                src={photoUrl}
                alt="Ваше фото во весь рост"
                style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
                draggable={false}
                onClick={handlePhotoClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              {spreadRunes.length > 0 && (
                <div className="rune-layout-spread" aria-label="Раскладка Новых Рун">
                  {spreadRunes.map((name, i) => (
                    <div key={name} className={`rune-layout-spread-item pos-${i + 1}`}>
                      <img
                        src={buildImageUrl(name, `${RUNES_IMAGE_DIR}/runy`)}
                        alt={`Руна ${i + 1}`}
                        draggable={false}
                      />
                      <span className="rune-layout-spread-num">{i + 1}</span>
                    </div>
                  ))}
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
            <div className="rune-layout-controls">
              <button
                type="button"
                className="rune-layout-return-btn"
                onClick={handleReturnToChoice}
                title="Вернуться к выбору раскладок"
              >
                Вернуться к выбору раскладок
              </button>
              {spreadLoading && (
                <span className="rune-layout-spread-loading">⏳ Выбор рун…</span>
              )}
            </div>
          ) : (
            <div className="rune-layout-controls">
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
              <button
                type="button"
                className="rune-layout-apply-btn"
                onClick={handleApplyPhoto}
                disabled={applying}
                title="Зафиксировать текущую позицию и размер фото"
              >
                {applying ? '⏳ Обработка…' : '✓ Зафиксировать'}
              </button>
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
          <button type="button" className="rune-layout-upload-btn" onClick={() => setShowUpload(true)}>
            Загрузить фото
          </button>
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
    </div>
  )
}