// src/utils/richText.ts
// Безопасный рендеринг ограниченного набора HTML-тегов в полях вроде
// «Описание» руны. Поддерживает подсветку поискового запроса (<mark>).
// Все теги/атрибуты вне белого списка удаляются (защита от XSS).

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN',
  'UL', 'OL', 'LI', 'A', 'SMALL', 'SUB', 'SUP', 'CODE', 'PRE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'MARK', 'HR', 'BLOCKQUOTE',
])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightTextNode(text: string, term?: string): string {
  if (!term || !term.trim()) return escapeHtml(text)
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'ig')
  const parts = text.split(re)
  return parts
    .map((part) =>
      part.toLowerCase() === term.toLowerCase()
        ? `<mark class="rune-hl">${escapeHtml(part)}</mark>`
        : escapeHtml(part),
    )
    .join('')
}

function sanitizeNode(node: Node, term?: string): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return highlightTextNode(node.textContent || '', term)
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tag = el.tagName
    // Запрещённый тег — оставляем только содержимое (тег вырезаем)
    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map((c) => sanitizeNode(c, term)).join('')
    }
    const children = Array.from(el.childNodes).map((c) => sanitizeNode(c, term)).join('')
    if (tag === 'BR') return '<br/>'
    let attrs = ''
    // Разрешаем только безопасные ссылки
    if (tag === 'A') {
      const href = el.getAttribute('href') || ''
      if (/^(https?:|mailto:)/i.test(href)) attrs = ` href="${escapeAttr(href)}"`
    }
    return `<${tag.toLowerCase()}${attrs}>${children}</${tag.toLowerCase()}>`
  }
  return ''
}

/** Возвращает очищенный HTML с подсветкой term (если задан). */
export function renderRichText(html: string, term?: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.body.childNodes).map((n) => sanitizeNode(n, term)).join('')
}
