// src/api/auth.js
// Аутентификация и управление пользователями/администраторами
import { USERS_FILE, ADMINS_FILE } from './constants'
import { fetchGitHubFile, updateGitHubFile } from './client'
import { addLog } from './logs'
import { ensureUserAudioFolder } from './audio'
import { ensureUserDictionaryFile } from './dictionary'

export const hashPassword = async (password) => {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    console.error('Hash error:', e)
    throw e
  }
}

// 🔐 АДМИНЫ
export const getAdmins = async () => {
  const { data } = await fetchGitHubFile(ADMINS_FILE)
  return Array.isArray(data) ? data : []
}

export const verifyAdmin = async (email, password) => {
  try {
    if (!email || !password) return null
    const users = await getUsers()
    const user = users.find(u => u?.email?.toLowerCase() === email?.toLowerCase())
    if (user?.role === 'admin') {
      const inputHash = await hashPassword(password)
      if (inputHash === user.passwordHash) {
        ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on admin login:', e))
        ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on admin login:', e))
        const { passwordHash: _, ...safeUser } = user
        return { ...safeUser, role: 'admin', loginAt: new Date().toISOString() }
      }
    }
    const admins = await getAdmins()
    const admin = admins.find(a => a?.email?.toLowerCase() === email?.toLowerCase())
    if (!admin) return null
    const inputHash = await hashPassword(password)
    if (inputHash !== admin.passwordHash) return null
    ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on admin login:', e))
    ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on admin login:', e))
    return { email: admin.email, role: 'admin', loginAt: new Date().toISOString() }
  } catch (e) {
    console.error('verifyAdmin error:', e)
    return null
  }
}

// 👥 ПОЛЬЗОВАТЕЛИ
export const getUsers = async () => {
  const { data } = await fetchGitHubFile(USERS_FILE)
  return Array.isArray(data) ? data : []
}

export const registerUser = async (email, password) => {
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new Error('Введите корректный email, например: user@mail.ru')
  }
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  if (users.some(u => u?.email?.toLowerCase() === email?.toLowerCase())) {
    throw new Error('Пользователь с таким email уже существует')
  }
  const passwordHash = await hashPassword(password)
  const newUser = {
    id: Date.now().toString(),
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    role: 'user',
    paid: false,
    paidAt: null,
    paidBy: null,
    unpaidAt: null,
    unpaidBy: null,
    isBlocked: false,
    blockedAt: null,
    blockedBy: null
  }
  await updateGitHubFile(USERS_FILE, [...users, newUser], sha)
  addLog({ action: 'register', userEmail: email, details: 'Регистрация' }).catch(() => {})
  ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on register:', e))
  ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on register:', e))
  const { passwordHash: _, ...safeUser } = newUser
  // ✅ Возвращаем с role: 'user'
  return { ...safeUser, role: 'user' }
}

export const verifyUser = async (email, password) => {
  try {
    if (!email || !password) return null
    const users = await getUsers()
    const user = users.find(u => u?.email?.toLowerCase() === email?.toLowerCase())
    if (!user) return null
    if (user.isBlocked) throw new Error('Аккаунт заблокирован. Для разблокировки обратитесь к администратору.')
    const inputHash = await hashPassword(password)
    if (inputHash !== user.passwordHash) return null

    addLog({ action: 'login', userEmail: email, details: 'Вход' }).catch(() => {})
    ensureUserAudioFolder(email).catch(e => console.error('Failed to create user audio folder on login:', e))
    ensureUserDictionaryFile(email).catch(e => console.error('Failed to create user dictionary file on login:', e))

    const { passwordHash: _, ...safeUser } = user
    return { ...safeUser, role: user.role || 'user' }
  } catch (e) {
    console.error('verifyUser error:', e)
    throw e
  }
}

export const logoutUser = async (userEmail) => {
  if (userEmail) addLog({ action: 'logout', userEmail, details: 'Выход' }).catch(() => {})
}

export const blockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const updated = users.map(u =>
    u.id === userId ? { ...u, isBlocked: true, blockedAt: new Date().toISOString(), blockedBy: adminEmail } : u
  )
  await updateGitHubFile(USERS_FILE, updated, sha)
  addLog({ action: 'user_blocked', userEmail: users.find(u => u.id === userId)?.email, adminEmail }).catch(() => {})
}

export const unblockUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const updated = users.map(u =>
    u.id === userId ? { ...u, isBlocked: false, blockedAt: null, blockedBy: null } : u
  )
  await updateGitHubFile(USERS_FILE, updated, sha)
  addLog({ action: 'user_unblocked', userEmail: users.find(u => u.id === userId)?.email, adminEmail }).catch(() => {})
}

export const updateUser = async (userId, updatedData, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const user = users.find(u => u.id === userId)
  if (!user) throw new Error('Пользователь не найден')

  const email = String(updatedData.email || '').trim()
  if (!email) throw new Error('Email не может быть пустым')
  if (!['admin', 'user'].includes(updatedData.role)) throw new Error('Некорректная роль пользователя')

  const duplicate = users.find(u =>
    u.id !== userId && String(u?.email || '').toLowerCase() === email.toLowerCase()
  )
  if (duplicate) throw new Error('Пользователь с таким email уже существует')

  const paid = Boolean(updatedData.paid)
  const now = new Date().toISOString()
  const updated = users.map(u => {
    if (u.id !== userId) return u

    const previousPaid = Boolean(u.paid)
    const next = {
      ...u,
      email,
      role: updatedData.role,
      paid,
    }

    if (previousPaid !== paid) {
      if (paid) {
        next.paidAt = now
        next.paidBy = adminEmail
        next.unpaidAt = u.unpaidAt || null
        next.unpaidBy = u.unpaidBy || null
      } else {
        next.unpaidAt = now
        next.unpaidBy = adminEmail
        next.paidAt = u.paidAt || null
        next.paidBy = u.paidBy || null
      }
    }

    return next
  })
  await updateGitHubFile(USERS_FILE, updated, sha)
  addLog({
    action: 'user_updated',
    userEmail: email,
    adminEmail,
    details: `role=${updatedData.role}, paid=${paid}, paidAt=${updated.find(u => u.id === userId)?.paidAt || '-'}, unpaidAt=${updated.find(u => u.id === userId)?.unpaidAt || '-'}`
  }).catch(() => {})

  const changed = updated.find(u => u.id === userId)
  const { passwordHash: _, ...safeUser } = changed
  return safeUser
}

export const deleteUser = async (userId, adminEmail) => {
  const { data: users, sha } = await fetchGitHubFile(USERS_FILE)
  const user = users.find(u => u.id === userId)
  const filtered = users.filter(u => u.id !== userId)
  await updateGitHubFile(USERS_FILE, filtered, sha)
  addLog({ action: 'user_deleted', userEmail: user?.email, adminEmail }).catch(() => {})
}
