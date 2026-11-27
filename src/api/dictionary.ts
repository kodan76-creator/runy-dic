// src/api/dictionary.js
// Работа со словарём: общий (dictionary.json) и личные словари пользователей
import { DATA_FILE, USERS_FILE, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } from './constants'
import {
  fetchGitHubFile,
  fetchGitHubFileRaw,
  updateGitHubFile,
  safeUpdateGitHubFile,
  isRetryableGitHubError,
  getHeaders,
  withWriteLock,
} from './client'
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from '../dictionaryAccess'
import {
  isOnline,
  enqueueOfflineChange,
  getOfflineChanges,
  removeOfflineChanges,
  applyOfflineChange,
  getCachedDictionary,
  cacheDictionaryForOffline,
} from './offline'
import { removeWordFromAllFavorites } from './favorites'

const getDictionaryFileName = (user) => resolveDictionaryFile(user)

export const getDictionary = async (user) => {
  try {
    // If the user is a paid regular user, return merged view of shared dictionary and personal file
    if (user && typeof user === 'object' && user.role === 'user' && user.paid) {
      const personalName = getDictionaryFileNameForEmail(user.email)
      // Два словаря читаются параллельно: при оплаченном пользователе иначе
      // задержка складывалась из двух последовательных запросов к GitHub.
      const [shared, personal] = await Promise.all([
        fetchGitHubFile(DATA_FILE),
        fetchGitHubFile(personalName),
      ])
      const sharedArr = Array.isArray(shared.data) ? shared.data.map(item => ({ ...item, __dictionarySource: 'shared' })) : []
      const personalArr = Array.isArray(personal.data) ? personal.data.map(item => ({ ...item, __dictionarySource: 'personal' })) : []

      // Дедупликация только ВНУТРИ каждого словаря. id уникален в рамках
      // одного файла, но общий и личный словари оба нумеруются с "1" —
      // ключ должен включать источник, иначе личные слова исчезают как дубли.
      const map = new Map()
      const add = (it, source: 'shared' | 'personal') => {
        if (!it) return
        const identity = it.id ? `id:${it.id}` : `w:${String(it.word||'')}_t:${String(it.translation||'')}`
        const key = `${source}:${identity}`
        if (!map.has(key)) map.set(key, it)
      }
      sharedArr.forEach(it => add(it, 'shared'))
      personalArr.forEach(it => add(it, 'personal'))
      // ok = оба источника доступны. При слабом интернете один из запросов
      // может вернуть ok:false (пустые данные) — тогда вызывающий упадёт
      // на офлайн-кэш, а полученные частично данные всё равно покажет.
      const ok = shared.ok !== false && personal.ok !== false
      return { data: Array.from(map.values()), sha: shared.sha || personal.sha || null, ok, exists: shared.exists ?? personal.exists ?? null }
    }

    const fileName = getDictionaryFileName(user)
    return fetchGitHubFile(fileName)
  } catch (e) {
    console.error('getDictionary error:', e)
    return { data: [], sha: null, ok: false, exists: null }
  }
}

export const updateDictionary = async (newData, currentSha, user) => {
  const fileName = getDictionaryFileName(user)
  return safeUpdateGitHubFile(fileName, newData, currentSha)
}

