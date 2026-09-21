// src/api/registrationNotify.ts
// Уведомление администраторам о новой регистрации пользователя.
//
// Почему так устроено: браузер не может отправлять письма сам — в коде сайта
// нет SMTP-доступа и нельзя хранить секреты почтового ящика. Поэтому фронтенд
// лишь инициирует событие репозитория (repository_dispatch → user_registered),
// а письмо отправляет workflow `.github/workflows/notify-admins.yml` в
// GitHub Actions, где лежат SMTP-секреты и список адресов администраторов.
//
// Модуль самодостаточный (не импортирует client.ts): регистрация не должна
// зависеть от тяжёлого сетевого слоя, а unit-тесты — от его моков.
//
// Вызов не блокирует регистрацию: notifyRegistration никогда не бросает
// исключений — при любой проблеме возвращает { ok: false, reason }.
import { GITHUB_OWNER, GITHUB_REPO, TOKEN } from './constants'

export const REGISTRATION_NOTIFY_EVENT = 'user_registered'
export const REGISTRATION_NOTIFY_APP = 'runy-dic'

const FETCH_TIMEOUT_MS = 15000

export interface NotifyResult {
  ok: boolean
  reason?: string
}

export interface NotifyDeps {
  /** Токен GitHub (по умолчанию — токен приложения из constants). */
  token?: string | undefined
  owner?: string
  repo?: string
  /** fetch-реализация (для тестов подменяется стабом). */
  fetchImpl?: typeof fetch
}

/** Тело dispatch-события — чистая функция, покрыта тестами. */
export const buildDispatchBody = (email: string, createdAt: string) => ({
  event_type: REGISTRATION_NOTIFY_EVENT,
  client_payload: {
    app: REGISTRATION_NOTIFY_APP,
    email,
    createdAt,
  },
})

/** fetch с таймаутом: событие не должно «висеть» при недоступном API. */
const fetchWithTimeout = (fetchImpl: typeof fetch, url: string, options: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetchImpl(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  )
}

/**
 * Сообщить администраторам о регистрации пользователя.
 * Никогда не бросает исключений.
 */
export const notifyRegistration = async (
  email: string,
  createdAt: string,
  deps: NotifyDeps = {},
): Promise<NotifyResult> => {
  const token = deps.token !== undefined ? deps.token : TOKEN
  if (!token) return { ok: false, reason: 'no-token' }
  if (!email) return { ok: false, reason: 'no-email' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, reason: 'offline' }
  }

  const owner = deps.owner ?? GITHUB_OWNER
  const repo = deps.repo ?? GITHUB_REPO
  const fetchImpl = deps.fetchImpl ?? fetch

  try {
    const send = (): Promise<Response> =>
      fetchWithTimeout(fetchImpl, `https://api.github.com/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildDispatchBody(email, createdAt)),
      })

    let response: Response
    try {
      response = await send()
    } catch {
      // Короткий сетевой «чих» — одна повторная попытка, как в client.ts.
      response = await send()
    }

    if (!response.ok) {
      const err: unknown = await response.json().catch(() => ({}))
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : response.statusText
      throw new Error(`HTTP ${response.status}: ${msg}`)
    }

    return { ok: true }
  } catch (error) {
    // Тихо: регистрация уже состоялась, письмо — приятное дополнение.
    const msg = error instanceof Error ? error.message : String(error || '')
    console.warn(`Notify registration: не удалось инициировать письмо администраторам (${msg})`)
    return { ok: false, reason: 'error' }
  }
}
