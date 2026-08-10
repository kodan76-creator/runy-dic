// src/components/admin/WordItem.jsx
// Карточка слова в админ-панели (сетка слов).
export default function WordItem({
  word,
  idx,
  canEdit,
  isFirst,
  isLast,
  positionValue,
  wordsLength,
  categories,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onMoveToBottom,
  onPositionChange,
  onPositionSubmit,
  onEdit,
  onDelete,
  onPlayAudio,
  getImageSrc,
  onScrollTop,
}) {
  const catName = (id) => (categories.find(c => c.id === id) || { name: id }).name

  return (
    <div key={word.id} className={`word-item align-${word.textAlign || 'center'}`}>
      <span className="word-number">{idx + 1}.</span>
      <div className="word-content">
        <div className="word-row">
          <h4 className="word-title">{word.word}</h4>
          {word.transcription && <span className="word-transcription">[{word.transcription}]</span>}
        </div>
        {word.image && getImageSrc && (
          <img src={getImageSrc(word.image)} alt={word.word || 'Картинка'} className="word-image" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />
        )}
        <p className="word-translation">{word.translation}</p>
        {(Array.isArray(word.category) ? word.category.length > 0 : !!word.category) && (
          <div className="word-category">({Array.isArray(word.category) ? word.category.map(catName).join('; ') : catName(word.category)})</div>
        )}
        <div className="examples">
          {word.example && <span className="word-example">{word.example}</span>}
          {word.example2 && <><span className="word-dash"> — </span><span className="word-example2">{word.example2}</span></>}
          {word.transcription2 && <span className="word-transcription2">[{word.transcription2}]</span>}
        </div>
        {word.audio && (
          <p className="word-audio">
            🔊 {word.audio}
            <button type="button" className="audio-play-btn" onClick={() => onPlayAudio(word.audio)} title="Воспроизвести" style={{ marginLeft: '8px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px' }}>▶️</button>
          </p>
        )}
        {word.audio2 && (
          <p className="word-audio">
            🔊 {word.audio2}
            <button type="button" className="audio-play-btn" onClick={() => onPlayAudio(word.audio2)} title="Воспроизвести" style={{ marginLeft: '8px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px' }}>▶️</button>
          </p>
        )}
      </div>

      {canEdit ? (
        <div className="word-actions">
          <div className="word-order">
            <button onClick={() => onMoveToTop(word.id)} className="move-btn" disabled={isFirst} title="В начало">⏫</button>
            <button onClick={() => onMoveUp(word.id)} className="move-btn" disabled={isFirst} title="Переместить вверх">⬆️</button>
            <button onClick={() => onMoveDown(word.id)} className="move-btn" disabled={isLast} title="Переместить вниз">⬇️</button>
            <button onClick={() => onMoveToBottom(word.id)} className="move-btn" disabled={isLast} title="В конец">⏬</button>
          </div>
          <div className="word-position-set">
            <input
              type="number"
              min="1"
              max={wordsLength}
              className="word-position-input"
              value={positionValue}
              onChange={(e) => onPositionChange(word.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onPositionSubmit(word.id, positionValue) } }}
              title="Номер позиции"
            />
            <button
              type="button"
              className="word-position-btn"
              onClick={() => onPositionSubmit(word.id, positionValue)}
              title="Установить позицию"
            >№</button>
          </div>
          <button onClick={() => onEdit(word)} className="edit-btn">✏️</button>
          <button onClick={() => onDelete(word.id, word.createdBy)} className="delete-btn">🗑️</button>
        </div>
      ) : null}

      <button className="card-scroll-top-btn admin" onClick={onScrollTop} title="Вверх">⬆</button>
    </div>
  )
}
