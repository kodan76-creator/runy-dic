// src/setupTests.ts
// Настройка тестов: расширенные матчеры jest-dom (@testing-library/jest-dom).
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Явная очистка DOM между тестами (при globals:false авто-cleanup RTL не срабатывает).
afterEach(() => {
  cleanup()
})
