// src/components/admin/RunesTab.test.tsx
// Превью картинки руны после загрузки: файл уже в репозитории, но сборка
// GitHub Pages обновится позже. Поэтому сразу после загрузки превью берётся с
// raw.githubusercontent — с меткой времени, т.к. под тем же именем файла и
// Pages, и Service Worker ещё отдают старую версию (иначе админ видел бы старую
// картинку). Затем резерв — URL сайта, затем превью скрывается.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import RunesTab from './RunesTab'

vi.mock('../../hooks/useScrollRestoration', () => ({ useScrollRestoration: vi.fn() }))

const EMPTY_FORM = {
  name: '', graphic: '', letter: '', image: '',
  power: '', keywords: '', description: '', textAlign: 'center',
}

const IMAGE = '01_FAIS-SU.png'
// Резервный источник (файл из репозитория) и URL собранного сайта
const RAW = `https://raw.githubusercontent.com/kodan76-creator/runy-dic/main/public/images/n_runy/${IMAGE}`
const LOCAL = `/images/n_runy/${IMAGE}`

afterEach(cleanup)

function renderTab({
  image = IMAGE,
  runeImageFresh = null,
}: { image?: string, runeImageFresh?: { path: string, ts: number } | null } = {}) {
  const props = {
    runes: [],
    runeFormData: { ...EMPTY_FORM, name: 'ФАИС-СУ', image },
    setRuneFormData: vi.fn(),
    runeEditingId: null,
    setRuneEditingId: vi.fn(),
    audioUploading: '',
    getImageSrc: (fileName: string, folder: string) => `/images/${folder}/${fileName}`,
    runeImageFresh,
    handleRuneSubmit: vi.fn(e => e.preventDefault()),
    handleEditRune: vi.fn(),
    handleDeleteRune: vi.fn(),
    handleMoveRuneUp: vi.fn(),
    handleMoveRuneDown: vi.fn(),
    handleMoveRuneToTop: vi.fn(),
    handleMoveRuneToEnd: vi.fn(),
    handleRuneImageUpload: vi.fn(),
    handleRuneImageDelete: vi.fn(),
  }
  return render(<RunesTab {...props} />)
}

const preview = () => screen.getByAltText('Превью картинки руны')
const noPreview = () => screen.queryByAltText('Превью картинки руны')

describe('RunesTab — превью картинки руны', () => {
  it('свежая загрузка: показывает raw с меткой времени (обход кэшей Pages и SW)', () => {
    renderTab({ runeImageFresh: { path: IMAGE, ts: 1234567890 } })
    expect(preview().getAttribute('src')).toBe(`${RAW}?v=1234567890`)
  })

  it('без свежей загрузки начинает с URL сайта, raw — только резерв', () => {
    renderTab()
    expect(preview().getAttribute('src')).toBe(LOCAL)
    fireEvent.error(preview())
    expect(preview().getAttribute('src')).toBe(RAW)
  })

  it('если не загрузилось ни с сайта, ни с raw — превью скрывается', () => {
    renderTab()
    fireEvent.error(preview())
    fireEvent.error(preview())
    expect(noPreview()).toBeNull()
  })

  it('свежая загрузка: резервные варианты — URL сайта, затем скрытие', () => {
    renderTab({ runeImageFresh: { path: IMAGE, ts: 42 } })
    fireEvent.error(preview())              // raw?=42 не отдался
    expect(preview().getAttribute('src')).toBe(LOCAL)
    fireEvent.error(preview())              // фото с сайта ещё не задеплоено
    expect(preview().getAttribute('src')).toBe(RAW)
    fireEvent.error(preview())              // и raw недоступен — прячем
    expect(noPreview()).toBeNull()
  })

  it('картинка другой руны: метка свежести не подходит, начинаем с URL сайта', () => {
    renderTab({ runeImageFresh: { path: '02_OTHER.png', ts: 42 } })
    expect(preview().getAttribute('src')).toBe(LOCAL)
  })

  it('без картинки превью не показывается', () => {
    renderTab({ image: '' })
    expect(noPreview()).toBeNull()
  })
})