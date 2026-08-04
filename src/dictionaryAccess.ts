export const getDictionaryFileNameForEmail = (email: string | null | undefined): string => {
  const normalized = String(email || '').trim().toLowerCase()
  const localPart = normalized.split('@')[0] || 'user'
  if (!localPart) return 'user.json'
  return `${localPart.replace(/[^a-z0-9._+-]+/g, '_')}.json`
}

/** Пользователь для resolveDictionaryFile: email-строка или объект пользователя. */
export type DictionaryAccessUser = string | { role?: string; paid?: boolean; email?: string } | null | undefined

export const resolveDictionaryFile = (user: DictionaryAccessUser): string => {
  if (!user) return 'user.json'
  if (typeof user === 'string') {
    return getDictionaryFileNameForEmail(user)
  }
  if (user.role === 'admin') return 'dictionary.json'
  if (user.role === 'user' && user.paid) return 'dictionary.json'
  if (user.role === 'user') return getDictionaryFileNameForEmail(user.email)
  return 'user.json'
}