// Импорт словаря из файла: заменяет содержимое целевого файла (общий словарь
// для админа, личный файл — для обычного пользователя). С повторами при
// временных сбоях, как у addWord.
// После записи сразу проверяет, что файл читается корректно; если нет —
// автоматически откатывает на предыдущую версию и выбрасывает ошибку.
export const importDictionary = async (newData, user = null) => {
  const fileName = getWriteFileName(user)
  const arr = Array.isArray(newData) ? newData : []
  const maxRetries = 4
  let lastError = null

  // 💾 Бэкап текущего состояния для возможного отката
  let oldSha: string | null = null
  let oldData: any[] | null = null
  try {
    const current = await fetchGitHubFile(fileName)
    oldSha = current.sha
    oldData = Array.isArray(current.data) ? [...current.data] : []
  } catch (e) {
    console.warn(`importDictionary: не удалось прочитать текущий файл для бэкапа:`, e)
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { sha, exists, ok } = await fetchGitHubFile(fileName)
      if (exists === true && !ok) {
        throw new Error(`Не удалось прочитать файл словаря (${fileName}). Обновите страницу и попробуйте ещё раз.`)
      }
      await updateGitHubFile(fileName, arr, sha)

      // 🔍 ПОСТ-ПРОВЕРКА: сразу читаем файл обратно, чтобы убедиться, что он не сломан
      // (например, записан не в том формате шифрования и не расшифровывается).
      const verify = await fetchGitHubFile(fileName)
      if (!verify.ok || !Array.isArray(verify.data)) {
        const detail = `ok=${verify.ok}, isArray=${Array.isArray(verify.data)}, exists=${verify.exists}`
        console.warn(`importDictionary: файл не проходит проверку чтения после записи (${detail}). Откат на предыдущую версию.`)

        // Откат: пишем старые данные под актуальным SHA (получаем через raw-файл, т.к. verify.sha может быть null)
        if (oldSha != null && oldData != null) {
          try {
            const raw = await fetchGitHubFileRaw(fileName)
            const currentSha = raw.sha || oldSha
            await updateGitHubFile(fileName, oldData, currentSha)
            throw new Error(
              `Импорт отменён: после записи файл не удалось прочитать. Данные откатаны на предыдущую версию (${oldData.length} слов).`
            )
          } catch (rollbackErr) {
            throw new Error(
              `Импорт отменён: файл не читается после записи. Откат не удался: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Требуется ручное восстановление через git.`
            )
          }
        } else {
          throw new Error(
            `Импорт отменён: файл не читается после записи, и нет бэкапа для отката. Требуется ручное восстановление через git.`
          )
        }
      }

      return arr
    } catch (error) {
      lastError = error
      const retryable = isRetryableGitHubError(error) ||
        /Failed to fetch|NetworkError|Не удалось прочитать/.test(error?.message || String(error))
      if (retryable && attempt < maxRetries - 1) {
        console.warn(`importDictionary: ${error.message || error}, повторная попытка ${attempt + 1}/${maxRetries}`)
        await new Promise(res => setTimeout(res, 400 + attempt * 300))
        continue
      }
      throw error
    }
  }
  throw lastError
}

// Переводит техническую ошибку импорта в понятное пользователю сообщение
// с рекомендацией по исправлению.
export const humanizeImportError = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error)
  const m = msg.toLowerCase()
  if (m.includes('409') || m.includes('conflict') || m.includes('sha was supposed') || m.includes('sha wasn')) {
    return '⚠️ Конфликт записи: кто-то другой одновременно изменил словарь. Обновите страницу (🔄) и повторите импорт.'
  }
  if (m.includes('401') || m.includes('403') || m.includes('bad credentials') || m.includes('token') || m.includes('forbidden')) {
    return '❌ Нет доступа к GitHub. Проверьте токен доступа (VITE_GITHUB_TOKEN) и права на редактирование репозитория.'
  }
  if (m.includes('422')) {
    return '❌ Ошибка записи на GitHub (422). Обновите страницу (🔄) и повторите импорт.'
  }
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('timeout')) {
    return '❌ Нет соединения с GitHub. Проверьте интернет-соединение и повторите импорт.'
  }
  if (m.includes('не удалось прочитать') || m.includes('read')) {
    return '⚠️ Не удалось прочитать текущий словарь на сервере. Обновите страницу (🔄) и повторите импорт.'
  }
  return `❌ ${msg || 'Неизвестная ошибка при импорте'}`
}

// Нормализует id импортируемых слов:
//  - пустой/отсутствующий id → автоподстановка: текущая дата+время в unix (мс),
//    как делает addWord (Date.now()). Уникален в партии.
//  - есть id, но он не равен (baseId+1) → назначаем baseId+1 (last+1).
// Это НЕ ошибка — просто исправляем и продолжаем.
export const normalizeImportIds = (words: any[], baseId: number = 0): any[] => {
  let next = baseId
  const now = Date.now()
  let tsOffset = 0
  return (Array.isArray(words) ? words : []).map(w => {
    const cur = w && w.id != null && String(w.id) !== '' ? String(w.id) : ''
    if (cur === '') {
      const ts = String(now + tsOffset)
      tsOffset += 1
      return { ...w, id: ts }
    }
    next += 1
    if (cur !== String(next)) {
      return { ...w, id: String(next) }
    }
    return { ...w, id: cur }
  })
}

const getWriteFileName = (userOrEmail) => {
  // Determine file to write to. Users always write to their personal file; admins write to shared DATA_FILE.
  if (!userOrEmail) return 'user.json'
  if (typeof userOrEmail === 'string') return getDictionaryFileNameForEmail(userOrEmail)
  if (userOrEmail.role === 'admin') return DATA_FILE
  if (userOrEmail.role === 'user') return getDictionaryFileNameForEmail(userOrEmail.email || '')
  // Fallback
  return 'user.json'
}

