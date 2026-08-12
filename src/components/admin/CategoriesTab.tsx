// src/components/admin/CategoriesTab.jsx
// Вкладка «Категории»: форма и список категорий.
import { useRef } from 'react'
import { useScrollRestoration } from '../../hooks/useScrollRestoration'

export default function CategoriesTab({
  categories,
  categoryForm,
  setCategoryForm,
  catEditingId,
  setCatEditingId,
  handleCategorySubmit,
  handleEditCategory,
  handleDeleteCategory,
  handleMoveCategoryUp,
  handleMoveCategoryDown,
  handleMoveCategoryToTop,
}) {
  const catListRef = useRef(null)
  // 💾 Сохраняем/восстанавливаем позицию прокрутки списка категорий при обновлении страницы
  useScrollRestoration(catListRef, 'scroll_admin_categories', [categories.length])

  return (
    <div className="categories-section">
      <h3>🗂️ Категории ({categories.length})</h3>
      <div className="category-form">
        <input type="text" placeholder="Название категории" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} />
        <input type="text" placeholder="Описание (необязательно)" value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })} />
        <div className="form-buttons">
          <button className="save-btn" onClick={handleCategorySubmit}>{catEditingId ? 'Обновить' : 'Добавить'}</button>
          {catEditingId && <button className="cancel-btn" onClick={() => { setCatEditingId(null); setCategoryForm({ name: '', description: '' }) }}>Отмена</button>}
        </div>
      </div>

      <div className="categories-list" ref={catListRef}>
        {categories.length === 0 ? <div className="no-results">Категории отсутствуют</div> : categories.map((cat, idx) => (
          <div key={cat.id} className="category-item">
            <div className="category-order">
              <button onClick={() => handleMoveCategoryToTop(cat.id)} className="move-btn" disabled={idx === 0} title="В начало">⏫</button>
              <button onClick={() => handleMoveCategoryUp(cat.id)} className="move-btn" disabled={idx === 0} title="Переместить вверх">⬆️</button>
              <button onClick={() => handleMoveCategoryDown(cat.id)} className="move-btn" disabled={idx === categories.length - 1} title="Переместить вниз">⬇️</button>
            </div>
            <div className="category-info">
              <strong>{cat.name}</strong>
              {cat.description && <div className="category-desc">{cat.description}</div>}
            </div>
            <div className="category-actions">
              <button onClick={() => handleEditCategory(cat)} className="edit-btn">✏️</button>
              <button onClick={() => handleDeleteCategory(cat.id)} className="delete-btn">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
