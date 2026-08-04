// src/components/ErrorBoundary.jsx
// Граница ошибок: перехватывает ошибки рендера и жизненного цикла дочерних
// компонентов и показывает понятное сообщение вместо пустого/сломанного экрана.
import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, message: error instanceof Error ? error.message : 'Неизвестная ошибка' }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>⚠️ Что-то пошло не так</h2>
          <p>{this.state.message}</p>
          <button type="button" onClick={this.handleReset}>Попробовать снова</button>
        </div>
      )
    }
    return this.props.children
  }
}
