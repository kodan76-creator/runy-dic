// src/components/admin/UsersTab.jsx
// Вкладка «Пользователи»: фильтры, поиск и карточки пользователей.
import { useRef } from 'react'
import { useScrollRestoration } from '../../hooks/useScrollRestoration'

export default function UsersTab({
  filteredUsers,
  userSearchTerm,
  setUserSearchTerm,
  userPaymentFilter,
  setUserPaymentFilter,
  userRoleFilter,
  setUserRoleFilter,
  userEditingId,
  userFormData,
  setUserFormData,
  userSaving,
  handleSaveUser,
  handleEditUser,
  handleCancelEditUser,
  handleBlockUser,
  handleUnblockUser,
  handleDeleteUser,
  formatDate,
}) {
  const usersGridRef = useRef(null)
  // 💾 Сохраняем/восстанавливаем позицию прокрутки списка пользователей при обновлении страницы
  useScrollRestoration(usersGridRef, 'scroll_admin_users', [filteredUsers.length])

  return (
    <div className="users-section">
      <h3>👥 Пользователи ({filteredUsers.length})</h3>
      <div className="users-toolbar">
        <div className="search-container">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="🔍 Поиск пользователя..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="search-input"
            />
            {userSearchTerm && (
              <button className="search-clear-btn" onClick={() => setUserSearchTerm('')} title="Очистить поиск">❌</button>
            )}
          </div>
        </div>
        <div className="user-payment-filters">
          <button type="button" className={`filter-chip ${userPaymentFilter === 'all' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('all')}>Все</button>
          <button type="button" className={`filter-chip ${userPaymentFilter === 'paid' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('paid')}>Оплачено</button>
          <button type="button" className={`filter-chip ${userPaymentFilter === 'unpaid' ? 'active' : ''}`} onClick={() => setUserPaymentFilter('unpaid')}>Не оплачено</button>
        </div>
        <div className="user-role-filters">
          <button type="button" className={`filter-chip ${userRoleFilter === 'all' ? 'active' : ''}`} onClick={() => setUserRoleFilter('all')}>Все</button>
          <button type="button" className={`filter-chip ${userRoleFilter === 'admin' ? 'active' : ''}`} onClick={() => setUserRoleFilter('admin')}>Админ</button>
          <button type="button" className={`filter-chip ${userRoleFilter === 'user' ? 'active' : ''}`} onClick={() => setUserRoleFilter('user')}>Пользователь</button>
        </div>
      </div>
      <div className="users-grid" ref={usersGridRef}>
        {filteredUsers.length > 0 ? filteredUsers.map(u => (
          <div key={u.id} className={`user-card ${u.isBlocked ? 'blocked' : ''}`}>
            <div className="user-info">
              <p className="user-email">{u.email}</p>
              <p className="user-meta">Роль: {u.role === 'admin' ? 'Админ' : 'Пользователь'}</p>
              <p className="user-meta">Общий словарь: {u.paid ? 'Оплачено' : 'Не оплачено'} {formatDate(u.paid ? u.paidAt : u.unpaidAt)}</p>
              <p className="user-meta">Новые Руны: {u.runesPaid ? 'Оплачено' : 'Не оплачено'} {formatDate(u.runesPaid ? u.runesPaidAt : u.runesUnpaidAt)}</p>
              <p className="user-date">Зарегистрирован: {formatDate(u.createdAt)}</p>
              {u.isBlocked && <p className="user-blocked">Заблокирован: {formatDate(u.blockedAt)} ({u.blockedBy})</p>}
            </div>
            {userEditingId === u.id ? (
              <form className="user-edit-form" onSubmit={handleSaveUser}>
                <input
                  type="email"
                  value={userFormData.email}
                  onChange={e => {
                    const value = e.target.value
                    if (/^[a-zA-Z0-9@._-]*$/.test(value)) {
                      setUserFormData({ ...userFormData, email: value })
                    }
                  }}
                  required
                />
                <select
                  value={userFormData.role}
                  onChange={e => setUserFormData({ ...userFormData, role: e.target.value })}
                >
                  <option value="admin">Админ</option>
                  <option value="user">Пользователь</option>
                </select>
                <select
                  value={userFormData.paid ? 'paid' : 'unpaid'}
                  onChange={e => setUserFormData({ ...userFormData, paid: e.target.value === 'paid' })}
                >
                  <option value="paid">Оплачено</option>
                  <option value="unpaid">Не оплачено</option>
                </select>
                <select
                  value={userFormData.runesPaid ? 'paid' : 'unpaid'}
                  onChange={e => setUserFormData({ ...userFormData, runesPaid: e.target.value === 'paid' })}
                >
                  <option value="paid">Новые Руны: Оплачено</option>
                  <option value="unpaid">Новые Руны: Не оплачено</option>
                </select>
                <div className="user-edit-actions">
                  <button type="submit" className="save-user-btn" disabled={userSaving}>{userSaving ? 'Сохранение...' : 'Сохранить'}</button>
                  <button type="button" className="cancel-user-btn" onClick={handleCancelEditUser} disabled={userSaving}>Отмена</button>
                </div>
              </form>
            ) : (
              <div className="user-actions">
                <button onClick={() => handleEditUser(u)} className="edit-user-btn">Редактировать</button>
                {u.isBlocked ? <button onClick={() => handleUnblockUser(u.id, u.email)} className="unblock-btn">✅ Разблокировать</button> : <button onClick={() => handleBlockUser(u.id, u.email)} className="block-btn">🚫 Заблокировать</button>}
                <button onClick={() => handleDeleteUser(u.id, u.email)} className="delete-user-btn">Удалить пользователя</button>
              </div>
            )}
          </div>
        )) : <div className="no-results">{userSearchTerm ? 'Пользователь не найден' : 'Пользователи не найдены'}</div>}
      </div>
    </div>
  )
}
