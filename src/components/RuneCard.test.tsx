// src/components/RuneCard.test.tsx
// Карточка руны: свежезагруженная картинка живёт в репозитории сразу, но сборка
// GitHub Pages обновляется с задержкой — до деплоя локальный URL даёт 404, и
// карточка берёт картинку с raw.githubusercontent. Если не загрузилась и она —
// блок «Отображение Силы Руны» скрывается целиком: alt-текст с названием руны не
// должен вылезать в карточку как «лишняя надпись».
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

// Файл уже в репозитории, но ещё не в собранном сайте — резервный источник
const RAW_SRC = 'https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/images/n_runy/01_FAIS-SU.png'

afterEach(cleanup)

describe('RuneCard — блок «Отображение Силы Руны»', () => {
  it('показывает картинку с подписью, пока она загружается', () => {
    render(<RuneCard rune={rune} />)
    const img = screen.getByAltText('ФАИС-СУ')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('01_FAIS-SU.png')
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('если картинки ещё нет в сборке сайта — берёт её с raw.githubusercontent', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    // Картинка не пропала: подставлен raw-URL — видно сразу после загрузки файла
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toBe(RAW_SRC)
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('если не загрузилась ни с сайта, ни с raw — прячет блок вместе с alt-текстом', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ')) // локальный URL (404)
    fireEvent.error(screen.getByAltText('ФАИС-СУ')) // raw тоже недоступен
    // alt-текст («лишняя надпись») и подпись больше не показываются
    expect(screen.queryByAltText('ФАИС-СУ')).toBeNull()
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
    // остальные поля карточки продолжают отображаться
    expect(screen.getByText('Описание Силы Руны:')).toBeInTheDocument()
    expect(screen.getByText('Ключевые слова:')).toBeInTheDocument()
  })

  it('при смене картинки (новый URL) снова начинает с URL сайта', () => {
    const { rerender } = render(<RuneCard rune={rune} imageSrc="/images/n_runy/01_FAIS-SU.png" />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toBe(RAW_SRC)
    // Новая картинка после перезаливки — другой URL, попытки повторяются с начала
    rerender(<RuneCard rune={rune} imageSrc="/images/n_runy/01_FAIS-SU_new.png" />)
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toBe('/images/n_runy/01_FAIS-SU_new.png')
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
