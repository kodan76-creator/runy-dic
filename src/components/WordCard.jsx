// src/components/WordCard.jsx
// Карточка слова на главном экране пользователя
import '../App.css'

const getDictionarySourceLabel = (item) => (
  item.__dictionarySource === 'shared' ? 'Общий словарь' : 'Личный словарь'
)

export default function WordCard({ item, categories, isFavorite, onToggleFavorite, onPlayAudio, onScrollTop }) {
  const renderCategory = (category) => {
    const values = Array.isArray(category) ? category : [category]
    const label = values
      .filter(value => (typeof value === 'string' ? value.trim().length > 0 : Boolean(value)))
      .map(id => categories.find(c => c.id === id)?.name || (typeof id === 'string' ? id.trim() : id))
      .filter(Boolean)
      .join('; ')

    return label ? <div className="card-category">({label})</div> : null
  }

  return (
    <div className={`card align-${item.textAlign || 'center'}`}>
      <div className={`dictionary-source ${item.__dictionarySource === 'shared' ? 'shared' : 'personal'}`}>
        {getDictionarySourceLabel(item)}
      </div>
      {/* favorite button top-right */}
      <button className={`favorite-btn ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite} title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
        {isFavorite ? '❤️' : '🤍'}
      </button>
      {item.audio && (
        <button className="audio-btn" onClick={() => onPlayAudio(item.audio, item.__dictionarySource === 'personal')} title="Слушать слово">
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
        <button className="audio-btn-bottom" onClick={() => onPlayAudio(item.audio2, item.__dictionarySource === 'personal')} title="Слушать пример">
          🔊
        </button>
      )}

      {/* Кнопка "вверх" внутри карточки */}
      <button className="card-scroll-top-btn" onClick={onScrollTop} title="Вверх">⬆</button>
    </div>
  )
}
