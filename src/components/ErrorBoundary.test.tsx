// src/components/ErrorBoundary.test.tsx
// Тесты границы ошибок: перехват ошибки рендера и кнопка сброса.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom')
  return <div>ok content</div>
}

// React логирует ошибки рендера в console.error — заглушаем в тестах.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('ok content')).toBeInTheDocument()
  })

  it('catches render errors and shows fallback UI with the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('⚠️ Что-то пошло не так')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
  })

  it('reset button clears the error and re-renders children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('⚠️ Что-то пошло не так')).toBeInTheDocument()

    // Меняем детей на «безопасных» (в реальном приложении граница перерисовывает всё дерево).
    // Пока hasError=true граница всё ещё показывает fallback…
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('⚠️ Что-то пошло не так')).toBeInTheDocument()

    // …а после сброса перерисовывает уже безопасных детей.
    fireEvent.click(screen.getByText('Попробовать снова'))
    expect(screen.getByText('ok content')).toBeInTheDocument()
    expect(screen.queryByText('⚠️ Что-то пошло не так')).not.toBeInTheDocument()
  })
})
