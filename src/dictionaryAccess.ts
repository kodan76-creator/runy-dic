import { emailToFolderName } from './api/audio'
import { USERS_DIR } from './api/constants'

// 📁 Личный словарь пользователя хранится в папке пользователя:
// public/users/<email_folder>/dictionary.json
export const getDictionaryFileNameForEmail = (email: string | null | undefined): string => {
  const folder = emailToFolderName(email)
  if (!folder) return 'user.json'
  return `${USERS_DIR}/${folder}/dictionary.json`
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
