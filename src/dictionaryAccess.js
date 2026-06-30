export const getDictionaryFileNameForEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase()
  const localPart = normalized.split('@')[0] || 'user'
  if (!localPart) return 'user.json'
  return `${localPart.replace(/[^a-z0-9._+-]+/g, '_')}.json`
}

export const resolveDictionaryFile = (user) => {
  if (!user) return 'user.json'
  if (typeof user === 'string') {
    return getDictionaryFileNameForEmail(user)
  }
  if (user.role === 'admin') return 'dictionary.json'
  // For role === 'user' always use per-user file (do not allow writing to shared dictionary.json)
  if (user.role === 'user') return getDictionaryFileNameForEmail(user.email)
  return 'user.json'
}
