// src/components/admin/DictionaryTab.test.tsx
// Тесты вкладки «Словарь»: строка добавления СВОЕЙ категории стоит в самом верху
// блока категорий, свои личные категории идут выше основных (новая — первая),
// а удалять можно только личные категории.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DictionaryTab from './DictionaryTab'

const EMPTY_FORM = {
  word: '', transcription: '', translation: '', category: [],
  example: '', example2: '', transcription2: '', audio: '', audio2: '', textAlign: 'center',
}

// Порядок как из getCategories: личные категории (API помечает их __personal)
// идут первыми — самая новая сверху, — затем основные.
const CATEGORIES = [
  { id: 'u9', name: 'Моя', __personal: true },
  { id: 'c1', name: 'устаревшая форма' },
  { id: 'c2', name: 'частица' },
]

function renderTab(overrides = {}) {
  const props = {
    words: [],
    searchTerm: '',
    setSearchTerm: vi.fn(),
    formData: { ...EMPTY_FORM },
    setFormData: vi.fn(),
    categories: CATEGORIES,
    editingId: null,
    setEditingId: vi.fn(),
    loading: false,
    error: '',
    audioUploading: null,
    isRecording: null,
    handleSubmit: vi.fn(e => e.preventDefault()),
    handleAudioUpload: vi.fn(),
    handleAudioRecord: vi.fn(),
    handlePlayAudio: vi.fn(),
    handleAudioDelete: vi.fn(),
    loadWords: vi.fn(),
    onImport: vi.fn(),
    canManageOwnCategories: true,
    handleAddOwnCategory: vi.fn(async (name: string) => ({ id: 'u10', name })),
    handleDeleteOwnCategory: vi.fn(async () => true),
    onDismissError: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<DictionaryTab {...props} />) }
}

const getOwnRow = (container: HTMLElement) => container.querySelector('.category-checkboxes') as HTMLElement

