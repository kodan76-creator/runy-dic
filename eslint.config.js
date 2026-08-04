import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Отключаем JS-вариант правила — используем TS-версию
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // На динамических данных из GitHub JSON удобно оставлять явные any
      '@typescript-eslint/no-explicit-any': 'off',
      // Выражения вида arr[idx] = {...} в скриптах миграции
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  // Конфигурационные файлы и Playwright-спеки выполняются в Node
  {
    files: ['**/*.config.{js,ts}', '**/*.spec.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
