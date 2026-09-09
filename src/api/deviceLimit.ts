// src/api/deviceLimit.ts
// 🚦 Ограничение регистраций по устройству:
// с одного устройства не более N регистраций в течение 24 часов.
//
// Устройство идентифицируется стабильным ID, сохранённым в localStorage.
// Это клиентский «мягкий» лимит — он сдерживает массовое создание аккаунтов
// с одного браузера/устройства, но не защищает от очистки localStorage.
//
// Также ограничивает вход: после регистрации новый пользователь может входить
// только с 1 мобильного телефона и 1 компьютера (по одному устройству каждого типа).

const DEVICE_ID_KEY = 'runy-dic-device-id'
const REG_LOG_KEY = 'runy-dic-registrations'

export const MAX_REGISTRATIONS_PER_DAY = 5
const WINDOW_MS = 24 * 60 * 60 * 1000

// 🚦 Лимит устройств для входа: не более 1 устройства каждого типа (телефон/компьютер).
export const MAX_DEVICES_PER_TYPE = 1

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

// 📱💻 Определяет тип устройства: 'mobile' (телефон/планшет) или 'desktop' (компьютер).
export const getDeviceType = (): 'mobile' | 'desktop' => {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)
  return mobile ? 'mobile' : 'desktop'
}

// 🚦 Проверяет лимит устройств для входа: 1 телефон + 1 компьютер.
// Возвращает { allowed, devices, message?, isNewDevice? }.
// - Админы и пользователи, зарегистрированные до введения лимита (без поля devices),
//   не ограничиваются.
// - Известное устройство всегда разрешено.
// - Новое устройство того же типа, что уже привязано, — запрещено.
// - Новое устройство нового типа — разрешено и добавляется в список.
export const checkLoginDeviceLimit = (
  user: { role?: string; devices?: Array<{ id: string; type: string }> },
  deviceId: string,
  deviceType: 'mobile' | 'desktop',
): { allowed: boolean; devices: Array<{ id: string; type: string; addedAt: string; lastLoginAt: string | null }>; message?: string; isNewDevice?: boolean } => {
  // Админы не ограничены
  if (user?.role === 'admin') {
    return { allowed: true, devices: Array.isArray(user.devices) ? user.devices : [] }
  }

  // Пользователи без списка устройств (зарегистрированы до фичи) — лимит не применяем
  if (!Array.isArray(user?.devices)) {
    return { allowed: true, devices: [], isNewDevice: false }
  }

  const devices = user.devices

  // Уже известное устройство — разрешаем
  if (devices.some(d => d.id === deviceId)) {
    return { allowed: true, devices }
  }

  // Новое устройство: проверяем лимит по типу (1 телефон + 1 компьютер)
  const sameTypeCount = devices.filter(d => d.type === deviceType).length
  if (sameTypeCount >= MAX_DEVICES_PER_TYPE) {
    const label = deviceType === 'mobile' ? 'мобильного телефона' : 'компьютера'
    return {
      allowed: false,
      devices,
      message: `Вход разрешён только с 1 ${label}. Этот аккаунт уже используется на другом устройстве.`,
    }
  }

  // Новое устройство нового типа — добавляем
  const newDevices = [
    ...devices,
    { id: deviceId, type: deviceType, addedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() },
  ]
  return { allowed: true, devices: newDevices, isNewDevice: true }
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
