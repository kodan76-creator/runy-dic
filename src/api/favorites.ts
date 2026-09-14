// src/api/favorites.ts
// Избранное пользователей — личный файл в папке пользователя:
// public/users/<email_folder>/favorites.json
import { QUEUE_FILE, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } from './constants'
import { fetchGitHubFile, updateGitHubFile, getHeaders } from './client'
import { emailToFolderName } from './audio'

// 📁 Путь к файлу избранного конкретного пользователя
export const getFavoritesFileNameForEmail = (email: string | null | undefined): string | null => {
  const folder = emailToFolderName(email)
  if (!folder) return null
  return `public/users/${folder}/favorites.json`
}

// 📂 Список файлов избранного пользователей (Git Trees API)
export const listUserFavoritesFiles = async (): Promise<string[]> => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`
    const resp = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
    if (!resp.ok) return []
    const data = await resp.json()
    if (!Array.isArray(data.tree)) return []
    return data.tree
      .filter(item => item.type === 'blob' && /^public\/users\/[^/]+\/favorites\.json$/.test(item.path))
      .map(item => item.path)
  } catch { return [] }
}

// 🗑️ Удалить ID слова из ВСЕХ файлов избранного пользователей
// (вызывается при удалении слова из словаря)
export const removeWordFromAllFavorites = async (wordId: string | number) => {
  const idStr = String(wordId)
  const files = await listUserFavoritesFiles()
  for (const fileName of files) {
    try {
      const { data, sha } = await fetchGitHubFile(fileName)
      if (!sha || !Array.isArray(data)) continue
      const normalized = data.map(String)
      if (normalized.includes(idStr)) {
        await updateGitHubFile(fileName, normalized.filter(f => f !== idStr), sha)
      }
    } catch (e) {
      console.error(`Failed to remove word from ${fileName}:`, e)
    }
  }
}

export const getFavoritesForUser = async (userEmail) => {
  if (!userEmail) return null
  const fileName = getFavoritesFileNameForEmail(userEmail)
  if (!fileName) return null
  try {
    const { data, ok } = await fetchGitHubFile(fileName)
    // Слабый интернет / сетевая ошибка — возвращаем null, чтобы вызывающий
    // (Home) упал на локальном кэше favorites:<email>.
    if (ok === false) return null
    if (!Array.isArray(data)) return []
    return data.map(String)
  } catch (e) {
    console.error('getFavoritesForUser error:', e)
    return null
  }
}

export const updateFavoritesForUser = async (userEmail, favoritesArray, clientUpdatedAt: string | null = null) => {
  if (!userEmail) throw new Error('userEmail required')
  const fileName = getFavoritesFileNameForEmail(userEmail)
  if (!fileName) throw new Error('Invalid email')

  const toTs = (s) => { const t = Date.parse(s); return isNaN(t) ? 0 : t }
  const maxRetries = 5
  const baseDelay = 400

  // helper: append an entry to global queue file (persist intent оффлайн)
  const enqueueToQueue = async (entry) => {
    let attempts = 0
    while (attempts < 3) {
      try {
        const { data: qdata, sha: qsha } = await fetchGitHubFile(QUEUE_FILE)
        const qarr = Array.isArray(qdata) ? qdata : []
        qarr.push(entry)
        await updateGitHubFile(QUEUE_FILE, qarr, qsha)
        return true
      } catch (e) {
        if (e.message && (e.message.includes('409') || e.message.includes('Conflict'))) {
          attempts++
          await new Promise(res => setTimeout(res, 200 + attempts * 150))
          continue
        }
        console.error('enqueueToQueue error:', e)
        return false
      }
    }
    console.error('Failed to enqueue after attempts')
    return false
  }

  // Применить отложенные записи из очереди для данного пользователя.
  // Берём самую свежую запись (последний оффлайн-интент) и записываем в файл.
  const processQueueForUser = async () => {
    try {
      const { data: qdata, sha: qsha } = await fetchGitHubFile(QUEUE_FILE)
      const queueArr = Array.isArray(qdata) ? qdata : []
      const myEntries = queueArr
        .filter(q => String(q.userEmail).toLowerCase() === String(userEmail).toLowerCase())
        .sort((a, b) => toTs(a.updatedAt || a.createdAt) - toTs(b.updatedAt || b.createdAt))

      if (myEntries.length === 0) return

      const latest = myEntries[myEntries.length - 1]
      const qFavs = Array.isArray(latest.favorites) ? latest.favorites.map(String) : []

      const { sha: currentSha } = await fetchGitHubFile(fileName)
      await updateGitHubFile(fileName, qFavs, currentSha)

      // Удалить обработанные записи из глобальной очереди
      const remaining = queueArr.filter(q =>
        !(String(q.userEmail).toLowerCase() === String(userEmail).toLowerCase() && myEntries.includes(q))
      )
      await updateGitHubFile(QUEUE_FILE, remaining, qsha)
    } catch (e) {
      console.warn('Failed to process favorites queue:', e)
    }
  }

  let retries = 0
  while (retries < maxRetries) {
    try {
      // Сначала обработать отложенные записи из очереди
      await processQueueForUser()

      // Записать текущее состояние избранного в личный файл пользователя
      const { sha } = await fetchGitHubFile(fileName)
      const normalized = (favoritesArray || []).map(String)
      await updateGitHubFile(fileName, normalized, sha)
      return true
    } catch (error) {
      if (error.message && (error.message.includes('409') || error.message.includes('Conflict'))) {
        retries++
        console.warn(`Favorites update conflict, attempt ${retries}`)
        await new Promise(res => setTimeout(res, baseDelay * retries + Math.random() * 200))
        continue
      }
      console.error('updateFavoritesForUser error:', error)
      // Сохранить намерение в очередь (оффлайн / повтор при следующем входе)
      const entry = { id: Date.now().toString() + Math.floor(Math.random() * 1000), userEmail, favorites: (favoritesArray || []).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
      try {
        await enqueueToQueue(entry)
        console.warn('Saved favorites update intent to queue for later processing')
      } catch (e) {
        console.error('Failed to persist favorites intent to queue:', e)
      }
      return false
    }
  }

  // Exhausted retries — persist intent
  const entry = { id: Date.now().toString() + Math.floor(Math.random() * 1000), userEmail, favorites: (favoritesArray || []).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
  try {
    await enqueueToQueue(entry)
    console.warn('Saved favorites update intent to queue after retries exhausted')
  } catch (e) {
    console.error('Failed to persist favorites intent to queue after retries exhausted:', e)
  }
  return false
}
