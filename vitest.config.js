// vitest.config.js
// Конфигурация тестов: jsdom-окружение + jest-dom matchers.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: false,
    // Юнит-тесты живут в src/. Playwright e2e-спеки в корне (admin-mobile-check.spec.js) сюда не входят.
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
  },
})