export const ensureUserDictionaryFile = async (userOrEmail) => {
  const fileName = getWriteFileName(userOrEmail)

  if (fileName === DATA_FILE) {
    return { fileName, exists: true, created: false }
  }

  const { sha } = await fetchGitHubFile(fileName)
  if (sha) {
    return { fileName, exists: true, created: false }
  }

  await safeUpdateGitHubFile(fileName, [], null)
  return { fileName, exists: false, created: true }
}

// ⚡ Один чтение файла + одна запись на операцию со словарём.
// Раньше каждое перемещение/сохранение читало 1 МБ файл 3–4 раза (данные,
// бэкап, проверка формата перед PUT, верификация после PUT). Теперь формат и
// sha берём из одного чтения, а результат PUT уже содержит записанные данные.
type DictionaryMutation = {
  next: any[]
  changed: boolean
  value?: any
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))

const mutateDictionaryFile = async (
  fileName: string,
  mutate: (arr: any[]) => DictionaryMutation,
  maxRetries = 3
) => {
  // GitHub не допускает параллельные GET→PUT одного файла: несколько быстрых
  // правок подряд должны выстроиться в очередь, иначе 409/422 замедляют запись.
  return withWriteLock(fileName, async () => {
    let lastError: unknown = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Условный GET: если файл не изменился с прошлого чтения, GitHub вернёт
        // 304 без 1+ МБ тела — сохранение карточки не ждёт повторной загрузки словаря.
        const { data, sha, exists, ok, encrypted } = await fetchGitHubFile(fileName, { conditional: true })
        // Файл есть (или его существование неизвестно из-за сбоя сети), но он не
        // прочитан — писать нельзя: можно затереть словарь пустым массивом.
        if (!ok && exists !== false) {
          throw new Error(`Не удалось прочитать файл словаря (${fileName}). Обновите страницу и попробуйте ещё раз.`)
        }
        const arr = Array.isArray(data) ? [...data] : []
        const { next, changed, value } = mutate(arr)
        if (!changed) return { changed: false as const, next: arr, sha: sha as string | null, value }
        await updateGitHubFile(fileName, next, sha, { encrypted: encrypted ?? true, pretty: false })
        return { changed: true as const, next, sha: sha as string | null, value }
      } catch (error) {
        lastError = error
        const retryable = isRetryableGitHubError(error) ||
          /Failed to fetch|NetworkError|Не удалось прочитать/.test(error?.message || String(error))
        if (retryable && attempt < maxRetries - 1) {
          await wait(300 + attempt * 250)
          continue
        }
        throw error
      }
    }
    throw lastError
  })
}

const wordIndexById = (arr: any[], id: unknown): number => {
  const key = String(id)
  return arr.findIndex(w => w != null && String(w.id) === key)
}

export const addWord = async (wordData, userEmail, user = null) => {
  const target = user || userEmail
  const fileName = getWriteFileName(target)
  const newWord = { ...wordData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }

  // 🌐 Оффлайн: применяем изменение к кэшу и ставим в очередь,
  // чтобы при возврате сети синхронизировать (flushOfflineChanges)
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'add', fileName, word: newWord })
    const email = getCacheEmail(target)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'add', word: newWord }))
      }
    }
    return newWord
  }

  await mutateDictionaryFile(fileName, arr => ({ next: [...arr, newWord], changed: true }))
  return newWord
}

export const updateWord = async (id, updatedData, user = null) => {
  const fileName = getWriteFileName(user)

  // 🌐 Оффлайн: применяем к кэшу + ставим в очередь на синхронизацию
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'update', fileName, id, data: updatedData })
    const email = getCacheEmail(user)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'update', id, data: updatedData }))
      }
    }
    return { id, ...updatedData }
  }

  const { value } = await mutateDictionaryFile(fileName, arr => {
    const idx = wordIndexById(arr, id)
    if (idx === -1) {
      throw new Error('Запись не найдена или доступ запрещён')
    }
    const updated = { ...arr[idx], ...updatedData }
    if (JSON.stringify(updated) === JSON.stringify(arr[idx])) {
      return { next: arr, changed: false, value: updated }
    }
    const next = [...arr]
    next[idx] = updated
    return { next, changed: true, value: updated }
  })
  return value ?? { id, ...updatedData }
}

