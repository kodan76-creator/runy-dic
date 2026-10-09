// src/components/RuneCard.tsx
// Карточка руны на главном экране (раздел «Новые Руны»)
import { useState, useEffect, type ReactNode } from 'react'
import { type Rune } from '../types'
import { buildImageUrl, buildRuneImageUrls } from '../api/images'
import { RUNES_IMAGE_DIR } from '../api/constants'
import { getOfflineBlob } from '../api/offlineContent'
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
  /**
   * 🖨️ Печать: карточка рендерится в скрытом контейнере (display: none),
   * поэтому loading="lazy" не даёт браузеру загрузить картинку до печати.
   * Для печатных страниц грузим изображение сразу (loading="eager").
   */
  eagerImage?: boolean
  /**
   * ⚠️ Админка: показывать подсказку, если картинка не найдена ни на сайте, ни
   * на raw.githubusercontent (например, файл удалили из репозитория, а ссылка
   * осталась в runes.json). На главной остаётся тихое скрытие блока.
   */
  showMissingImageHint?: boolean
}

export default function RuneCard({ rune, imageSrc = undefined, highlight = '', runicMode = false, showMissingImageHint = false, eagerImage = false }: RuneCardProps) {
  // 🙈 URL картинки, которая не загрузилась уже и с резерва. Без этого в
  // карточке рядом с битой иконкой вылезал alt-текст с названием руны —
  // выглядело как «лишняя надпись». Сравниваем с текущим imgUrl, поэтому при
  // смене картинки (новый URL) попытка загрузки повторяется автоматически.
  const [failedUrl, setFailedUrl] = useState('')
  // 🖼️ Локальный URL, для которого показываем резерв (см. fallbackSrc ниже).
  const [localFallbackFor, setLocalFallbackFor] = useState('')
  // 💾 URL, отданный из локального хранилища (IndexedDB) — оффлайн-копия,
  // сохранённая фоновой загрузкой (offlineContent). Приоритетнее сети: если
  // файл уже скачан, не ждём сеть/raw и не зависим от кэша Service Worker.
  const [offlineSrc, setOfflineSrc] = useState('')
  if (!rune) return null
  const fallbackBase = imageSrc ?? buildImageUrl(rune.image || '', RUNES_IMAGE_DIR)
  // 🖼️ Raw-first: файл уже в репозитории сразу после коммита, а сборка сайта
  // на GitHub Pages обновляется с задержкой. Метка rune.imageUpdatedAt
  // подставляется как ?v=… — при замене картинки под тем же именем иначе
  // браузер/CDN/SW отдали бы старую копию с 200 (ошибки нет — фолбэк бы
  // не сработал). Тот же приём, что для аудио в useAudioPlayback.
  const { primary: rawSrc, fallback: localSrc } = imageSrc
    ? { primary: fallbackBase, fallback: '' }
    : buildRuneImageUrls(rune)
  const usingLocal = !!localSrc && localSrc !== rawSrc && localFallbackFor === rawSrc
  // Локальная копия (offlineContent) важнее сети: отдаём её, если есть.
  const imgUrl = offlineSrc || (usingLocal ? localSrc : rawSrc)
  // В рунном режиме подсвечиваем только графическое изображение
  const textHighlight = runicMode ? '' : highlight

  // 💾 Проверяем локальное хранилище оффлайн-контента: если картинка уже
  // скачана фоновой загрузкой — показываем её без обращения к сети.
  // Ищем по обоим вариантам URL (raw и локальный): фоновая загрузка могла
  // сохранить любой из них в зависимости от того, что было доступно.
  useEffect(() => {
    if (!rawSrc && !localSrc) return
    let cancelled = false
    ;(async () => {
      for (const candidate of [localSrc, rawSrc]) {
        if (!candidate) continue
        const blob = await getOfflineBlob(candidate)
        if (blob && !cancelled) {
          const objectUrl = URL.createObjectURL(blob)
          setOfflineSrc(objectUrl)
          return
        }
      }
    })()
    return () => { cancelled = true }
  }, [rawSrc, localSrc])

  // 🧹 Освобождаем blob-URL при размонтировании/смене картинки.
  useEffect(() => {
    if (!offlineSrc) return
    return () => URL.revokeObjectURL(offlineSrc)
  }, [offlineSrc])

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
        {/* failedUrl === imgUrl: картинка не загрузилась ни с сайта, ни с raw —
            прячем весь блок, чтобы вместо иконки не показывался alt-текст */}
        {imgUrl && failedUrl !== imgUrl && (
          <div className="rune-card-power-image">
            <span className="rune-card-label">Отображение Силы Руны:</span>
            <img
              className="rune-image"
              src={imgUrl}
              alt={rune.name || 'Руна'}
              loading={eagerImage ? 'eager' : 'lazy'}
              onError={() => {
                // Raw недоступен (оффлайн / raw лёг) — пробуем локальный URL
                // сайта; если и он не загрузился, прячем блок целиком, чтобы
                // не показывать alt-текст
                if (!usingLocal && localSrc && localSrc !== rawSrc) setLocalFallbackFor(rawSrc)
                else setFailedUrl(imgUrl)
              }}
            />
          </div>
        )}
        {/* ⚠️ Админка: обе ссылки не ответили — показываем, что файла нет на
            сервере (иначе блок просто исчезал бы без объяснений) */}
        {showMissingImageHint && !!localSrc && failedUrl === imgUrl && (
          <div className="rune-card-missing-image">
            ⚠️ Картинка не найдена ни на сайте, ни на raw.githubusercontent:{' '}
            <code>{rune.image || localSrc}</code>
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
