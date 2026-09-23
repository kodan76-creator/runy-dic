// src/App.test.tsx
// Контроль сессий в App: удалённый администратором пользователь разлогинивается
// при опросе users.json; сбой чтения файла сессию не трогает, расхождение
// sessionVersion разлогинивает с прежним сообщением.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

// Тяжёлые экраны мокаем — тесту важна только логика контроля сессии в App.
vi.mock('./pages/Home', () => ({ default: () => <div>HOME_SCREEN</div> }))
vi.mock('./AdminPanel', () => ({ default: () => <div>ADMIN_SCREEN</div> }))
vi.mock('./components/UserAuthForm', () => ({ default: () => <div>AUTH_FORM</div> }))

const mockGetUsersStatus = vi.hoisted(() => vi.fn())
vi.mock('./githubApi', () => ({ getUsersStatus: mockGetUsersStatus }))

const SAVED_USER = { email: 'user@example.com', role: 'user', sessionVersion: 0 }

describe('App — контроль сессии', () => {
  beforeEach(() => {
    // HashRouter помнит маршрут между тестами — сбрасываем, иначе стартовый
    // рендер уходит на '/auth' и опрос сессии стартует дважды (Navigate→'/').
    window.location.hash = ''
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    localStorage.setItem('currentUser', JSON.stringify(SAVED_USER))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('пользователь, удалённый из users.json, разлогинивается при опросе', async () => {
    // Файл прочитан успешно, но записи нашего пользователя в нём больше нет
    mockGetUsersStatus.mockResolvedValue({
      users: [{ email: 'other@example.com', sessionVersion: 0 }],
      ok: true,
      exists: true,
    })
    render(<App />)
    // До ответа сервера пользователь видит главный экран
    expect(screen.getByText('HOME_SCREEN')).toBeInTheDocument()
    // Опрос не нашёл пользователя → локальная сессия очищена
    await waitFor(() => expect(localStorage.getItem('currentUser')).toBeNull())
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/удалена/))
    // И показана форма входа
    await screen.findByText('AUTH_FORM')
  })

  it('расхождение sessionVersion — разлогин с прежним сообщением', async () => {
    mockGetUsersStatus.mockResolvedValue({
      users: [{ email: 'user@example.com', sessionVersion: 1 }],
      ok: true,
      exists: true,
    })
    render(<App />)
    await waitFor(() => expect(localStorage.getItem('currentUser')).toBeNull())
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/отключён/))
    await screen.findByText('AUTH_FORM')
  })

  it('сбой чтения users.json (ok:false) не разлогинивает', async () => {
    mockGetUsersStatus.mockResolvedValue({ users: [], ok: false, exists: null })
    render(<App />)
    // Опрос выполнен, но ok:false — сессия не трогается
    await waitFor(() => expect(mockGetUsersStatus).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(localStorage.getItem('currentUser')).not.toBeNull()
    expect(screen.getByText('HOME_SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('AUTH_FORM')).toBeNull()
    expect(window.alert).not.toHaveBeenCalled()
  })
})