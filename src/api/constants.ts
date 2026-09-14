// src/api/constants.js
// Параметры GitHub-репозитория и имена файлов данных

export const GITHUB_OWNER = 'kodan76-creator'
export const GITHUB_REPO = 'runy-dic'
export const GITHUB_BRANCH = 'main'

export const DATA_FILE = 'dictionary.json'
export const ADMINS_FILE = 'admins.json'
export const USERS_FILE = 'users.json'
export const LOGS_FILE = 'logs.json'
export const CATEGORIES_FILE = 'categories.json'
export const RUNES_FILE = 'runes.json'
export const FAVORITES_FILE = 'favorites.json'
export const QUEUE_FILE = 'favorites_queue.json'

// 📁 Папки данных пользователей: личные JSON-словари лежат в папке
// пользователя (public/users/<email_folder>/dictionary.json), а при удалении
// пользователя его данные архивируются в public/users/_deleted/<email_folder>/.
export const USERS_DIR = 'public/users'
export const DELETED_USERS_DIR = 'public/users/_deleted'

export const TOKEN = import.meta.env.VITE_GITHUB_TOKEN
