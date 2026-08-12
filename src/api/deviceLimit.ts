// src/api/deviceLimit.ts
// 🚦 Ограничение регистраций по устройству:
// с одного устройства не более N регистраций в течение 24 часов.
//
// Устройство идентифицируется стабильным ID, сохранённым в localStorage.
// Это клиентский «мягкий» лимит — он сдерживает массовое создание аккаунтов
// с одного браузера/устройства, но не защищает от очистки localStorage.

const DEVICE_ID_KEY = 'runy-dic-device-id'
const REG_LOG_KEY = 'runy-dic-registrations'

export const MAX_REGISTRATIONS_PER_DAY = 5
const WINDOW_MS = 24 * 60 * 60 * 1000

// Возвращает стабильный ID устройства (сохраняется в localStorage при первом вызове).
export const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id =
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage недоступен — возвращаем случайный ID на текущую сессию.
    return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

// Метки времени регистраций с этого устройства за последние 24 часа.
const getRecentRegistrations = (): number[] => {
  try {
    const raw = localStorage.getItem(REG_LOG_KEY)
    const all: number[] = raw ? JSON.parse(raw) : []
    const cutoff = Date.now() - WINDOW_MS
    return all.filter((t) => t > cutoff)
  } catch {
    return []
  }
}

// Проверяет лимит. Бросает Error, если лимит исчерпан.
// Возвращает количество оставшихся регистраций на ближайшие сутки.
export const checkRegistrationLimit = (): number => {
  const recent = getRecentRegistrations()
  const remaining = MAX_REGISTRATIONS_PER_DAY - recent.length
  if (remaining <= 0) {
    throw new Error(
      `Превышен лимит регистраций: с одного устройства можно создать не более ${MAX_REGISTRATIONS_PER_DAY} аккаунтов в сутки. Попробуйте позже.`
    )
  }
  return remaining
}

// Фиксирует факт успешной регистрации с этого устройства.
export const recordRegistration = (): void => {
  try {
    const recent = getRecentRegistrations()
    recent.push(Date.now())
    localStorage.setItem(REG_LOG_KEY, JSON.stringify(recent))
  } catch {
    /* игнорируем — лимит продолжит работать по имеющимся записям */
  }
}
