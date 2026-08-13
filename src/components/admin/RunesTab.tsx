// src/components/admin/RunesTab.jsx
// Вкладка «Новые Руны»: форма добавления/редактирования руны и список рун.
import { useRef } from 'react'
import { useScrollRestoration } from '../../hooks/useScrollRestoration'
import RuneCard from '../RuneCard'

export default function RunesTab({
  runes,
  runeFormData,
  setRuneFormData,
  runeEditingId,
  setRuneEditingId,
  audioUploading,
  getImageSrc,
  handleRuneSubmit,
  handleEditRune,
  handleDeleteRune,
  handleMoveRuneUp,
  handleMoveRuneDown,
  handleMoveRuneToTop,
  handleRuneImageUpload,
  handleRuneImageDelete,
}) {
  const runesListRef = useRef(null)
  // 💾 Сохраняем/восстанавливаем позицию прокрутки списка рун при обновлении страницы
  useScrollRestoration(runesListRef, 'scroll_admin_runes', [runes.length])

  const resetForm = () => {
    setRuneEditingId(null)
    setRuneFormData({ name: '', graphic: '', letter: '', image: '', power: '', keywords: '', description: '', textAlign: 'center' })
  }

  return (
    <div className="runes-section">
      <h3 className="runes-section-title">🧿 Новые Руны ({runes.length})</h3>
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
          {runeFormData.image && getImageSrc && (
            <div className="image-preview-row">
              <img src={getImageSrc(runeFormData.image)} alt="Превью картинки руны" className="image-preview" onError={e => { e.currentTarget.style.display = 'none' }} />
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
            </div>
            <RuneCard rune={r} imageSrc={r.image && getImageSrc ? getImageSrc(r.image) : undefined} />
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
