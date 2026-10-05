// src/components/admin/RunesTab.jsx
// Вкладка «Новые Руны»: форма добавления/редактирования руны и список рун.
import { useRef, useState } from 'react'
import { useScrollRestoration } from '../../hooks/useScrollRestoration'
import { RUNES_IMAGE_DIR } from '../../api/constants'
import { buildRuneImageUrls } from '../../api/images'
import RuneCard from '../RuneCard'

export default function RunesTab({
  runes,
  runeFormData,
  setRuneFormData,
  runeEditingId,
  setRuneEditingId,
  audioUploading,
  runeImageFresh,
  handleRuneSubmit,
  handleEditRune,
  handleDeleteRune,
  handleMoveRuneUp,
  handleMoveRuneDown,
  handleMoveRuneToTop,
  handleMoveRuneToEnd,
  handleRuneImageUpload,
  handleRuneImageDelete,
}) {
  const runesListRef = useRef(null)
  // 🖼️ Номер попытки загрузки превью картинки: локальный URL сайта → raw-фолбэк
  // → скрыть (см. previewCandidates ниже). Привязан к текущей картинке, поэтому
  // после смены файла попытки начинаются заново.
  const [previewAttempt, setPreviewAttempt] = useState({ key: '', index: 0, failed: false })
  // 💾 Сохраняем/восстанавливаем позицию прокрутки списка рун при обновлении страницы
  useScrollRestoration(runesListRef, 'scroll_admin_runes', [runes.length])

  const resetForm = () => {
    setRuneEditingId(null)
    setRuneFormData({ name: '', graphic: '', letter: '', image: '', imageUpdatedAt: 0, power: '', keywords: '', description: '', textAlign: 'center' })
  }

  // 🖼️ URL превью картинки руны — raw-first с версией (см. buildRuneImageUrls):
  // файл уже в репозитории сразу после коммита, а сборка GitHub Pages идёт с
  // задержкой. Сразу после загрузки в этой сессии (runeImageFresh) версия ещё
  // не записана в runes.json — подставляем метку сессии. Резерв — URL сайта
  // (оффлайн / raw недоступен), затем превью скрывается.
  const previewFreshTs = runeImageFresh && runeImageFresh.path === runeFormData.image ? runeImageFresh.ts : 0
  const { primary: previewRaw, fallback: previewLocal } = buildRuneImageUrls(
    previewFreshTs
      ? { image: runeFormData.image, imageUpdatedAt: previewFreshTs }
      : { image: runeFormData.image, imageUpdatedAt: runeFormData.imageUpdatedAt },
  )
  const previewCandidates = [previewRaw, previewLocal].filter(Boolean)
  const previewKey = `${runeFormData.image}|${previewFreshTs}`
  const attempt = previewAttempt.key === previewKey ? previewAttempt : { key: previewKey, index: 0, failed: false }
  const previewSrc = attempt.failed ? '' : (previewCandidates[attempt.index] || '')
  // Следующий URL; когда варианты кончились — прячем превью целиком
  const handlePreviewError = () => {
    const next = attempt.index + 1
    setPreviewAttempt(
      next < previewCandidates.length
        ? { key: previewKey, index: next, failed: false }
        : { key: previewKey, index: attempt.index, failed: true }
    )
  }

  return (
    <div className="runes-section">
      <h3 className="runes-section-title"><img src={`${import.meta.env.BASE_URL}golub-icon.png`} alt="" className="rune-title-icon" /> Новые Руны ({runes.length})</h3>
      <form onSubmit={handleRuneSubmit} className="word-form rune-form">
        <div className="form-column form-column-left">
          <input
            type="text"
            placeholder="1. Название"
            aria-label="Название руны"
            value={runeFormData.name}
            onChange={e => setRuneFormData({ ...runeFormData, name: e.target.value })}
            required
          />
          <input
            type="text"
            className="runic-input"
            placeholder="2. Графическое изображение"
            aria-label="Графическое изображение руны"
            value={runeFormData.graphic}
            onChange={e => setRuneFormData({ ...runeFormData, graphic: e.target.value })}
          />
          {runeFormData.graphic && (
            <div className="rune-graphic-preview">
              <span className="rune-graphic-glyph">{runeFormData.graphic}</span>
            </div>
          )}
          <input
            type="text"
            placeholder="3. Буква"
            aria-label="Буква руны"
            value={runeFormData.letter}
            onChange={e => setRuneFormData({ ...runeFormData, letter: e.target.value })}
          />
        </div>
        <div className="form-column form-column-right">
          <div className="audio-upload-row">
            <input
              type="text"
              placeholder="4. Отображение Силы Руны (картинка с прозрачным фоном)"
              aria-label="Имя файла картинки руны"
              value={runeFormData.image}
              onChange={e => setRuneFormData({ ...runeFormData, image: e.target.value })}
            />
            <label className="audio-upload-btn" title="Загрузить картинку">
              🖼️
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/*"
                hidden
                aria-label="Загрузить картинку"
                onChange={e => handleRuneImageUpload(e)}
                disabled={audioUploading === 'runeImage'}
              />
            </label>
            {runeFormData.image && (
              <button type="button" className="audio-delete-btn" title="Удалить файл" aria-label="Удалить картинку" onClick={() => handleRuneImageDelete()} disabled={audioUploading === 'runeImage'}>🗑️</button>
            )}
            {audioUploading === 'runeImage' && <span className="upload-spinner">⏳</span>}
          </div>
          {previewSrc && (
            <div className="image-preview-row">
              <img src={previewSrc} alt="Превью картинки руны" className="image-preview" onError={handlePreviewError} />
            </div>
          )}
          <input
            type="text"
            placeholder="5. Описание Силы Руны"
            aria-label="Описание Силы Руны"
            value={runeFormData.power}
            onChange={e => setRuneFormData({ ...runeFormData, power: e.target.value })}
          />
          <input
            type="text"
            placeholder="6. Ключевые слова"
            aria-label="Ключевые слова"
            value={runeFormData.keywords}
            onChange={e => setRuneFormData({ ...runeFormData, keywords: e.target.value })}
          />
        </div>
        <div className="rune-description-field">
          <textarea
            className="rune-description-textarea"
            placeholder="7. Описание"
            aria-label="Описание руны"
            value={runeFormData.description}
            onChange={e => setRuneFormData({ ...runeFormData, description: e.target.value })}
            rows={4}
          />
        </div>
        <div className="form-row align-control">
          <span className="align-label">Выравнивание текста в карточке:</span>
          <div className="align-buttons">
            <button
              type="button"
              className={`align-btn ${runeFormData.textAlign === 'left' ? 'active' : ''}`}
              onClick={() => setRuneFormData({ ...runeFormData, textAlign: 'left' })}
              aria-label="Выровнять текст по левому краю"
              aria-pressed={runeFormData.textAlign === 'left'}
              title="По левому краю"
            >←</button>
            <button
              type="button"
              className={`align-btn ${runeFormData.textAlign === 'center' ? 'active' : ''}`}
              onClick={() => setRuneFormData({ ...runeFormData, textAlign: 'center' })}
              aria-label="Выровнять текст по центру"
              aria-pressed={runeFormData.textAlign === 'center'}
              title="По центру"
            >↔</button>
            <button
              type="button"
              className={`align-btn ${runeFormData.textAlign === 'right' ? 'active' : ''}`}
              onClick={() => setRuneFormData({ ...runeFormData, textAlign: 'right' })}
              aria-label="Выровнять текст по правому краю"
              aria-pressed={runeFormData.textAlign === 'right'}
              title="По правому краю"
            >→</button>
          </div>
        </div>
        <div className="form-buttons">
          <button type="submit" className="save-btn">{runeEditingId ? 'Обновить' : 'Добавить'}</button>
          {runeEditingId && <button type="button" className="cancel-btn" onClick={resetForm}>Отмена</button>}
        </div>
      </form>

      <div className="categories-list runes-list" ref={runesListRef}>
        {runes.length === 0 ? (
          <div className="no-results">Руны отсутствуют</div>
        ) : runes.map((r, idx) => (
          <div key={r.id} className={`category-item rune-item align-${r.textAlign || 'center'}`}>
            <div className="category-order">
              <button onClick={() => handleMoveRuneToTop(r.id)} className="move-btn" disabled={idx === 0} title="В начало">⏫</button>
              <button onClick={() => handleMoveRuneUp(r.id)} className="move-btn" disabled={idx === 0} title="Переместить вверх">⬆️</button>
              <button onClick={() => handleMoveRuneDown(r.id)} className="move-btn" disabled={idx === runes.length - 1} title="Переместить вниз">⬇️</button>
              <button onClick={() => handleMoveRuneToEnd(r.id)} className="move-btn" disabled={idx === runes.length - 1} title="В конец">⏬</button>
            </div>
            <RuneCard rune={r} showMissingImageHint />
            <div className="category-actions">
              <button onClick={() => handleEditRune(r)} className="edit-btn">✏️</button>
              <button onClick={() => handleDeleteRune(r.id)} className="delete-btn">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
