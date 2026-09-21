// src/theme.test.ts — регрессионные проверки пурпурной палитры:
// токены обеих тем заданы в CSS, в них нет чёрного/серого, переключатель
// темы запоминает выбор пользователя.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getSavedTheme, getSystemTheme, initTheme, setTheme, type Theme } from './theme'

const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

// Токены, объявленные внутри блока (блок заканчивается на его закрывающей скобке)
function blockVars(blockStart: RegExp): Map<string, string> {
  const m = css.match(blockStart)
  if (!m || m.index === undefined) return new Map()
  const open = css.indexOf('{', m.index)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') {
      depth--
      if (depth === 0) {
        const body = css.slice(open + 1, i)
        return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]))
      }
    }
  }
  return new Map()
}

// Первый :root-блок — светлая тема; :root[data-theme="dark"] — тёмная
const lightVars = blockVars(/:root\s*\{/)
const darkVars = blockVars(/:root\[data-theme="dark"\]\s*\{/)

function hexRgb(h: string): [number, number, number] | null {
  const s = h.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(s)) return null
  return [0, 2, 4].map((i) => parseInt(s.slice(i + 1, i + 3), 16)) as [number, number, number]
}

function isNeutral(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 510
  const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255))
  return s < 0.14 || (l < 0.14 && s < 0.4)
}

describe('пурпурная палитра (без чёрного и серого)', () => {
  it.each([['light', lightVars], ['dark', darkVars]] as [Theme, Map<string, string>][])(
    'тема %s: токены фонов/текста объявлены и не нейтральные',
    (_theme, vars) => {
      for (const name of ['--bg', '--app-bg', '--text', '--text-h', '--surface', '--on-accent']) {
        const v = vars.get(name)
        expect(v, `${name} объявлен`).toBeTruthy()
        const rgb = hexRgb(v!)
        if (rgb) expect(isNeutral(rgb), `${name}=${v} не чёрный/серый`).toBe(false)
      }
    },
  )

  it('светлая тема: фон и поверхности — заданные пурпурные значения', () => {
    expect(lightVars.get('--app-bg')?.toLowerCase()).toBe('#7b1fa2')
    expect(lightVars.get('--bg')?.toLowerCase()).toBe('#f6f0fd')
  })

  it('тёмная тема: глубокий фиолетовый, а не «почти чёрный»', () => {
    expect(darkVars.get('--app-bg')?.toLowerCase()).toBe('#331a4f')
    expect(darkVars.get('--bg')?.toLowerCase()).toBe('#2b0f47')
  })

  it.each([['light', lightVars], ['dark', darkVars]] as [Theme, Map<string, string>][])(
    'тема %s: семантические пары заданы и различимы (текст читаем на фоне)',
    (_theme, vars) => {
      const accent = vars.get('--app-accent')?.toLowerCase()
      const onAccent = vars.get('--on-accent')?.toLowerCase()
      const errBg = vars.get('--error-bg')?.toLowerCase()
      const errText = vars.get('--error-text')?.toLowerCase()
      expect(accent).toBeTruthy()
      expect(onAccent).toBeTruthy()
      expect(onAccent).not.toBe(accent)
      expect(errText).not.toBe(errBg)
    },
  )
})

describe('переключатель темы (theme.ts)', () => {
  const originalMatchMedia = window.matchMedia
  const savedHtmlTheme = document.documentElement.getAttribute('data-theme')

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    if (savedHtmlTheme) document.documentElement.setAttribute('data-theme', savedHtmlTheme)
    else document.documentElement.removeAttribute('data-theme')
  })

  it('по умолчанию берёт системную тему', () => {
    window.matchMedia = (() => ({ matches: false }) as unknown as MediaQueryList) as typeof window.matchMedia
    expect(getSystemTheme()).toBe('light')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme запоминает выбор и ставит data-theme на <html>', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getSavedTheme()).toBe('dark')
  })
})
