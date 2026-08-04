// Тема приложения: светлая/тёмная, выбор запоминается в localStorage.
// data-theme="dark"|"light" ставится на <html> (устанавливает inline-скрипт в index.html,
// чтобы не было мигания, и initTheme ниже). Тёмные стили включены через [data-theme="dark"].

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'runy-dic-theme'

export function getSavedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'dark' || t === 'light' ? t : null
  } catch {
    return null
  }
}

export function getSystemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' ? 'dark' : 'light'
}

/** Явный выбор пользователя — запоминаем и применяем. */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* localStorage недоступен — просто применяем на текущую сессию */
  }
}

/** При старте применяет сохранённый выбор или системную тему (без сохранения,
 *  чтобы тема продолжала следовать за ОС, пока пользователь не выбрал сам). */
export function initTheme(): void {
  const saved = getSavedTheme()
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved)
  } else {
    document.documentElement.setAttribute('data-theme', getSystemTheme())
    // Следуем за системой, пока пользователь не сделает явный выбор
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        if (!getSavedTheme()) document.documentElement.setAttribute('data-theme', getSystemTheme())
      }
      mq.addEventListener('change', handler)
    } catch {
      /* matchMedia/addEventListener недоступны */
    }
  }
}
