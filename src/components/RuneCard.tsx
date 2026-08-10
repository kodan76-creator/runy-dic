// src/components/RuneCard.tsx
// Карточка руны на главном экране (раздел «Новые Руны»)
import { buildImageUrl } from '../api/images'
import '../App.css'

export default function RuneCard({ rune }) {
  if (!rune) return null
  const imgUrl = buildImageUrl(rune.image || '', '')

  return (
    <div className="rune-card">
      {imgUrl && (
        <div className="rune-card-image-wrap">
          <img className="rune-image" src={imgUrl} alt={rune.name || 'Руна'} loading="lazy" />
        </div>
      )}
      <div className="rune-card-body">
        {rune.name && <h3 className="rune-card-name">{rune.name}</h3>}
        {rune.graphic && (
          <div className="rune-card-glyph" title="Графическое изображение">
            {rune.graphic}
          </div>
        )}
        {rune.letter && <div className="rune-card-letter">Буква: {rune.letter}</div>}
        {rune.power && (
          <div className="rune-card-power">
            <span className="rune-card-label">Отображение Силы Руны:</span>
            <span>{rune.power}</span>
          </div>
        )}
        {rune.keywords && (
          <div className="rune-card-keywords">
            <span className="rune-card-label">Ключевые слова:</span>
            <span>{rune.keywords}</span>
          </div>
        )}
        {rune.description && <p className="rune-card-desc">{rune.description}</p>}
      </div>
    </div>
  )
}
