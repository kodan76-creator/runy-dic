// src/githubApi.js
// Точка входа для GitHub API — переэкспортирует все функции из src/api/.
// Существующие импорты из './githubApi' (App.jsx, AdminPanel.jsx) продолжают работать.
export * from './api/constants'
export * from './api/client'
export * from './api/auth'
export * from './api/dictionary'
export * from './api/categories'
export * from './api/runes'
export * from './api/logs'
export * from './api/favorites'
export * from './api/audio'
export * from './api/images'
export * from './api/security'
