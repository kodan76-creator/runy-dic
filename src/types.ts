// src/types.ts
// Общие доменные типы приложения.
// Поля помечены как необязательные, т.к. данные приходят из JSON на GitHub
// и их состав может меняться от версии к версии.

export interface Word {
  id?: string
  word?: string
  translation?: string
  transcription?: string
  audio?: string
  audio2?: string
  runes?: string
  categories?: string[]
  createdAt?: string
  createdBy?: string
  [key: string]: unknown
}

/** Слово с пометкой источника (общий/личный словарь) — используется на главной. */
export interface DictionaryWord extends Word {
  __dictionarySource?: 'shared' | 'personal'
}

export interface Category {
  id?: string
  name?: string
  color?: string
  [key: string]: unknown
}

/** Карточка «Новых Рун» — отдельный словарь с рунами. */
export interface Rune {
  id?: string
  /** Название руны */
  name?: string
  /** Графическое изображение (отображается шрифтом Dao Rus) */
  graphic?: string
  /** Буква */
  letter?: string
  /** Отображение Силы Руны — картинка с прозрачным фоном */
  image?: string
  /** Описание Силы Руны */
  power?: string
  /** Ключевые слова */
  keywords?: string
  /** Описание (многострочное) */
  description?: string
  createdAt?: string
  createdBy?: string
  [key: string]: unknown
}

export type UserRole = 'admin' | 'user' | string

export interface User {
  id?: string
  email?: string
  passwordHash?: string
  role?: UserRole
  paid?: boolean
  name?: string
  createdAt?: string
  isBlocked?: boolean
  blockedAt?: string | null
  blockedBy?: string | null
  paidAt?: string | null
  paidBy?: string | null
  unpaidAt?: string | null
  unpaidBy?: string | null
  runesPaid?: boolean
  runesPaidAt?: string | null
  runesPaidBy?: string | null
  runesUnpaidAt?: string | null
  runesUnpaidBy?: string | null
  loginAt?: string
  [key: string]: unknown
}

export interface Admin {
  email?: string
  passwordHash?: string
  [key: string]: unknown
}

export interface Log {
  id?: string
  timestamp?: string
  action?: string
  userEmail?: string
  adminEmail?: string
  details?: string
  [key: string]: unknown
}

export interface FavoriteEntry {
  email?: string
  favorites?: string[]
  [key: string]: unknown
}

/** Результат чтения файла через GitHub Contents API. */
export interface GitHubFileResult<T = unknown> {
  data: T
  sha: string | null
  ok: boolean
  exists: boolean | null
}

export interface GitHubRawResult {
  data: string | null
  sha: string | null
}
