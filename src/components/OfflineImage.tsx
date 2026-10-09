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
  // Локальный objectURL (из IndexedDB) — приоритетнее сети.
  const [offlineSrc, setOfflineSrc] = useState('')
  // Сеть: пробуем только если локальной копии нет (или пока её ищем).
  const [useNetwork, setUseNetwork] = useState(false)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    setOfflineSrc('')
    setUseNetwork(false)
    ;(async () => {
      const blob = await getOfflineBlob(src).catch(() => null)
      if (cancelled) return
      if (blob) {
        setOfflineSrc(URL.createObjectURL(blob))
      } else {
        // Локальной копии нет — грузим из сети
        setUseNetwork(true)
      }
    })()
    return () => { cancelled = true }
  }, [src])

  // 🧹 Освобождаем blob-URL при размонтировании/смене картинки.
  useEffect(() => {
    if (!offlineSrc) return
    return () => URL.revokeObjectURL(offlineSrc)
  }, [offlineSrc])

  // Пока ищем в хранилище — src не выставляем, чтобы не улетал сетевой запрос
  // (иначе оффлайн он падает с ERR_INTERNET_DISCONNECTED в консоль).
  const finalSrc = offlineSrc || (useNetwork ? src : '')
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
