#!/usr/bin/env node
/*
 * scripts/cleanup-orphan-category-ids.cjs
 *
 * Разовая чистка «осиротевших» id категорий из словарей.
 *
 * Слово хранит категории как id справочника (в старых данных — как имя).
 * Если категория удалена, а часть записей сохранила ссылку на её id, такой id
 * в чипах «Категории:» под шапкой отображается цифрами. Скрипт удаляет из
 * словарей только значения вида <цифры> / u<цифры>, которых нет ни в одном
 * справочнике (основной categories.json + личные categories.json живых
 * пользователей). Легальные имена категорий из старых данных не трогаются.
 * Архив public/users/_deleted/ не читается и не меняется — та же конвенция,
 * что у removeCategoryFromAllWords (src/api/dictionary.ts).
 *
 * Запуск из корня репозитория:
 *   node scripts/cleanup-orphan-category-ids.cjs           # dry-run (отчёт)
 *   node scripts/cleanup-orphan-category-ids.cjs --apply   # записать файлы
 *
 * Ключ шифрования: ENCRYPTION_KEY (env) либо VITE_ENCRYPTION_KEY /
 * VITE_ENCRYPTION_KEY_B64 из .env — тот же, что у клиента (src/cryptoUtil.ts).
 */
const fs = require('fs')
const path = require('path')
const { webcrypto } = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const APPLY = process.argv.slice(2).includes('--apply')
const ENCRYPTION_PREFIX = 'ENC:v1:'
// id в данных: чистые цифры (Date.now) либо «u» + цифры (личные категории)
const ID_PATTERN = /^u?\d+$/

let PASSPHRASE = null

// ── 🔐 AES-GCM / PBKDF2 — как в src/cryptoUtil.ts ───────────────────────────
const deriveKey = async (passphrase, salt) => {
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

const encryptWithSalt = async (plaintext, passphrase) => {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt)
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const enc = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)))
  const combined = new Uint8Array(salt.length + iv.length + enc.length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(enc, salt.length + iv.length)
  let binary = ''
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i])
  return ENCRYPTION_PREFIX + Buffer.from(binary, 'binary').toString('base64')
}

// Пробуем новый формат (случайный salt в начале) и legacy (фиксированный salt)
const tryDecrypt = async (data, passphrase) => {
  if (!data || !data.startsWith(ENCRYPTION_PREFIX)) return { ok: false }
  const raw = Buffer.from(data.slice(ENCRYPTION_PREFIX.length), 'base64').toString('binary')
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  if (bytes.length > 28) {
    try {
      const key = await deriveKey(passphrase, bytes.slice(0, 16))
      const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28))
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch { /* следующий формат */ }
  }
  if (bytes.length > 12) {
    try {
      const key = await deriveKey(passphrase, new TextEncoder().encode('runy-dic-salt-v1'))
      const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch { /* ключ не подошёл */ }
  }
  return { ok: false }
}

