// src/components/RuneCard.tsx
// Карточка руны на главном экране (раздел «Новые Руны»)
import { type ReactNode } from 'react'
import { buildImageUrl } from '../api/images'
import { renderRichText } from '../utils/richText'
import '../App.css'

function highlightText(text, term) {
  const str = text == null ? '' : String(text)
  if (!term || !str) return str
  const lower = str.toLowerCase()
  const t = term.toLowerCase()
  const nodes: ReactNode[] = []
  let i = 0
  let idx = lower.indexOf(t)
  if (idx === -1) return str
  let key = 0
  while (idx !== -1) {
    if (idx > i) nodes.push(str.slice(i, idx))
    nodes.push(<mark key={key++} className="rune-hl">{str.slice(idx, idx + t.length)}</mark>)
    i = idx + t.length
    idx = lower.indexOf(t, i)
  }
  if (i < str.length) nodes.push(str.slice(i))
  return nodes
}

export default function RuneCard({ rune, imageSrc = undefined, highlight = '', runicMode = false }) {
  if (!rune) return null
  const imgUrl = imageSrc ?? buildImageUrl(rune.image || '', '')
  // В рунном режиме подсвечиваем только графическое изображение
  const textHighlight = runicMode ? '' : highlight

  return (
    <div className={`rune-card align-${rune.textAlign || 'center'}`}>
      <div className="rune-card-body">
        {rune.name && <h3 className="rune-card-name">{highlightText(rune.name, textHighlight)}</h3>}
        {rune.graphic && (
          <div className="rune-card-glyph" title="Графическое изображение">
            {highlightText(rune.graphic, highlight)}
          </div>
        )}
        {rune.letter && <div className="rune-card-letter">Буква: {highlightText(rune.letter, textHighlight)}</div>}
        {imgUrl && (
          <div className="rune-card-power-image">
            <span className="rune-card-label">Отображение Силы Руны:</span>
            <img className="rune-image" src={imgUrl} alt={rune.name || 'Руна'} loading="lazy" />
          </div>
        )}
        {rune.power && (
          <div className="rune-card-power">
            <span className="rune-card-label">Описание Силы Руны:</span>
            <span>{highlightText(rune.power, textHighlight)}</span>
          </div>
        )}
        {rune.keywords && (
          <div className="rune-card-keywords">
            <span className="rune-card-label">Ключевые слова:</span>
            <span>{highlightText(rune.keywords, textHighlight)}</span>
          </div>
        )}
        {rune.description && (
          <div className="rune-card-desc">
            <span className="rune-card-label">Описание:</span>
            <span dangerouslySetInnerHTML={{ __html: renderRichText(rune.description, textHighlight) }} />
          </div>
        )}
      </div>
    </div>
  )
}
