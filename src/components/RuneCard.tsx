// src/components/RuneCard.tsx
// Карточка руны на главном экране (раздел «Новые Руны»)
import { useState, type ReactNode } from 'react'
import { type Rune } from '../types'
import { buildImageUrl, buildRawImageUrl } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
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

type RuneCardProps = {
  rune?: Rune | null
  /** Готовый URL картинки (админка); если не передан — строится из rune.image */
  imageSrc?: string
  highlight?: string
  runicMode?: boolean
  hidePower?: boolean
}

export default function RuneCard({ rune, imageSrc = undefined, highlight = '', runicMode = false, hidePower = false }: RuneCardProps) {
  // 🙈 URL картинки, которая не загрузилась уже и с raw-фолбэка. Без этого в
  // карточке рядом с битой иконкой вылезал alt-текст с названием руны —
  // выглядело как «лишняя надпись». Сравниваем с текущим imgUrl, поэтому при
  // смене картинки (новый URL) попытка загрузки повторяется автоматически.
  const [failedUrl, setFailedUrl] = useState('')
  // 🖼️ Локальный URL, для которого показываем raw-фолбэк (см. rawSrc ниже).
  const [rawFallbackFor, setRawFallbackFor] = useState('')
  if (!rune) return null
  const localSrc = imageSrc ?? buildImageUrl(rune.image || '', RUNES_IMAGE_DIR)
  // 🛡️ Файл уже в репозитории (его только что загрузили в админке), но сборка
  // сайта на GitHub Pages ещё не обновилась — до деплоя локальный URL даёт 404.
  // Показываем картинку с raw.githubusercontent: она доступна сразу после
  // коммита (тот же приём, что для аудио в useAudioPlayback).
  const rawSrc = buildRawImageUrl(rune.image || '', RUNES_IMAGE_DIR)
  const usingRaw = !!rawSrc && rawSrc !== localSrc && rawFallbackFor === localSrc
  const imgUrl = usingRaw ? rawSrc : localSrc
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
        {/* hidePower: в модалке раскладки не показываем ни «Отображение Силы Руны», ни «Описание Силы Руны».
            failedUrl === imgUrl: картинка не загрузилась ни с сайта, ни с raw — прячем весь
            блок, чтобы вместо иконки не показывался alt-текст */}
        {imgUrl && !hidePower && failedUrl !== imgUrl && (
          <div className="rune-card-power-image">
            <span className="rune-card-label">Отображение Силы Руны:</span>
            <img
              className="rune-image"
              src={imgUrl}
              alt={rune.name || 'Руна'}
              loading="lazy"
              onError={() => {
                // Локальный URL ещё не в сборке сайта — пробуем raw; если и он не
                // загрузился, прячем блок целиком, чтобы не показывать alt-текст
                if (!usingRaw && rawSrc && rawSrc !== localSrc) setRawFallbackFor(localSrc)
                else setFailedUrl(imgUrl)
              }}
            />
          </div>
        )}
        {rune.power && !hidePower && (
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
