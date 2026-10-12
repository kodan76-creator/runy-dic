// src/components/OfflineImage.tsx
// 🖼️ <img>, который сначала берёт картинку из локального оффлайн-хранилища
// (IndexedDB, offlineContent), а если её там нет — из сети.
//
// Зачем: плитки «Рунной раскладки» (крест) и другие картинки рендерились
// обычным <img src={…}> — оффлайн запрос уходил в сеть и падал с
// ERR_INTERNET_DISCONNECTED, хотя blob уже лежал в IndexedDB. Компонент
// подставляет objectURL из хранилища и только при его отсутствии грузит сеть.
import { useEffect, useState } from 'react'
import { getOfflineBlob } from '../api/offlineContent'

type OfflineImageProps = {
  src: string
  alt?: string
  className?: string
  draggable?: boolean
  loading?: 'lazy' | 'eager'
  onError?: () => void
}

export default function OfflineImage({
  src,
  alt = '',
  className,
  draggable = false,
  loading = 'lazy',
  onError,
}: OfflineImageProps) {
  // 💾 Локальный objectURL (из IndexedDB) — приоритетнее сети. Храним вместе
  // с src, для которого он был получен: при смене src старая копия «гасится»
  // сравнением в рендере, без синхронного сброса состояния в эффекте.
  const [offline, setOffline] = useState<{ forSrc: string; url: string } | null>(null)
  // Сеть: пробуем только если локальной копии для этого src нет.
  const [networkFor, setNetworkFor] = useState('')

  useEffect(() => {
    if (!src) return
    let cancelled = false
    ;(async () => {
      const blob = await getOfflineBlob(src).catch(() => null)
      if (cancelled) return
      if (blob) {
        setOffline({ forSrc: src, url: URL.createObjectURL(blob) })
      } else {
        // Локальной копии нет — грузим из сети
        setNetworkFor(src)
      }
    })()
    return () => { cancelled = true }
  }, [src])

  // 🧹 Освобождаем blob-URL при размонтировании/смене картинки.
  useEffect(() => {
    if (!offline) return
    return () => URL.revokeObjectURL(offline.url)
  }, [offline])

  // Копия от другого src не должна подставляться в новый <img>.
  const offlineSrc = offline && offline.forSrc === src ? offline.url : ''
  // Пока ищем в хранилище — src не выставляем, чтобы не улетал сетевой запрос
  // (иначе оффлайн он падает с ERR_INTERNET_DISCONNECTED в консоль).
  const finalSrc = offlineSrc || (networkFor === src ? src : '')
  if (!finalSrc) return null

  return (
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      draggable={draggable}
      loading={loading}
      onError={onError}
    />
  )
}
