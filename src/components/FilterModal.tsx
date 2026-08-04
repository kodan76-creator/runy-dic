// src/components/FilterModal.jsx
// Модальное окно фильтра по категориям
import '../App.css'

export default function FilterModal({ open, categories, selectedFilters, onToggleFilter, onApply, onClose, onReset }) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Фильтр по категориям</h3>
        <div className="filter-list">
          {categories.length === 0 && <p>Категории не загружены</p>}
          {categories.map(cat => (
            <label key={cat.id} className="filter-item cat-item">
              <input type="checkbox" checked={selectedFilters.includes(cat.id)} onChange={() => onToggleFilter(cat.id)} />
              <span className="checkbox-box" aria-hidden></span>
              <span className="filter-name">{cat.name}</span>
            </label>
          ))}
        </div>
        <div className="filter-actions">
          <button className="apply-btn" onClick={onApply}>Применить</button>
          <button className="cancel-btn" onClick={onReset}>Сбросить</button>
          <button className="close-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
