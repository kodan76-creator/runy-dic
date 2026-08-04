// src/components/admin/DictionaryTab.jsx
// Вкладка «Словарь»: панель поиска и форма добавления/редактирования карточки.
import { useRef, useState } from 'react'
import { humanizeImportError } from '../../api/dictionary'

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
  onImport,
}) {
  const [importPreview, setImportPreview] = useState<{ name: string; count: number; data: any[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Мягкий парсинг: некоторые файлы имеют пустые значения ("id": ,),
  // которые JSON.parse не разбирает. Исправляем и пробуем снова.
  const lenientJsonParse = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      const fixed = text
        .replace(/,\s*([\]}])/g, '$1')   // убираем trailing commas
        .replace(/:\s*,/g, ': null,')   // "key": , → "key": null,
        .replace(/:\s*([\]}])/g, ': null$1') // "key": ] → "key": null]
      return JSON.parse(fixed)
    }
  }

  // Прочитать выбранный JSON-файл и показать предпросмотр перед импортом
  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = lenientJsonParse(String(reader.result))
        if (!Array.isArray(parsed)) {
          setImportError('Файл должен содержать массив слов (JSON-массив). Убедитесь, что экспортировали словарь через кнопку «⬇️ Экспорт».')
          setImportPreview(null)
        } else if (parsed.length === 0) {
          setImportError('В файле нет слов. Проверьте содержимое — он должен содержать хотя бы одну запись.')
          setImportPreview(null)
        } else {
          setImportError('')
          setImportPreview({ name: file.name, count: parsed.length, data: parsed })
        }
      } catch {
        setImportError('Файл не является корректным JSON. Проверьте кодировку (UTF-8) и структуру, либо экспортируйте словарь заново через «⬇️ Экспорт».')
        setImportPreview(null)
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const runImport = async (mode) => {
    if (!importPreview) return
    if (mode === 'replace' && !window.confirm(`Заменить текущий словарь (${words.length} слов) на ${importPreview.count} слов из файла «${importPreview.name}»? Это действие нельзя отменить.`)) return
    setImporting(true)
    setImportError('')
    try {
      await onImport(importPreview.data, mode)
      setImportPreview(null)
    } catch (err) {
      setImportError(humanizeImportError(err))
    }
    setImporting(false)
  }

  // Скачать весь словарь в JSON
  const handleExport = () => {
    if (!words || words.length === 0) return
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dictionary-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="form-section">
      <div className="dictionary-toolbar">
        <h3 className="words-count">📚 Все слова ({words.length})</h3>
        <button
          type="button"
          className="export-btn"
          onClick={handleExport}
          disabled={!words || words.length === 0}
          title="Скачать весь словарь в JSON"
        >
          ⬇️ Экспорт
        </button>
        <button
          type="button"
          className="export-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="Импортировать словарь из JSON-файла"
        >
          📥 Импорт
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Выбрать JSON-файл словаря"
          onChange={handleImportFile}
        />
        <div className="search-container">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="🔍 Поиск слова..."
              aria-label="Поиск по словарю"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => setSearchTerm('')} aria-label="Очистить поиск" title="Очистить поиск">❌</button>
            )}
          </div>
        </div>
      </div>
      {importPreview && (
        <div className="import-box">
          <div className="import-info">📄 Файл «{importPreview.name}» — {importPreview.count} слов.</div>
          <div className="import-actions">
            <button type="button" className="save-btn" onClick={() => runImport('replace')} disabled={importing}>Заменить словарь</button>
            <button type="button" className="cancel-btn" onClick={() => runImport('merge')} disabled={importing}>Добавить к существующим</button>
            <button type="button" className="cancel-btn" onClick={() => setImportPreview(null)} disabled={importing}>Отмена</button>
          </div>
          {importing && <div className="import-status">⏳ Импорт...</div>}
        </div>
      )}
      {importError && <div className="error">{importError}</div>}
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
            <input type="text" placeholder="Аудио файл (..._runy.mp3)" aria-label="Имя аудиофайла" value={formData.audio} onChange={e => setFormData({ ...formData, audio: e.target.value })} />
            <label className="audio-upload-btn" title="Загрузить MP3">
              📎
              <input type="file" accept=".mp3" hidden aria-label="Загрузить аудиофайл" onChange={e => handleAudioUpload(e, 'audio')} disabled={audioUploading === 'audio'} />
            </label>
            {formData.audio && <button type="button" className="audio-delete-btn" title="Удалить файл" aria-label="Удалить аудиофайл" onClick={() => handleAudioDelete('audio')} disabled={audioUploading === 'audio'}>🗑️</button>}
            {audioUploading === 'audio' && <span className="upload-spinner">⏳</span>}
          </div>
          <div className="audio-upload-row">
            <input type="text" placeholder="Аудио2 файл (..._r_prim.mp3)" aria-label="Имя второго аудиофайла" value={formData.audio2} onChange={e => setFormData({ ...formData, audio2: e.target.value })} />
            <label className="audio-upload-btn" title="Загрузить MP3">
              📎
              <input type="file" accept=".mp3" hidden aria-label="Загрузить второй аудиофайл" onChange={e => handleAudioUpload(e, 'audio2')} disabled={audioUploading === 'audio2'} />
            </label>
            {formData.audio2 && <button type="button" className="audio-delete-btn" title="Удалить файл" aria-label="Удалить второй аудиофайл" onClick={() => handleAudioDelete('audio2')} disabled={audioUploading === 'audio2'}>🗑️</button>}
            {audioUploading === 'audio2' && <span className="upload-spinner">⏳</span>}
          </div>
          <div className="form-row align-control">
            <span className="align-label">Выравнивание текста в карточке:</span>
            <div className="align-buttons">
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'left' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'left' })}
                aria-label="Выровнять текст по левому краю"
                aria-pressed={formData.textAlign === 'left'}
                title="По левому краю"
              >←</button>
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'center' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'center' })}
                aria-label="Выровнять текст по центру"
                aria-pressed={formData.textAlign === 'center'}
                title="По центру"
              >↔</button>
              <button
                type="button"
                className={`align-btn ${formData.textAlign === 'right' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, textAlign: 'right' })}
                aria-label="Выровнять текст по правому краю"
                aria-pressed={formData.textAlign === 'right'}
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
