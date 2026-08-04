// src/components/admin/SecurityTab.jsx
// Вкладка «Безопасность»: статус шифрования файлов и операции шифрования/дешифрования.
export default function SecurityTab({
  filesStatus,
  filesStatusLoading,
  migrationLoading,
  decryptLoading,
  encryptLoading,
  selectedFiles,
  migrationResult,
  decryptResult,
  encryptResult,
  handleMigrateEncryption,
  loadFilesStatus,
  selectAllEncrypted,
  selectAllPlain,
  handleDecryptSelected,
  handleEncryptSelected,
  toggleFileSelection,
  setSelectedFiles,
}) {
  return (
    <div className="logs-section">
      <div className="logs-header">
        <h3>🔐 Шифрование данных</h3>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {/* Инструменты */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
          <button
            onClick={handleMigrateEncryption}
            disabled={migrationLoading}
            className="clear-logs-btn"
            style={{ fontSize: '13px', padding: '4px 12px' }}
          >
            {migrationLoading ? '⏳ Шифрование...' : '🔐 Зашифровать все файлы'}
          </button>
          <button
            onClick={loadFilesStatus}
            disabled={filesStatusLoading}
            className="refresh-logs-btn"
            style={{ fontSize: '13px', padding: '4px 12px' }}
          >
            {filesStatusLoading ? '⏳ Проверка...' : '🔄 Проверить статус файлов'}
          </button>
        </div>

        {/* Выбор файлов */}
        {filesStatus.length > 0 && (
          <div>
            <div style={{ marginBottom: '6px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={selectAllEncrypted}
                className="refresh-logs-btn"
                style={{ fontSize: '12px', padding: '2px 8px' }}
              >
                Зашифр.+сломан.
              </button>
              <button
                onClick={selectAllPlain}
                className="refresh-logs-btn"
                style={{ fontSize: '12px', padding: '2px 8px' }}
              >
                Открытые
              </button>
              {selectedFiles.size > 0 && (
                <>
                  <button
                    onClick={handleDecryptSelected}
                    disabled={decryptLoading}
                    className="clear-logs-btn"
                    style={{ fontSize: '12px', padding: '2px 8px' }}
                  >
                    {decryptLoading ? '⏳ Расшифровка...' : `🔓 Расшифровать (${selectedFiles.size})`}
                  </button>
                  <button
                    onClick={handleEncryptSelected}
                    disabled={encryptLoading}
                    className="clear-logs-btn"
                    style={{ fontSize: '12px', padding: '2px 8px', background: '#2d6a4f', borderColor: '#2d6a4f' }}
                  >
                    {encryptLoading ? '⏳ Шифрование...' : `🔐 Зашифровать (${selectedFiles.size})`}
                  </button>
                </>
              )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #555' }}>
                  <th style={{ padding: '2px 6px', width: '30px' }}>
                    <input
                      type="checkbox"
                      checked={selectedFiles.size === filesStatus.filter(f => f.encrypted || f.broken).length && filesStatus.filter(f => f.encrypted || f.broken).length > 0}
                      onChange={() => {
                        const needAction = filesStatus.filter(f => f.encrypted || f.broken)
                        if (selectedFiles.size === needAction.length) setSelectedFiles(new Set())
                        else setSelectedFiles(new Set(needAction.map(f => f.file)))
                      }}
                    />
                  </th>
                  <th style={{ padding: '2px 6px', textAlign: 'left' }}>Файл</th>
                  <th style={{ padding: '2px 6px', textAlign: 'left' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filesStatus.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #333', opacity: f.status === 'not_found' ? 0.4 : 1 }}>
                    <td style={{ padding: '2px 6px' }}>
                      {f.encrypted !== null && (
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(f.file)}
                          onChange={() => toggleFileSelection(f.file)}
                        />
                      )}
                    </td>
                    <td style={{ padding: '2px 6px' }}>{f.file}</td>
                    <td style={{ padding: '2px 6px' }}>
                      {f.encrypted === true && '🔒 Зашифрован'}
                      {f.encrypted === false && f.status === 'broken' && '⚠️ Сломан'}
                      {f.encrypted === false && f.status === 'plain' && '📄 Открытый'}
                      {f.status === 'not_found' && '⏭️ Не найден'}
                      {f.status === 'error' && '❌ Ошибка'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Результаты операций */}
        {[
          { label: 'Результат «Зашифровать все»:', data: migrationResult },
          { label: 'Результат расшифровки:', data: decryptResult },
          { label: 'Результат шифрования:', data: encryptResult },
        ].filter(g => g.data && g.data.length > 0).map(group => (
          <div key={group.label} style={{ marginTop: '8px' }}>
            <h4 style={{ color: '#fff', margin: '0 0 4px', fontSize: '13px' }}>{group.label}</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '12px' }}>
              <tbody>
                {group.data.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '2px 6px' }}>{r.file}</td>
                    <td style={{ padding: '2px 6px' }}>
                      {r.status === 'encrypted' && '🔐 Зашифрован'}
                      {r.status === 'already_encrypted' && '🔒 Уже зашифрован'}
                      {r.status === 'decrypted' && '🔓 Расшифрован'}
                      {r.status === 'repaired' && '🔧 Восстановлен'}
                      {r.status === 'not_encrypted' && '📄 Уже открытый'}
                      {r.status === 'not_found' && '⏭️ Не найден'}
                      {r.status === 'error' && `❌ ${r.error}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
