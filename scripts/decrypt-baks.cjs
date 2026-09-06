#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const ENCRYPTION_PREFIX = 'ENC:v1:'
const WORKDIR = path.join(process.cwd(), 'artifacts_unpacked')
const NEW_PASSPHRASE = process.env.ENCRYPTION_KEY
const LEGACY_PASSPHRASES = (process.env.LEGACY_PASSPHRASES || '').split(',').map(s => s.trim()).filter(Boolean)
if (!NEW_PASSPHRASE) { console.error('ENCRYPTION_KEY required'); process.exit(2) }
const { webcrypto } = require('crypto')
const subtle = webcrypto.subtle
const getRandomValues = (buf) => webcrypto.getRandomValues(buf)
const textEncode = (s) => new TextEncoder().encode(s)
const deriveKey = async (passphrase, salt) => {
  const keyMaterial = await subtle.importKey('raw', textEncode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
const tryDecrypt = async (data, passphrase) => {
  if (!data || !data.startsWith(ENCRYPTION_PREFIX)) return { ok: false }
  const base64 = data.slice(ENCRYPTION_PREFIX.length)
  const raw = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  if (bytes.length > 28) {
    const salt = bytes.slice(0, 16)
    const iv = bytes.slice(16, 28)
    const ciphertext = bytes.slice(28)
    try {
      const key = await deriveKey(passphrase, salt)
      const dec = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch (e) { }
  }

  if (bytes.length > 12) {
    const iv = bytes.slice(0, 12)
    const ciphertext = bytes.slice(12)
    const salt = textEncode('runy-dic-salt-v1')
    try {
      const key = await deriveKey(passphrase, salt)
      const dec = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch (e) { }
  }
  return { ok: false }
}

(async () => {
  if (!fs.existsSync(WORKDIR)) { console.error('artifacts_unpacked not found'); process.exit(2) }
  const files = fs.readdirSync(WORKDIR).filter(f => f.endsWith('.bak'))
  if (!files.length) { console.log('No .bak files found'); process.exit(0) }
  const results = []
  for (const f of files) {
    const p = path.join(WORKDIR, f)
    const raw = fs.readFileSync(p, 'utf8').trim()
    try {
      let dec = { ok: false }
      if (NEW_PASSPHRASE) dec = await tryDecrypt(raw, NEW_PASSPHRASE)
      if (!dec.ok && LEGACY_PASSPHRASES.length) {
        for (const lp of LEGACY_PASSPHRASES) {
          dec = await tryDecrypt(raw, lp)
          if (dec.ok) break
        }
      }
      if (!dec.ok) { results.push({ file: f, ok: false, reason: 'cannot_decrypt' }); continue }
      // validate JSON
      try {
        const parsed = JSON.parse(dec.plaintext)
        const outPath = path.join(WORKDIR, f + '.dec.json')
        fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf8')
        results.push({ file: f, ok: true, parsedType: Array.isArray(parsed) ? 'array' : typeof parsed })
      } catch (e) {
        // not valid JSON, write plaintext
        const outPath = path.join(WORKDIR, f + '.dec.txt')
        fs.writeFileSync(outPath, dec.plaintext, 'utf8')
        results.push({ file: f, ok: true, parsedType: 'text-not-json' })
      }
    } catch (e) {
      results.push({ file: f, ok: false, reason: e.message })
    }
  }
  console.table(results)
})().catch(e => { console.error(e); process.exit(1) })
