// src/api/favorites.js
// Избранное пользователей (favorites.json + очередь favorites_queue.json)
import { FAVORITES_FILE, QUEUE_FILE } from './constants'
import { fetchGitHubFile, updateGitHubFile } from './client'

export const getFavoritesForUser = async (userEmail) => {
  if (!userEmail) return null
  try {
    const { data, ok } = await fetchGitHubFile(FAVORITES_FILE)
    // Слабый интернет / сетевая ошибка — возвращаем null, чтобы вызывающий
    // (Home) упал на локальном кэше favorites:<email>.
    if (ok === false) return null
    if (!Array.isArray(data)) return []
    const rec = data.find(r => String(r.userEmail).toLowerCase() === String(userEmail).toLowerCase())
    return rec && Array.isArray(rec.favorites) ? rec.favorites : []
  } catch (e) {
    console.error('getFavoritesForUser error:', e)
    return null
  }
}

export const updateFavoritesForUser = async (userEmail, favoritesArray, clientUpdatedAt: string | null = null) => {
  if (!userEmail) throw new Error('userEmail required')

  const toTs = (s) => { const t = Date.parse(s); return isNaN(t) ? 0 : t }
  const maxRetries = 5
  const baseDelay = 400

  // helper: append an entry to queue file (persist intent)
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

  let retries = 0
  while (retries < maxRetries) {
    try {
      // load favorites and queue
      const { data: all, sha } = await fetchGitHubFile(FAVORITES_FILE)
      const { data: qdata, sha: qsha } = await fetchGitHubFile(QUEUE_FILE)
      const arr = Array.isArray(all) ? all : []
      const queueArr = Array.isArray(qdata) ? qdata : []

      // First: process persistent queue (if any)
      if (queueArr.length > 0) {
        for (const q of queueArr) {
          try {
            const qUser = String(q.userEmail).toLowerCase()
            const qFavs = Array.isArray(q.favorites) ? q.favorites.map(String) : []
            const qTs = toTs(q.updatedAt || q.createdAt || new Date().toISOString())
            const idx = arr.findIndex(r => String(r.userEmail).toLowerCase() === qUser)
            if (idx === -1) {
              arr.push({ userEmail: q.userEmail, favorites: qFavs, updatedAt: q.updatedAt || q.createdAt })
            } else {
              const serverTs = toTs(arr[idx].updatedAt)
              if (qTs >= serverTs) {
                // queued intent is newer -> apply
                arr[idx] = { ...arr[idx], favorites: qFavs, updatedAt: q.updatedAt || q.createdAt }
              } else {
                // server newer -> keep server (skip)
              }
            }
          } catch (e) {
            console.warn('Failed to apply queued entry, skipping', e)
          }
        }
        // write merged favorites and clear queue in one go
        try {
          await updateGitHubFile(FAVORITES_FILE, arr, sha)
          await updateGitHubFile(QUEUE_FILE, [], qsha)
        } catch (e) {
          if (e.message && (e.message.includes('409') || e.message.includes('Conflict'))) {
            // conflict - retry outer loop
            retries++
            await new Promise(res => setTimeout(res, baseDelay * retries + Math.random() * 200))
            continue
          }
          console.error('Failed to flush queue to server:', e)
          // if cannot flush queue, proceed to try processing current request locally (will enqueue on failure)
        }
      }

      // Refresh server state (in case queue write changed it)
      const latest = await fetchGitHubFile(FAVORITES_FILE)
      const latestArr = Array.isArray(latest.data) ? latest.data : []
      const latestSha = latest.sha

      // Now apply current client request with timestamp-aware merge
      const normalized = (favoritesArray || []).map(String)
      const idx = latestArr.findIndex(r => String(r.userEmail).toLowerCase() === String(userEmail).toLowerCase())
      const now = clientUpdatedAt || new Date().toISOString()

      if (idx === -1) {
        latestArr.push({ userEmail, favorites: normalized, updatedAt: now })
      } else {
        const serverTs = toTs(latestArr[idx].updatedAt)
        const clientTs = toTs(now)
        if (clientTs >= serverTs) {
          // client is newer -> accept client's state
          latestArr[idx] = { ...latestArr[idx], favorites: normalized, updatedAt: now }
        } else {
          // server is newer -> keep server, but merge additions to avoid losing them
          const serverFavs = Array.isArray(latestArr[idx].favorites) ? latestArr[idx].favorites.map(String) : []
          const merged = Array.from(new Set([...serverFavs, ...normalized]))
          latestArr[idx] = { ...latestArr[idx], favorites: merged, updatedAt: latestArr[idx].updatedAt }
        }
      }

      // Try write
      await updateGitHubFile(FAVORITES_FILE, latestArr, latestSha)
      return true
    } catch (error) {
      if (error.message && (error.message.includes('409') || error.message.includes('Conflict'))) {
        retries++
        console.warn(`Favorites update conflict, attempt ${retries}`)
        await new Promise(res => setTimeout(res, baseDelay * retries + Math.random() * 200))
        continue
      }
      console.error('updateFavoritesForUser error:', error)
      // persist intent to queue so another client can apply it later
      const entry = { id: Date.now().toString() + Math.floor(Math.random()*1000), userEmail, favorites: (favoritesArray||[]).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
      try {
        await enqueueToQueue(entry)
        console.warn('Saved favorites update intent to queue for later processing')
      } catch (e) {
        console.error('Failed to persist favorites intent to queue:', e)
      }
      return false
    }
  }

  // exhausted retries -> persist intent
  const entry = { id: Date.now().toString() + Math.floor(Math.random()*1000), userEmail, favorites: (favoritesArray||[]).map(String), updatedAt: clientUpdatedAt || new Date().toISOString(), createdAt: new Date().toISOString() }
  try {
    await enqueueToQueue(entry)
    console.warn('Saved favorites update intent to queue after retries exhausted')
  } catch (e) {
    console.error('Failed to persist favorites intent to queue after retries:', e)
  }
  return false
}
