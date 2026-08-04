// src/components/admin/LogsTab.jsx
// Вкладка «Логи»: список действий пользователей.
export default function LogsTab({
  logs,
  loadLogs,
  handleClearLogs,
  formatDate,
}) {
  return (
    <div className="logs-section">
      <div className="logs-header">
        <h3>📊 Логи действий ({logs.length})</h3>
        <div className="logs-actions">
          <button onClick={loadLogs} className="refresh-logs-btn">Обновить логи</button>
          <button onClick={handleClearLogs} className="clear-logs-btn">🗑️ Очистить логи</button>
        </div>
      </div>
      <div className="logs-list">
        {logs.map(log => (
          <div key={log.id} className="log-item">
            <span className="log-time">{formatDate(log.timestamp)}</span>
            <span className="log-action">{log.action}</span>
            <span className="log-user">{log.userEmail || 'system'}</span>
            <span className="log-details">{log.details}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
