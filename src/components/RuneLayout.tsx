// src/components/RuneLayout.tsx
// Подраздел «Рунная раскладка» (в разделе «Новые Руны», для оплативших).
// Показывает фото пользователя во весь рост, обрезанное эллипсом-«яйцом»,
// с возможностью увеличивать/уменьшать фото, чтобы подогнать человека
// под внутренний размер эллипса. Если фото нет — диалог загрузки.
import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadImageFile, buildImageUrl } from '../api/images'
import { saveFullBodyPhoto } from '../api/auth'
import { emailToFolderName } from '../api/audio'
import { isOnline, enqueueOfflineChange, getOfflineChanges } from '../api/offline'
import { flushOfflineChanges } from '../api/dictionary'
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
  const [pendingSync, setPendingSync] = useState(false)
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
    // «Ожидает синхронизации» — только если в оффлайн-очереди есть фото
    try {
      const hasPending = getOfflineChanges().some(c =>
        c.type === 'full_body_photo' &&
        String(c.email || '').toLowerCase() === String(user.email).toLowerCase()
      )
      setPendingSync(hasPending)
    } catch { /* ignore */ }
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
      const res = await uploadImageFile(file, user.email, false, {
        allowedExtensions: PHOTO_ALLOWED_EXTENSIONS,
        maxSize: PHOTO_MAX_SIZE,
        minWidth: PHOTO_MIN_WIDTH,
        minHeight: PHOTO_MIN_HEIGHT,
        maxWidth: PHOTO_MAX_WIDTH,
        maxHeight: PHOTO_MAX_HEIGHT,
      })
      const updated = await saveFullBodyPhoto(user.email, res.path)
      onUserUpdate(updated)
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
      // Кэшируем новый файл, чтобы фото не пропадало, пока файл не попал
      // в собранный сайт (свежезагруженный файл недоступен по same-origin URL)
      if (user?.email) await cachePhotoBlob(user.email, file)
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
  // Важно: НЕ сбрасываем zoom/pan и НЕ вызываем onUserUpdate так, чтобы
  // компонент размонтировался/перезагрузился — фото остаётся видимым.
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
      // 🖼️ Всегда кэшируем обработанное фото — оно переживёт перезагрузку
      // страницы и переключение подразделов. Иначе после фиксации фото
      // пропадает: свежезагруженный файл ещё не попал в собранный сайт,
      // и same-origin URL даёт 404.
      await cachePhotoBlob(user.email, blob)
      const isConn = isOnline()
      if (isConn) {
        // Онлайн — загружаем в фоне, не блокируя отображение
        const file = new File([blob], `layout_${Date.now()}.jpg`, { type: 'image/jpeg' })
        try {
          const res = await uploadImageFile(file, user.email, false, {
            allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
            maxSize: PHOTO_MAX_SIZE,
          })
          const updated = await saveFullBodyPhoto(user.email, res.path)
          // Обновляем пользователя без сброса blob URL и без смены photoTs —
          // фото остаётся видимым через blob URL, перезагрузки нет
          onUserUpdate(updated)
          setPendingSync(false)
        } catch (uploadErr) {
          // Ошибка загрузки — ставим в очередь
          enqueueOfflineChange({
            type: 'full_body_photo',
            email: user.email,
            timestamp: Date.now(),
          })
          setPendingSync(true)
          setUploadError(uploadErr?.message || 'Ошибка загрузки, фото сохранено локально')
        }
      } else {
        // Оффлайн — ставим в очередь
        enqueueOfflineChange({
          type: 'full_body_photo',
          email: user.email,
          timestamp: Date.now(),
        })
        setPendingSync(true)
      }
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

  // ☁️ Ручная синхронизация: загружает кэшированное фото на сервер
  const handleSyncNow = async () => {
    if (!user?.email) return
    setApplying(true)
    setUploadError('')
    try {
      // Сохраняем blob для отображения — flushOfflineChanges удаляет его из кэша
      const blob = await getCachedPhotoBlob(user.email)
      await flushOfflineChanges(user)
      if (blob) await cachePhotoBlob(user.email, blob)
      // Бейдж показываем, только если синхронизация не завершилась
      const hasPending = getOfflineChanges().some(c =>
        c.type === 'full_body_photo' &&
        String(c.email || '').toLowerCase() === String(user.email).toLowerCase()
      )
      setPendingSync(hasPending)
      // Не меняем photoTs — blob URL остаётся, перезагрузки нет
    } catch (err) {
      setUploadError(err?.message || 'Ошибка синхронизации')
    } finally {
      setApplying(false)
    }
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
                className={`rune-layout-photo${dragging ? ' dragging' : ''}`}
                src={photoUrl}
                alt="Ваше фото во весь рост"
                style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
                draggable={false}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
          </div>
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
              disabled={applying || (panX === 0 && panY === 0 && zoom === 1)}
              title="Зафиксировать текущую позицию и размер фото"
              style={{ visibility: (panX !== 0 || panY !== 0 || zoom !== 1) ? 'visible' : 'hidden' }}
              aria-hidden={panX === 0 && panY === 0 && zoom === 1}
            >
              {applying ? '⏳ Обработка…' : '✓ Зафиксировать'}
            </button>
            {pendingSync && (
              <span className="rune-layout-sync-badge" title="Фото сохранено локально, будет загружено при подключении к интернету">
                ☁️ Ожидает синхронизации
                {isOnline() && (
                  <button
                    type="button"
                    className="rune-layout-sync-btn"
                    onClick={handleSyncNow}
                    title="Загрузить фото на сервер сейчас"
                  >
                    ↻ Загрузить
                  </button>
                )}
              </span>
            )}
          </div>
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