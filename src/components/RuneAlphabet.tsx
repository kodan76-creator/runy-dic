// src/components/RuneAlphabet.tsx
// 🅰 Подраздел «Алфавит» раздела «Новые Руны»: «Рунный алфавит Гоч®а а
// Эльборсибо» — 32 знака с названиями и звуками и три текста с оригинального
// листа. Карточки выложены тремя вертикальными рядами — как на листе.
//
// Знаки показываем картинками через OfflineImage (IndexedDB → сеть → кэш SW),
// поэтому раздел одинаково работает онлайн и оффлайн.
import { type CSSProperties } from 'react'
import { buildImageUrl } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
import OfflineImage from './OfflineImage'
import {
  RUNE_ALPHABET,
  RUNE_ALPHABET_DATE,
  RUNE_ALPHABET_TEXTS,
  RUNE_ALPHABET_TEXTS_TITLE,
  RUNE_ALPHABET_TITLE,
} from '../data/runeAlphabet'
import '../App.css'

export default function RuneAlphabet() {
  return (
    <div className="rune-alphabet">
      <h2 className="rune-alphabet-title">{RUNE_ALPHABET_TITLE}</h2>
      <div className="rune-alphabet-ornament" aria-hidden="true">⬦ ✦ ⬦</div>

      <ol className="rune-alphabet-grid">
        {RUNE_ALPHABET.map((letter, i) => (
          <li
            className="rune-alphabet-card"
            key={letter.name}
            style={{ animationDelay: `${Math.min(i, 31) * 35}ms` } as CSSProperties}
          >
            <span className="rune-alphabet-index" aria-hidden="true">{i + 1}</span>
            <OfflineImage
              src={buildImageUrl(letter.image, `${RUNES_IMAGE_DIR}/runy`)}
              alt={`Знак ${letter.name}`}
              className="rune-alphabet-glyph"
            />
            <span className="rune-alphabet-name">{letter.name}</span>
            <span className="rune-alphabet-sound">[{letter.sound}]</span>
          </li>
        ))}
      </ol>

      <section className="rune-alphabet-texts">
        <h3 className="rune-alphabet-texts-title">{RUNE_ALPHABET_TEXTS_TITLE}</h3>
        <ol className="rune-alphabet-texts-list">
          {RUNE_ALPHABET_TEXTS.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
        <p className="rune-alphabet-date">{RUNE_ALPHABET_DATE}</p>
      </section>
    </div>
  )
}
