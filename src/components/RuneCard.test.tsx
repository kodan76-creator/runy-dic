// src/components/RuneCard.test.tsx
// Карточка руны: при ошибке загрузки картинки (404 во время деплоя GitHub Pages)
// блок «Отображение Силы Руны» скрывается целиком — alt-текст с названием руны
// не должен вылезать в карточку как «лишняя надпись».
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import RuneCard from './RuneCard'

const rune = {
  name: 'ФАИС-СУ',
  graphic: 'Ŧ',
  letter: 'Ф',
  image: '01_FAIS-SU.png',
  power: 'Гармония стихий в человеке использует духовную энергию',
  keywords: 'Состояние, состоятельность',
}

afterEach(cleanup)

describe('RuneCard — блок «Отображение Силы Руны»', () => {
  it('показывает картинку с подписью, пока она загружается', () => {
    render(<RuneCard rune={rune} />)
    const img = screen.getByAltText('ФАИС-СУ')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('01_FAIS-SU.png')
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('после ошибки загрузки прячет блок вместе с alt-текстом', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    // alt-текст («лишняя надпись») и подпись больше не показываются
    expect(screen.queryByAltText('ФАИС-СУ')).toBeNull()
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
    // остальные поля карточки продолжают отображаться
    expect(screen.getByText('Описание Силы Руны:')).toBeInTheDocument()
    expect(screen.getByText('Ключевые слова:')).toBeInTheDocument()
  })

  it('при смене картинки (новый URL) показывает её снова', () => {
    const { rerender } = render(<RuneCard rune={rune} imageSrc="/images/n_runy/01_FAIS-SU.png" />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    expect(screen.queryByAltText('ФАИС-СУ')).toBeNull()
    // Новая картинка после перезаливки — другой URL, попытка загрузки повторяется
    rerender(<RuneCard rune={rune} imageSrc="/images/n_runy/01_FAIS-SU_new.png" />)
    expect(screen.getByAltText('ФАИС-СУ')).toBeInTheDocument()
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('для руны без картинки блок не показывается', () => {
    render(<RuneCard rune={{ ...rune, image: '' }} />)
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
  })

  it('hidePower не показывает блок даже с валидной картинкой', () => {
    render(<RuneCard rune={rune} hidePower />)
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
  })
})
