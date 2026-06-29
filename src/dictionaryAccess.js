export const getDictionaryFileNameForEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase()
  const atIndex = normalized.indexOf('@')
  if (atIndex <= 0) return `${normalized || 'user'}.json`
  return `${normalized.slice(0, atIndex)}.json`
}

export const resolveDictionaryFile = (user) => {
  if (!user) return 'user.json'
  if (typeof user === 'string') {
    return getDictionaryFileNameForEmail(user)
  }
  if (user.role === 'admin') return 'dictionary.json'
  if (user.role === 'user' && user.paid) return 'dictionary.json'
  return getDictionaryFileNameForEmail(user.email)
}
