// src/components/WordCard.jsx
// Карточка слова на главном экране пользователя
import '../App.css'

const getDictionarySourceLabel = (item) => (
  item.__dictionarySource === 'shared' ? 'Общий словарь' : 'Личный словарь'
)

// Подсветка совпадений поиска: оборачивает все вхождения в <mark class="search-hit">
const highlight = (text, searchTerm) => {
  if (!text || !searchTerm || !searchTerm.trim()) return text
  const term = searchTerm.trim()
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escaped})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="search-hit">{part}</mark>
      : part
  )
}

export default function WordCard({ item, categories, isFavorite, onToggleFavorite, onPlayAudio, onScrollTop, searchTerm = '' }) {
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
      <button
        className={`favorite-btn ${isFavorite ? 'active' : ''}`}
        onClick={onToggleFavorite}
        aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        aria-pressed={isFavorite}
        title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      >
        {isFavorite ? '❤️' : '🤍'}
      </button>
      {item.audio && (
        <button className="audio-btn" onClick={() => onPlayAudio(item.audio, item.__dictionarySource === 'personal')} aria-label="Слушать слово" title="Слушать слово">
          🔊
        </button>
      )}
      <div className="word-row">
        <h3 className="word">{highlight(item.word, searchTerm)}</h3>
        {item.transcription && <span className="transcription">[{highlight(item.transcription, searchTerm)}]</span>}
      </div>
      <p className="translation">{highlight(item.translation, searchTerm)}</p>
      {renderCategory(item.category)}
      {(item.example || item.example2 || item.transcription2) && (
        <div className="examples">
          {item.example && <span className="example">{highlight(item.example, searchTerm)}</span>}
          {item.example && item.example2 && <span className="dash"> — </span>}
          {item.example2 && <span className="example2">{highlight(item.example2, searchTerm)}</span>}
          {item.transcription2 && <span className="transcription2">[{highlight(item.transcription2, searchTerm)}]</span>}
        </div>
      )}
      {item.audio2 && (
        <button className="audio-btn-bottom" onClick={() => onPlayAudio(item.audio2, item.__dictionarySource === 'personal')} aria-label="Слушать пример" title="Слушать пример">
          🔊
        </button>
      )}

      {/* Кнопка "вверх" внутри карточки */}
      <button className="card-scroll-top-btn" onClick={onScrollTop} aria-label="Прокрутить список вверх" title="Вверх">⬆</button>
    </div>
  )
}