// Ключ как у клиента: ENCRYPTION_KEY (env) → VITE_ENCRYPTION_KEY →
// VITE_ENCRYPTION_KEY_B64 (atob → latin1, затем TextEncoder — как в cryptoUtil)
const loadPassphrase = () => {
  if (process.env.ENCRYPTION_KEY) return process.env.ENCRYPTION_KEY
  let env = ''
  try { env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8') } catch { return null }
  const pick = (name) => {
    const m = env.match(new RegExp('^' + name + '=(.*)$', 'm'))
    if (!m) return null
    const v = m[1].trim().replace(/^['"]|['"]$/g, '')
    return v || null
  }
  const plain = pick('VITE_ENCRYPTION_KEY')
  if (plain) return plain
  const b64 = pick('VITE_ENCRYPTION_KEY_B64')
  if (b64) {
    try { return Buffer.from(b64, 'base64').toString('latin1') } catch { return null }
  }
  return null
}

// ── 📄 Чтение файлов репозитория ────────────────────────────────────────────
const listUserFolders = () => {
  const dir = path.join(ROOT, 'public/users')
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_deleted')
    .map(e => e.name)
}

const parseArray = (text, file) => {
  try {
    const v = JSON.parse(text)
    if (!Array.isArray(v)) throw new Error('ожидался JSON-массив')
    return v
  } catch (e) {
    throw new Error(`${file}: невалидный JSON (${e.message})`)
  }
}

/** Прочитать JSON-массив; отсутствующий файл → null. Шифрованный — расшифровать. */
const readArray = async (file) => {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').trim()
  const encrypted = raw.startsWith(ENCRYPTION_PREFIX)
  if (encrypted) {
    const r = await tryDecrypt(raw, PASSPHRASE)
    if (!r.ok) throw new Error(`${file}: не удалось расшифровать ключом`)
    return { file, encrypted: true, items: parseArray(r.plaintext, file) }
  }
  return { file, encrypted: false, items: parseArray(raw, file) }
}

// ── 🏷 Все живые токены категорий (id + имена) ──────────────────────────────
// Токен в слове осиротевший, если он вида <цифры>/u<цифры> и не встречается
// ни как id, ни как имя ни в одном живом справочнике. Имена добавляем в набор,
// потому что categoryLabel резолвит и по имени (старые данные хранят имя).
const loadValidTokens = async () => {
  const valid = new Set()
  const sources = ['categories.json', ...listUserFolders().map(f => `public/users/${f}/categories.json`)]
  for (const src of sources) {
    // Отсутствующий личный справочник — ок; ошибка чтения/расшифровки любого
    // справочника фатальна: без полного набора чистка вырежет живые ссылки
    const res = await readArray(src)
    if (!res) continue
    for (const c of res.items) {
      if (c && c.id != null) valid.add(String(c.id).trim())
      if (c && c.name != null) valid.add(String(c.name).trim())
    }
  }
  if (valid.size === 0) throw new Error('Ни один справочник категорий не прочитан — чистка отменена')
  return valid
}

// ── 🧹 Чистка одного файла словаря ──────────────────────────────────────────
const cleanDictionary = (items, valid) => {
  const removed = new Map() // токен → сколько раз вычищен
  const isOrphan = (v) => {
    const s = String(v).trim()
    if (!ID_PATTERN.test(s)) return false // не id: легальное имя — не трогаем
    if (valid.has(s)) return false
    removed.set(s, (removed.get(s) || 0) + 1)
    return true
  }
  const next = items.map(w => {
    const cat = w?.category
    if (cat == null || cat === '') return w
    if (Array.isArray(cat)) {
      const kept = cat.filter(v => !isOrphan(v))
      return kept.length === cat.length ? w : { ...w, category: kept }
    }
    // скалярное значение-осирота → пустой список (как removeCategoryFromAllWords)
    return isOrphan(cat) ? { ...w, category: [] } : w
  })
  return { next, removed, changed: next.some((w, i) => w !== items[i]) }
}

const main = async () => {
  PASSPHRASE = loadPassphrase()
  if (!PASSPHRASE) {
    console.error('❌ Не найден ключ шифрования: задайте ENCRYPTION_KEY или VITE_ENCRYPTION_KEY(_B64) в .env')
    process.exit(2)
  }

  console.log(APPLY ? 'Режим: apply (файлы будут перезаписаны)' : 'Режим: dry-run (ничего не пишем)')

  const valid = await loadValidTokens()
  const folders = listUserFolders()
  const targets = [
    'dictionary.json',
    'dictionary.json2', // legacy-резервная копия, тоже в репозитории
    ...folders.map(f => `public/users/${f}/dictionary.json`),
  ]

  const rows = []
  let totalOrphans = 0
  for (const file of targets) {
    let cur
    try {
      cur = await readArray(file)
    } catch (e) {
      // Не смогли прочитать цель — не трогаем всё, что не прочитано
      throw new Error(`${e.message} — чистка остановлена, файл не изменён`)
    }
    if (!cur) {
      rows.push({ файл: file, слов: '—', 'осирот. id': '—', действие: 'нет файла' })
      continue
    }
    const { next, removed, changed } = cleanDictionary(cur.items, valid)
    const detail = removed.size
      ? [...removed.entries()].map(([id, n]) => `${id}×${n}`).join(', ')
      : '—'
    totalOrphans += [...removed.values()].reduce((a, b) => a + b, 0)

    let action = 'уже чисто'
    if (changed) {
      if (APPLY) {
        const payload = JSON.stringify(next, null, 2)
        const out = cur.encrypted ? await encryptWithSalt(payload, PASSPHRASE) : payload
        fs.writeFileSync(path.join(ROOT, file), out, 'utf8')
        action = 'очищен'
      } else {
        action = 'нужна чистка (--apply)'
      }
    }
    rows.push({ файл: file, слов: cur.items.length, 'осирот. id': detail, действие: action })
  }

  console.table(rows)
  if (totalOrphans === 0) {
    console.log('✅ Осиротевших id не найдено — чистка не требуется')
  } else if (!APPLY) {
    console.log(`🔎 Найдено осиротевших ссылок: ${totalOrphans}. Запустите с --apply для записи.`)
  } else {
    console.log(`✅ Вычищено осиротевших ссылок: ${totalOrphans}`)
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
