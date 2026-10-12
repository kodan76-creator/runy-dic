// src/components/ScrollTopButton.test.tsx
// Тесты плавающей кнопки «Наверх»: скрыта вверху, появляется при прокрутке,
// рендерится порталом в body, крутит .runes-dictionary-section, без него —
// window.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ScrollTopButton from './ScrollTopButton'

const LABEL = 'Вернуться наверх страницы'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// Прокрутка раздела: задаём scrollTop прокручиваемому div и шлём событие
function scrollSection(section: HTMLElement, top: number) {
  Object.defineProperty(section, 'scrollTop', { value: top, configurable: true })
  fireEvent.scroll(section)
}

describe('ScrollTopButton', () => {
  it('скрыта, пока страницу не прокрутили', () => {
    render(<ScrollTopButton />)

    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
  })

  it('появляется при прокрутке раздела и рендерится в body (портал, справа внизу)', () => {
    const section = document.createElement('div')
    section.className = 'runes-dictionary-section'
    document.body.appendChild(section)
    render(<ScrollTopButton />)

    scrollSection(section, 400)

    const btn = screen.getByRole('button', { name: LABEL })
    expect(btn).toHaveTextContent('Наверх')
    expect(btn).toHaveClass('scroll-top-btn')
    // Портал: кнопка живёт прямо в body, а не внутри секции
    expect(btn.closest('.scroll-top-float')).not.toBeNull()
    expect(section.contains(btn)).toBe(false)
  })

  it('снова прячется, если вернуться наверх', () => {
    const section = document.createElement('div')
    section.className = 'runes-dictionary-section'
    document.body.appendChild(section)
    render(<ScrollTopButton />)

    scrollSection(section, 400)
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument()

    scrollSection(section, 0)
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
  })

  it('крутит вверх .runes-dictionary-section, если он есть', () => {
    const section = document.createElement('div')
    section.className = 'runes-dictionary-section'
    section.scrollTo = vi.fn() as unknown as typeof section.scrollTo
    document.body.appendChild(section)
    const windowSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(
      <div>
        <ScrollTopButton />
      </div>,
    )
    act(() => {
      scrollSection(section, 400)
    })
    fireEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(section.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(windowSpy).not.toHaveBeenCalled()
  })

  it('без секции крутит window', () => {
    const windowSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    // Нет .runes-dictionary-section — кнопку показываем прокруткой window
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true })

    render(<ScrollTopButton />)
    fireEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(windowSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})