export const deleteWord = async (id, user = null) => {
  const fileName = getWriteFileName(user)

  // 🌐 Оффлайн: применяем к кэшу + ставим в очередь на синхронизацию
  if (!isOnline()) {
    enqueueOfflineChange({ type: 'delete', fileName, id })
    const email = getCacheEmail(user)
    if (email) {
      const cached = getCachedDictionary(email)
      if (Array.isArray(cached)) {
        cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'delete', id }))
      }
    }
    return { id }
  }

  const { value } = await mutateDictionaryFile(fileName, arr => {
    const idx = wordIndexById(arr, id)
    if (idx === -1) {
      throw new Error('Запись не найдена или доступ запрещён')
    }
    const next = [...arr]
    const [removed] = next.splice(idx, 1)
    return { next, changed: true, value: removed }
  })

  // Удалить ID из всех личных файлов избранного пользователей
  try {
    await removeWordFromAllFavorites(id)
  } catch (e) {
    console.error('Failed to remove word from favorites after deletion:', e)
  }

  return value
}

// 🏷 Убрать id категории из словарей после её удаления из справочника.
// Иначе в карточках остаётся «висячая» ссылка на несуществующую категорию:
// числовые id отображаются цифрами вместо названия (см. categoryLabel).
//  - без userEmail: общий словарь + все личные словари пользователей
//    (админ удалил основную категорию);
//  - с userEmail: только словарь этого пользователя (удаление своей категории).
// Возвращает количество обновлённых файлов.
export const removeCategoryFromAllWords = async (categoryId: string | number, userEmail: string | null = null) => {
  const idStr = String(categoryId)
  const stripWord = (word) => {
    const cat = word?.category
    if (cat == null || cat === '') return word
    if (Array.isArray(cat)) {
      const next = cat.filter(v => String(v) !== idStr)
      return next.length === cat.length ? word : { ...word, category: next }
    }
    return String(cat) === idStr ? { ...word, category: [] } : word
  }

  const files: string[] = []
  if (userEmail) {
    const ownFile = getDictionaryFileNameForEmail(userEmail)
    if (!ownFile) return 0
    files.push(ownFile)
  } else {
    files.push(DATA_FILE)
    // Личные словари пользователей (шаблон не захватывает архив public/users/_deleted/)
    try {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`
      const resp = await fetch(url, { headers: getHeaders(), cache: 'no-cache' })
      if (resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data.tree)) {
          for (const item of data.tree) {
            if (item.type === 'blob' && /^public\/users\/[^/]+\/dictionary\.json$/.test(item.path)) {
              files.push(item.path)
            }
          }
        }
      }
    } catch (e) {
      console.error('removeCategoryFromAllWords: не удалось получить список словарей:', e)
    }
  }

  let updated = 0
  for (const fileName of files) {
    try {
      const { data, sha } = await fetchGitHubFile(fileName)
      if (!sha || !Array.isArray(data)) continue
      const next = data.map(stripWord)
      if (next.some((w, i) => w !== data[i])) {
        await updateGitHubFile(fileName, next, sha)
        updated++
      }
    } catch (e) {
      console.error(`removeCategoryFromAllWords: не удалось обновить ${fileName}:`, e)
    }
  }
  return updated
}

// 🌐 Оффлайн-перемещение: применяем к кэшу и ставим в очередь как
// полный порядок id (reorder) — так перемещение воспроизводится
// надёжно при синхронизации, независимо от исходного порядка на сервере
const applyOfflineMove = (fileName, user, reorderArr) => {
  enqueueOfflineChange({ type: 'reorder', fileName, order: reorderArr.map(w => w.id) })
  const email = getCacheEmail(user)
  if (email) {
    const cached = getCachedDictionary(email)
    if (Array.isArray(cached)) {
      cacheDictionaryForOffline(email, applyOfflineChange(cached, { type: 'reorder', order: reorderArr.map(w => w.id) }))
    }
  }
  return true
}

// 🌐 Получить email для оффлайн-кэша из user (объект пользователя или строка)
const getCacheEmail = (user) => {
  if (!user) return null
  return typeof user === 'string' ? user : (user.email || null)
}

// 🌐 При отсутствии сети читаем список из кэша для проверки позиции/перемещения
const getCachedArray = (user) => {
  const email = getCacheEmail(user)
  if (!email) return []
  const cached = getCachedDictionary(email)
  return Array.isArray(cached) ? cached : []
}

// Общий онлайн-путь перемещений: одно чтение + одна запись вместо цепочки
// «read → backup → format check → PUT → verify».
const moveWordOnline = async (
  fileName: string,
  id: unknown,
  transform: (next: any[], idx: number) => boolean,
  missingThrows = false
) => {
  const { changed } = await mutateDictionaryFile(fileName, arr => {
    const idx = wordIndexById(arr, id)
    if (idx === -1) {
      if (missingThrows) throw new Error('Запись не найдена или доступ запрещён')
      return { next: arr, changed: false }
    }
    const next = [...arr]
    if (!transform(next, idx)) return { next: arr, changed: false }
    return { next, changed: true }
  })
  return changed
}

export const moveWordUp = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx <= 0) return false
    const reordered = [...arr]
    ;[reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]]
    return applyOfflineMove(fileName, user, reordered)
  }
  return moveWordOnline(fileName, id, (next, idx) => {
    if (idx <= 0) return false
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    return true
  })
}

export const moveWordDown = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1 || idx >= arr.length - 1) return false
    const reordered = [...arr]
    ;[reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]]
    return applyOfflineMove(fileName, user, reordered)
  }
  return moveWordOnline(fileName, id, (next, idx) => {
    if (idx >= next.length - 1) return false
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    return true
  })
}

export const moveWordToTop = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx <= 0) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.unshift(item)
    return applyOfflineMove(fileName, user, reordered)
  }
  return moveWordOnline(fileName, id, (next, idx) => {
    if (idx <= 0) return false
    const [item] = next.splice(idx, 1)
    next.unshift(item)
    return true
  })
}

export const moveWordToBottom = async (id, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1 || idx >= arr.length - 1) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.push(item)
    return applyOfflineMove(fileName, user, reordered)
  }
  return moveWordOnline(fileName, id, (next, idx) => {
    if (idx >= next.length - 1) return false
    const [item] = next.splice(idx, 1)
    next.push(item)
    return true
  })
}

// Переместить карточку на указанную позицию (1-индексная)
export const moveWordToPosition = async (id, position, user = null) => {
  const fileName = getWriteFileName(user)
  if (!isOnline()) {
    const arr = getCachedArray(user)
    const idx = arr.findIndex(w => w.id === id)
    if (idx === -1) throw new Error('Запись не найдена или доступ запрещён')
    const target = Math.min(Math.max(parseInt(position, 10) - 1, 0), arr.length - 1)
    if (idx === target) return false
    const reordered = [...arr]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(target, 0, item)
    return applyOfflineMove(fileName, user, reordered)
  }
  return moveWordOnline(fileName, id, (next, idx) => {
    const target = Math.min(Math.max(parseInt(position, 10) - 1, 0), next.length - 1)
    if (idx === target) return false
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    return true
  }, true)
}

// 🌐 Синхронизация: воспроизводит все отложенные оффлайн-изменения для
// указанного файла на GitHub. Вызывается при возврате соединения.
export const flushOfflineChanges = async (user: any = null) => {
  const fileName = getWriteFileName(user)
  const all = getOfflineChanges()

  // 📱💻 Привязка устройств при оффлайн-входе: обновляем users.json
  const bindChanges = all.filter(c => c.type === 'bind_device')
  if (bindChanges.length > 0) {
    try {
      const { data: users, sha, ok } = await fetchGitHubFile(USERS_FILE)
      if (ok && Array.isArray(users)) {
        let changed = false
        for (const c of bindChanges) {
          const u = users.find(x => x?.email?.toLowerCase() === String(c.email || '').toLowerCase())
          if (u && Array.isArray(u.devices) && c.device?.id && !u.devices.some(d => d.id === c.device.id)) {
            u.devices = [...u.devices, c.device]
            changed = true
          }
        }
        if (changed) {
          await safeUpdateGitHubFile(USERS_FILE, users, sha)
          removeOfflineChanges(bindChanges.map(c => c.queuedAt))
        }
      }
    } catch (e) {
      console.error('flushOfflineChanges bind_device error:', e)
    }
  }

  // 🖼️ Фото «Рунной раскладки» на сервер НЕ синхронизируется: оно хранится
  // только локально (IndexedDB + blob-URL) и нужно лишь этому устройству.

  const mine = all.filter(c => c.fileName === fileName)
  if (mine.length === 0) return 0

  const { data: dict, sha, ok, encrypted } = await fetchGitHubFile(fileName)
  if (!ok) throw new Error('Не удалось прочитать файл для синхронизации')
  let arr = Array.isArray(dict) ? [...dict] : []
  const applied: number[] = []
  for (const change of mine) {
    const before = arr
    arr = applyOfflineChange(arr, change)
    // applyOfflineChange всегда возвращает новый массив: сравниваем ссылки
    // элементов, а не JSON.stringify всего словаря (1 МБ на каждую запись).
    if (arr.length !== before.length || arr.some((w, i) => w !== before[i])) {
      applied.push(change.queuedAt)
    }
  }
  await updateGitHubFile(fileName, arr, sha, { encrypted: encrypted ?? true, pretty: false })
  removeOfflineChanges(applied)
  return applied.length
}
