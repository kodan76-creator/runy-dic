// src/components/RuneCard.test.tsx
// Карточка руны — raw-first: картинка берётся с raw.githubusercontent (файл в
// репозитории доступен сразу после коммита), а URL собранного сайта — резерв
// (оффлайн / raw недоступен). Версия rune.imageUpdatedAt подставляется как
// ?v=…: при замене картинки под тем же именем иначе браузер/CDN/SW отдали бы
// старую копию с кодом 200 (ошибки нет — фолбэк бы не сработал). Если не
// загрузилось ничего — блок «Отображение Силы Руны» скрывается целиком:
// alt-текст с названием руны не должен вылезать как «лишняя надпись».
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

// Основной источник картинки — raw (сразу после коммита), резерв — сайт
const RAW_SRC = 'https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/images/n_runy/01_FAIS-SU.png'
const LOCAL_SRC = expect.stringContaining('/images/n_runy/01_FAIS-SU.png')

afterEach(cleanup)

describe('RuneCard — блок «Отображение Силы Руны»', () => {
  it('показывает raw-картинку с подписью, пока она загружается', () => {
    render(<RuneCard rune={rune} />)
    const img = screen.getByAltText('ФАИС-СУ')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toBe(RAW_SRC)
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('версия картинки подставляется как ?v=метка в raw-URL', () => {
    render(<RuneCard rune={{ ...rune, imageUpdatedAt: 1234567890 }} />)
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toBe(`${RAW_SRC}?v=1234567890`)
  })

  it('если raw недоступен (оффлайн) — берёт картинку с сайта', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    // Картинка не пропала: подставлен URL сайта
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toEqual(LOCAL_SRC)
    expect(screen.getByText('Отображение Силы Руны:')).toBeInTheDocument()
  })

  it('если не загрузилась ни с raw, ни с сайта — прячет блок вместе с alt-текстом', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ')) // raw недоступен
    fireEvent.error(screen.getByAltText('ФАИС-СУ')) // сайт тоже недоступен
    // alt-текст («лишняя надпись») и подпись больше не показываются
    expect(screen.queryByAltText('ФАИС-СУ')).toBeNull()
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
    // остальные поля карточки продолжают отображаться
    expect(screen.getByText('Описание Силы Руны:')).toBeInTheDocument()
    expect(screen.getByText('Ключевые слова:')).toBeInTheDocument()
  })

  it('при смене картинки (новый URL) снова начинает с raw', () => {
    const { rerender } = render(<RuneCard rune={rune} imageSrc="/images/n_runy/01_FAIS-SU.png" />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    expect(screen.queryByAltText('ФАИС-СУ')).toBeNull()
    // Новая картинка после перезаливки — другой rune.image, попытки повторяются с начала (raw)
    rerender(<RuneCard rune={{ ...rune, image: '01_FAIS-SU_new.png' }} />)
    expect(screen.getByAltText('ФАИС-СУ').getAttribute('src')).toContain('01_FAIS-SU_new.png')
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

  // ⚠️ Подсказка админке: файл отсутствует и на сайте, и на raw — раньше блок
  // просто молча исчезал, и было непонятно, куда делась картинка.
  it('админ видит подсказку, если картинки нет ни на сайте, ни на raw', () => {
    render(<RuneCard rune={rune} showMissingImageHint />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    expect(screen.queryByText('Отображение Силы Руны:')).toBeNull()
    expect(screen.getByText(/Картинка не найдена ни на сайте/)).toBeInTheDocument()
    expect(screen.getByText('01_FAIS-SU.png')).toBeInTheDocument()
  })

  it('на главной страницы подсказки нет — блок просто скрыт', () => {
    render(<RuneCard rune={rune} />)
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    fireEvent.error(screen.getByAltText('ФАИС-СУ'))
    expect(screen.queryByText(/Картинка не найдена/)).toBeNull()
  })

  it('подсказка не показывается, пока картинка грузится или её нет у руны', () => {
    const { rerender } = render(<RuneCard rune={rune} showMissingImageHint />)
    expect(screen.queryByText(/Картинка не найдена/)).toBeNull()
    rerender(<RuneCard rune={{ ...rune, image: '' }} showMissingImageHint />)
    expect(screen.queryByText(/Картинка не найдена/)).toBeNull()
  })
})
