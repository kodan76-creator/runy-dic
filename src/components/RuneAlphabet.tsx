// src/components/RuneAlphabet.tsx
// 🅰 Подраздел «Алфавит» раздела «Новые Руны»: «Рунный алфавит Гоч®а
// Эльборсибо» — 32 знака с названиями и звуками и три текста с оригинального
// листа. Карточки выложены тремя вертикальными рядами — как на листе.
//
// Знаки показываем картинками через OfflineImage (IndexedDB → сеть → кэш SW),
// поэтому раздел одинаково работает онлайн и оффлайн. Клик по карточке открывает
// модалку с описанием руны — как в «Рунной раскладке», но без шапки: только
// кнопка «Закрыть» и карточка RuneCard.
import { useState, type CSSProperties } from 'react'
import { buildImageUrl } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
import { type Rune } from '../types'
import OfflineImage from './OfflineImage'
import RuneCard from './RuneCard'
import {
  RUNE_ALPHABET_COLUMNS,
  RUNE_ALPHABET_DATE,
  RUNE_ALPHABET_TEXTS,
  RUNE_ALPHABET_TEXTS_TITLE,
  RUNE_ALPHABET_TITLE,
  RUNE_ALPHABET_VERSES,
  type RuneAlphabetLetter,
} from '../data/runeAlphabet'
import '../App.css'

// Сквозная нумерация знаков 1–32 по порядку колонок листа
const COLUMN_OFFSETS = [0, 10, 22]

type RuneAlphabetProps = {
  /** Каталог рун из runes.json — по нему открывается описание знака */
  runes?: Rune[]
}

export default function RuneAlphabet({ runes = [] }: RuneAlphabetProps) {
  // 🔮 Знак, по карточке которого открыта модалка описания
  const [selected, setSelected] = useState<RuneAlphabetLetter | null>(null)
  // ✨ Знак, чьё «проявление» показано на тач-экране: на мобильном нет hover,
  // поэтому первый тап по карточке зажигает сияние со строкой, а второй —
  // открывает описание. Сбрасываем в null при выборе другой карточки.
  const [touched, setTouched] = useState<string | null>(null)

  // Первый тап на тач-экране — зажечь «проявление», второй — открыть описание.
  // На десктопе с мышью hover показывает сияние сам (через :hover в CSS),
  // а клик сразу открывает модалку — проверяем тип указателя.
  const handleCardClick = (letter: RuneAlphabetLetter) => {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
    if (coarsePointer && touched !== letter.name) {
      setTouched(letter.name)
      return
    }
    setTouched(null)
    setSelected(letter)
  }

  // Знак алфавита ↔ руна каталога:
  // 1) точное имя из поля `rune` (у знаков-перевёртышей — запись
  //    «НАЗВАНИЕ (перевернутое положение)» в runes.json);
  // 2) запасной вариант — совпадение названия (регистронезависимо).
  const findRune = (letter: RuneAlphabetLetter): Rune | undefined => {
    if (letter.rune) {
      const target = letter.rune.trim().toLowerCase()
      const exact = runes.find(r => (r.name || '').trim().toLowerCase() === target)
      if (exact) return exact
    }
    return runes.find(r => (r.name || '').trim().toLowerCase() === letter.name.toLowerCase())
  }

  const selectedRune = selected ? findRune(selected) : undefined
  const closeModal = () => setSelected(null)

  return (
    <div className="rune-alphabet">
      <h2 className="rune-alphabet-title">{RUNE_ALPHABET_TITLE}</h2>
      <div className="rune-alphabet-ornament" aria-hidden="true">⬦ ✦ ⬦</div>

      <div className="rune-alphabet-grid">
        {RUNE_ALPHABET_COLUMNS.map((column, ci) => (
          <ol className="rune-alphabet-column" key={COLUMN_OFFSETS[ci]}>
            {column.map((letter, li) => {
              // Сквозная нумерация 1–32 — в порядке колонок листа
              const n = COLUMN_OFFSETS[ci] + li + 1
              const verse = RUNE_ALPHABET_VERSES[n - 1]
              return (
                <li key={letter.name}>
                  <button
                    type="button"
                    className={`rune-alphabet-card${touched === letter.name ? ' rune-alphabet-card-touched' : ''}`}
                    style={{ animationDelay: `${Math.min(n - 1, 31) * 35}ms` } as CSSProperties}
                    onClick={() => handleCardClick(letter)}
                    aria-haspopup="dialog"
                    aria-label={`Описание руны ${letter.name}`}
                  >
                    <span className="rune-alphabet-index" aria-hidden="true">{n}</span>
                    <OfflineImage
                      src={buildImageUrl(letter.image, `${RUNES_IMAGE_DIR}/runy`)}
                      alt={`Знак ${letter.name}`}
                      className="rune-alphabet-glyph"
                    />
                    <span className="rune-alphabet-name">{letter.name}</span>
                    <span className="rune-alphabet-sound">[{letter.sound}]</span>
                    {/* ✨ «Сияние проявления»: строка текста, который проявляет
                       рунный алфавит. На десктопе вспыхивает при :hover, на
                       тач-экране — при первом тапе (класс -touched). */}
                    {verse && (
                      <span className="rune-alphabet-verse" aria-hidden="true">
                        <span className="rune-alphabet-verse-text">{verse}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        ))}
      </div>

      <section className="rune-alphabet-texts">
        <h3 className="rune-alphabet-texts-title">{RUNE_ALPHABET_TEXTS_TITLE}</h3>
        <ol className="rune-alphabet-texts-list">
          {RUNE_ALPHABET_TEXTS.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
        <p className="rune-alphabet-date">{RUNE_ALPHABET_DATE}</p>
      </section>

      {/* 🔮 Модалка описания — как в «Рунной раскладке», но без шапки:
         липкая полоса с кнопкой «Закрыть» справа + карточка RuneCard.
         ⚠️ Полоса непрозрачная (фон модалки): иначе при прокрутке рамка
         карточки заезжает под кнопку и кажется, что кнопка лежит на рамке. */}
      {selected && (
        <div
          className="modal-backdrop"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`Описание руны ${selected.name}`}
        >
          <div
            className="filter-modal rune-alphabet-rune-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rune-alphabet-rune-bar">
              <button
                type="button"
                className="rune-alphabet-rune-close"
                onClick={closeModal}
                aria-label="Закрыть"
                title="Закрыть"
              >
                ✕
              </button>
            </div>
            {selectedRune ? (
              <RuneCard rune={selectedRune} />
            ) : (
              <p className="rune-alphabet-rune-missing">
                Описание руны «{selected.name}» пока не добавлено.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
