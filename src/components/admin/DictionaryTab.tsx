// src/components/admin/DictionaryTab.jsx
// Вкладка «Словарь»: панель поиска и форма добавления/редактирования карточки.
export default function DictionaryTab({
  words,
  searchTerm,
  setSearchTerm,
  formData,
  setFormData,
  categories,
  editingId,
  setEditingId,
  loading,
  error,
  audioUploading,
  handleSubmit,
  handleAudioUpload,
  handleAudioDelete,
  loadWords,
}) {
  return (
    <div className="form-section">
      <div className="dictionary-toolbar">
        <h3 className="words-count">📚 Все слова ({words.length})</h3>
        <div className="search-container">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="🔍 Поиск слова..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => setSearchTerm('')} title="Очистить поиск">❌</button>
            )}
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="word-form">
        <div className="form-column form-column-left">
          <textarea rows={1} className="single-line-textarea runic-input" placeholder="Слово на рунном языке" value={formData.word} onChange={e => setFormData({ ...formData, word: e.target.value })} required />
          <textarea rows={1} className="single-line-textarea" placeholder="Транскрипция" value={formData.transcription} onChange={e => setFormData({ ...formData, transcription: e.target.value })} />
          <textarea rows={1} className="single-line-textarea" placeholder="Перевод (на русском языке)" value={formData.translation} onChange={e => setFormData({ ...formData, translation: e.target.value })} required />
          <div className="category-checkboxes">
            {categories.map(c => (
              <label key={c.id} className="cat-item">
                <input type="checkbox" value={c.id} checked={(Array.isArray(formData.category) && (formData.category.includes(c.id) || formData.category.includes(c.name))) || (!Array.isArray(formData.category) && String(formData.category) === String(c.id))} onChange={e => {
                  const checked = e.target.checked
                  const val = e.target.value
                  const current = Array.isArray(formData.category) ? formData.category.slice() : (formData.category ? [formData.category] : [])
                  if (checked) {
                    if (!current.includes(val)) current.push(val)
                  } else {
                    const idx = current.indexOf(val)
                    if (idx !== -1) current.splice(idx, 1)
                  }
                  setFormData({ ...formData, category: current })
                }} />
                <span className="checkbox-box" />
                <span className="cat-name">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-column form-column-right">
          <textarea rows={1} className="single-line-textarea" placeholder="Пример (на русском языке)" value={formData.example} onChange={e => setFormData({ ...formData, example: e.target.value })} />
          <textarea rows={1} className="single-line-textarea runic-input" placeholder="Пример (на рунном языке)" value={formData.example2} onChange={e => setFormData({ ...formData, example2: e.target.value })} />
          <textarea rows={1} className="single-line-textarea" placeholder="Транскрипция примера" value={formData.transcription2} onChange={e => setFormData({ ...formData, transcription2: e.target.value })} />
          <div className="audio-upload-row">
            <input type="text" placeholder="Аудио файл (..._runy.mp3)" value={formData.audio} onChange={e => setFormData({ ...formData, audio: e.target.value })} />
            <label className="audio-upload-btn" title="Загрузить MP3">
              📎
              <input type="file" accept=".mp3" hidden onChange={e => handleAudioUpload(e, 'audio')} disabled={audioUploading === 'audio'} />
            </label>
            {formData.audio && <button type="button" className="audio-delete-btn" title="Удалить файл" onClick={() => handleAudioDelete('audio')} disabled={audioUploading === 'audio'}>🗑️</button>}
            {audioUploading === 'audio' && <span className="upload-spinner">⏳</span>}
          </div>
          <div className="audio-upload-row">
            <input type="text" placeholder="Аудио2 файл (..._r_prim.mp3)" value={formData.audio2} onChange={e => setFormData({ ...formData, audio2: e.target.value })} />
            <label className="audio-upload-btn" title="Загрузить MP3">
              📎
              <input type="file" accept=".mp3" hidden onChange={e => handleAudioUpload(e, 'audio2')} disabled={audioUploading === 'audio2'} />
            </label>
            {formData.audio2 && <button type="button" className="audio-delete-btn" title="Удалить файл" onClick={() => handleAudioDelete('audio2')} disabled={audioUploading === 'audio2'}>🗑️</button>}
            {audioUploading === 'audio2' && <span className="upload-spinner">⏳</span>}
          </div>
          <div className="form-row align-control">
            <span className="align-label">Выравнивание текста в карточке:</span>
            <div className="align-buttons">
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'left' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'left' })}
                title="По левому краю"
              >←</button>
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'center' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'center' })}
                title="По центру"
              >↔</button>
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'right' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'right' })}
                title="По правому краю"
              >→</button>
            </div>
          </div>
        </div>
        <div className="form-buttons">
          <button type="submit" className="save-btn" disabled={loading}>{loading ? 'Сохранение...' : (editingId ? 'Обновить' : 'Добавить')}</button>
          {editingId && <button type="button" className="cancel-btn" onClick={() => { setEditingId(null); setFormData({ word: '', transcription: '', translation: '', category: [], example: '', example2: '', transcription2: '', audio: '', audio2: '', textAlign: 'center' }) }}>Отмена</button>}
          <button
            type="button"
            className="refresh-logs-btn dictionary-refresh-btn"
            onClick={loadWords}
            disabled={loading}
            style={{ fontSize: '13px', padding: '4px 10px' }}
          >
            {loading ? '⏳' : '🔄 Обновить'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  )
}
