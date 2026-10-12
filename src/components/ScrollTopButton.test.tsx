// src/components/ScrollTopButton.test.tsx
// Тесты кнопки «Наверх»: есть в разметке, крутит .runes-dictionary-section,
// без него — window.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ScrollTopButton from './ScrollTopButton'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ScrollTopButton', () => {
  it('рендерится с подписью «Наверх» и доступным именем', () => {
    render(<ScrollTopButton />)
    const btn = screen.getByRole('button', { name: 'Вернуться наверх страницы' })
    expect(btn).toHaveTextContent('Наверх')
    expect(btn).toHaveClass('scroll-top-btn')
  })

  it('крутит вверх .runes-dictionary-section, если он есть', () => {
    const section = document.createElement('div')
    section.className = 'runes-dictionary-section'
    section.scrollTo = vi.fn() as unknown as typeof section.scrollTo
    document.body.appendChild(section)
    const windowSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(<ScrollTopButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться наверх страницы' }))

    expect(section.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(windowSpy).not.toHaveBeenCalled()
  })

  it('без секции крутит window', () => {
    const windowSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(<ScrollTopButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться наверх страницы' }))

    expect(windowSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})
