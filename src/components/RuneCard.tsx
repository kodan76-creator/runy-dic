// src/components/RuneCard.tsx
// Карточка руны на главном экране (раздел «Новые Руны»)
import { buildImageUrl } from '../api/images'
import '../App.css'

export default function RuneCard({ rune }) {
  if (!rune) return null
  const imgUrl = buildImageUrl(rune.image || '', '')

  return (
    <div className={`rune-card align-${rune.textAlign || 'center'}`}>
      <div className="rune-card-body">
        {rune.name && <h3 className="rune-card-name">{rune.name}</h3>}
        {rune.graphic && (
          <div className="rune-card-glyph" title="Графическое изображение">
            {rune.graphic}
          </div>
        )}
        {rune.letter && <div className="rune-card-letter">Буква: {rune.letter}</div>}
        {imgUrl && (
          <div className="rune-card-power-image">
            <span className="rune-card-label">Отображение Силы Руны:</span>
            <img className="rune-image" src={imgUrl} alt={rune.name || 'Руна'} loading="lazy" />
          </div>
        )}
        {rune.power && (
          <div className="rune-card-power">
            <span>{rune.power}</span>
          </div>
        )}
        {rune.keywords && (
          <div className="rune-card-keywords">
            <span>{rune.keywords}</span>
          </div>
        )}
        {rune.description && (
          <div className="rune-card-desc">
            <span>{rune.description}</span>
          </div>
        )}
      </div>
    </div>
  )
}