describe('DictionaryTab: своя категория', () => {
  it('строка «Своя категория...» стоит в самом верху блока категорий', () => {
    const { container } = renderTab()
    const box = getOwnRow(container)
    // Первый элемент блока — именно строка добавления, а не чекбокс категории
    expect(box.firstElementChild).toHaveClass('own-category-row')
    expect([...box.children].map(el => el.className)).toEqual([
      'own-category-row',
      'cat-row cat-row-own',
      'cat-row',
      'cat-row',
    ])
    // И в документе поле идёт раньше первого чекбокса
    const input = screen.getByLabelText('Название своей категории')
    const firstCheckbox = box.querySelector('input[type="checkbox"]') as HTMLElement
    expect(input.compareDocumentPosition(firstCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('своя (личная) категория стоит выше основных категорий', () => {
    const { container } = renderTab()
    const box = getOwnRow(container)
    const ownRow = box.querySelector('.cat-row-own') as HTMLElement
    const mainRow = [...box.querySelectorAll('.cat-row')].find(el => !el.classList.contains('cat-row-own')) as HTMLElement
    expect(ownRow.compareDocumentPosition(mainRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('удалить можно только личную категорию (· моя)', async () => {
    const { container, props } = renderTab()
    const deleteButtons = screen.getAllByRole('button', { name: /Удалить мою категорию/ })
    expect(deleteButtons).toHaveLength(1)
    // Кнопка есть только у строки личной категории
    expect(container.querySelector('.cat-row-own .cat-own-delete')).not.toBeNull()
    fireEvent.click(deleteButtons[0])
    await waitFor(() => expect(props.handleDeleteOwnCategory).toHaveBeenCalledWith('u9'))
  })

  it('новая категория создаётся и сразу отмечается в карточке', async () => {
    const { props } = renderTab()
    const input = screen.getByLabelText('Название своей категории') as HTMLInputElement
    const addBtn = screen.getByRole('button', { name: 'Добавить свою категорию' })
    // Пока название не введено — кнопка неактивна
    expect(addBtn).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Моё слово' } })
    fireEvent.click(addBtn)

    await waitFor(() => expect(props.handleAddOwnCategory).toHaveBeenCalledWith('Моё слово'))
    // Новая категория сразу попала в набор карточки, поле очищено
    expect(props.setFormData).toHaveBeenCalledWith(expect.objectContaining({ category: ['u10'] }))
    expect(input.value).toBe('')
  })

  it('Enter в поле тоже добавляет категорию', async () => {
    const { props } = renderTab()
    const input = screen.getByLabelText('Название своей категории')
    fireEvent.change(input, { target: { value: 'Своя' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(props.handleAddOwnCategory).toHaveBeenCalledWith('Своя'))
  })

  it('без прав на свои категории строки добавления и удаления не показываются', () => {
    const { container } = renderTab({ canManageOwnCategories: false })
    expect(container.querySelector('.own-category-row')).toBeNull()
    expect(container.querySelector('.cat-own-delete')).toBeNull()
    // Личная категория остаётся в списке как обычная
    expect(container.querySelectorAll('.cat-row')).toHaveLength(3)
  })

  it('ошибка формы гаснет при вводе нового названия и по «Отмена»', () => {
    const onDismissError = vi.fn()
    renderTab({ editingId: 7, error: 'Такая категория уже есть', onDismissError })

    // Пока ошибку показывает форма
    expect(screen.getByText('Такая категория уже есть')).toBeInTheDocument()

    // Начали вводить новое название — прежнее предупреждение больше не актуально
    fireEvent.change(screen.getByLabelText('Название своей категории'), { target: { value: 'Новая' } })
    expect(onDismissError).toHaveBeenCalledTimes(1)

    // «Отмена» тоже сбрасывает предупреждение
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onDismissError).toHaveBeenCalledTimes(2)
  })
})
// 🎤 Запись аудио слова с микрофона: кнопка стоит рядом с 📎-загрузкой MP3
describe('DictionaryTab: запись аудио с микрофона', () => {
  it('кнопка 🎤 запускает запись для поля «Аудио»', () => {
    const handleAudioRecord = vi.fn()
    renderTab({ handleAudioRecord })
    fireEvent.click(screen.getByRole('button', { name: 'Записать аудио с микрофона' }))
    expect(handleAudioRecord).toHaveBeenCalledWith('audio')
  })

  it('во время записи кнопка останавливает её, а вторая кнопка заблокирована', () => {
    const handleAudioRecord = vi.fn()
    renderTab({ handleAudioRecord, isRecording: 'audio' })
    fireEvent.click(screen.getByRole('button', { name: 'Остановить запись аудио' }))
    expect(handleAudioRecord).toHaveBeenCalledWith('audio')
    expect(screen.getByRole('button', { name: 'Записать второе аудио с микрофона' })).toBeDisabled()
  })

  it('пользователю с ограниченными правами кнопка записи тоже доступна', () => {
    renderTab({ canManageOwnCategories: false })
    expect(screen.getByRole('button', { name: 'Записать аудио с микрофона' })).toBeEnabled()
  })
})

// ▶️ Прослушивание уже загруженного/записанного аудио
describe('DictionaryTab: прослушивание аудио', () => {
  it('▶️ проигрывает файл из поля «Аудио»', () => {
    const handlePlayAudio = vi.fn()
    renderTab({ handlePlayAudio, formData: { ...EMPTY_FORM, audio: 'sun_runy.webm' } })

    fireEvent.click(screen.getByRole('button', { name: 'Прослушать аудио' }))

    expect(handlePlayAudio).toHaveBeenCalledWith('sun_runy.webm')
  })

  it('▶️ второго аудио проигрывает свой файл', () => {
    const handlePlayAudio = vi.fn()
    renderTab({
      handlePlayAudio,
      formData: { ...EMPTY_FORM, audio: 'sun_runy.webm', audio2: 'sun_r_prim.webm' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Прослушать второе аудио' }))

    expect(handlePlayAudio).toHaveBeenCalledWith('sun_r_prim.webm')
  })

  it('без файла кнопки прослушивания не показываются', () => {
    renderTab()

    expect(screen.queryByRole('button', { name: 'Прослушать аудио' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Прослушать второе аудио' })).toBeNull()
  })
})

// 📌 Нижние кнопки формы не должны уезжать за экран окна: поля формы лежат в отдельной
// прокручиваемой обёртке .form-fields, а блок кнопок — её сосед внутри <form>, поэтому
// при увеличении полей прокручиваются только поля, а кнопки остаются внизу и на виду.
describe('DictionaryTab: поля прокручиваются, кнопки остаются на виду', () => {
  it('обе колонки полей лежат внутри прокручиваемой обёртки .form-fields', () => {
    const { container } = renderTab()
    const form = container.querySelector('form.word-form') as HTMLFormElement
    const fields = form.querySelector(':scope > .form-fields') as HTMLElement

    expect(fields).not.toBeNull()
    expect([...fields.children].map(el => el.className)).toEqual([
      'form-column form-column-left',
      'form-column form-column-right',
    ])
  })

  it('кнопки «Обновить/Отмена» — сосед полей, а не часть прокручиваемой области', () => {
    const { container } = renderTab({ editingId: 7 })
    const form = container.querySelector('form.word-form') as HTMLFormElement
    const fields = form.querySelector(':scope > .form-fields') as HTMLElement
    const buttons = form.querySelector(':scope > .form-buttons') as HTMLElement

    expect(buttons).not.toBeNull()
    expect(fields.contains(buttons)).toBe(false)

    const saveBtn = screen.getByRole('button', { name: 'Обновить' })
    const cancelBtn = screen.getByRole('button', { name: 'Отмена' })
    expect(buttons.contains(saveBtn)).toBe(true)
    expect(buttons.contains(cancelBtn)).toBe(true)
    expect(fields.contains(saveBtn)).toBe(false)
    expect(fields.contains(cancelBtn)).toBe(false)
    // Кнопки идут после полей — значит визуально остаются внизу формы
    expect(buttons.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
})

