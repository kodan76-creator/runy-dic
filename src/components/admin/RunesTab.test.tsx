// src/components/admin/RunesTab.test.tsx
// Превью картинки руны — raw-first с версией: файл уже в репозитории сразу
// после коммита, а сборка GitHub Pages обновляется позже. Поэтому превью
// начинается с raw.githubusercontent (с ?v=метка: под тем же именем файла
// браузер/CDN иначе отдали бы старую версию). Резерв — URL сайта, затем
// превью скрывается.
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
  imageUpdatedAt = 0,
  runeImageFresh = null,
}: {
  image?: string,
  imageUpdatedAt?: number,
  runeImageFresh?: { path: string, ts: number } | null
} = {}) {
  const props = {
    runes: [],
    runeFormData: { ...EMPTY_FORM, name: 'ФАИС-СУ', image, imageUpdatedAt },
    setRuneFormData: vi.fn(),
    runeEditingId: null,
    setRuneEditingId: vi.fn(),
    audioUploading: '',
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

describe('RunesTab — превью картинки руны (raw-first)', () => {
  it('начинает с raw, резерв — URL сайта', () => {
    renderTab()
    expect(preview().getAttribute('src')).toBe(RAW)
    fireEvent.error(preview())              // raw недоступен (оффлайн)
    expect(preview().getAttribute('src')).toBe(LOCAL)
  })

  it('сохранённая версия подставляется как ?v=метка в raw-URL', () => {
    renderTab({ imageUpdatedAt: 1234567890 })
    expect(preview().getAttribute('src')).toBe(`${RAW}?v=1234567890`)
  })

  it('свежая загрузка в сессии: метка сессии вместо записанной версии', () => {
    renderTab({ imageUpdatedAt: 111, runeImageFresh: { path: IMAGE, ts: 1234567890 } })
    expect(preview().getAttribute('src')).toBe(`${RAW}?v=1234567890`)
  })

  it('если не загрузилось ни с raw, ни с сайта — превью скрывается', () => {
    renderTab()
    fireEvent.error(preview())
    fireEvent.error(preview())
    expect(noPreview()).toBeNull()
  })

  it('свежая загрузка: резервные варианты — URL сайта, затем скрытие', () => {
    renderTab({ runeImageFresh: { path: IMAGE, ts: 42 } })
    fireEvent.error(preview())              // raw?=42 не отдался
    expect(preview().getAttribute('src')).toContain(`${LOCAL}?v=42`)
    fireEvent.error(preview())              // и сайт недоступен — прячем
    expect(noPreview()).toBeNull()
  })

  it('картинка другой руны: метка свежести не подходит, берём записанную версию', () => {
    renderTab({ imageUpdatedAt: 777, runeImageFresh: { path: '02_OTHER.png', ts: 42 } })
    expect(preview().getAttribute('src')).toBe(`${RAW}?v=777`)
  })

  it('без картинки превью не показывается', () => {
    renderTab({ image: '' })
    expect(noPreview()).toBeNull()
  })
})