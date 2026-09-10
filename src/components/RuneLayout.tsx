// src/components/RuneLayout.tsx
// Подраздел «Рунная раскладка» (в разделе «Новые Руны», для оплативших).
// Показывает фото пользователя во весь рост, обрезанное эллипсом-«яйцом»,
// с возможностью увеличивать/уменьшать фото, чтобы подогнать человека
// под внутренний размер эллипса. Если фото нет — диалог загрузки.
import { useState, useRef } from 'react'
import { uploadImageFile, buildImageUrl } from '../api/images'
import { saveFullBodyPhoto } from '../api/auth'
import { emailToFolderName } from '../api/audio'
import '../App.css'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export default function RuneLayout({ user, onUserUpdate }) {
  const [zoom, setZoom] = useState(1)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // Версия фото для сброса кэша браузера после замены файла
  const [photoTs, setPhotoTs] = useState(() => Date.now())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const photoName = user?.fullBodyPhoto
  const folder = user?.email ? emailToFolderName(user.email) : ''
  const photoUrl = photoName
    ? `${buildImageUrl(photoName, folder)}?t=${photoTs}`
    : ''

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.email) return
    setUploading(true)
    setUploadError('')
    try {
      const res = await uploadImageFile(file, user.email)
      const updated = await saveFullBodyPhoto(user.email, res.path)
      onUserUpdate(updated)
      setPhotoTs(Date.now())
      setZoom(1)
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

  return (
    <div className="rune-layout">
      <h2 className="runes-section-title">
        <img src={`${import.meta.env.BASE_URL}golub-icon.png`} alt="" className="rune-title-icon" />
        Рунная раскладка
      </h2>

      {photoUrl ? (
        <>
          <div className="rune-layout-stage">
            <div className="rune-layout-ellipse">
              <img
                className="rune-layout-photo"
                src={photoUrl}
                alt="Ваше фото во весь рост"
                style={{ transform: `scale(${zoom})` }}
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
          </div>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
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