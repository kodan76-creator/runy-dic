#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { webcrypto } = require('crypto')
const subtle = webcrypto.subtle
const getRandomValues = (buf) => webcrypto.getRandomValues(buf)
const textEncode = (s) => new TextEncoder().encode(s)

const ENCRYPTION_PREFIX = 'ENC:v1:'

const deriveKey = async (passphrase, salt) => {
  const keyMaterial = await subtle.importKey('raw', textEncode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt'])
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

const WORKDIR = process.cwd()
const NEW_PASSPHRASE = process.env.ENCRYPTION_KEY
const LEGACY_PASSPHRASES = (process.env.LEGACY_PASSPHRASES || '').split(',').map(s => s.trim()).filter(Boolean)

if (!NEW_PASSPHRASE) {
  console.error('ENCRYPTION_KEY is required in env to decrypt files.'); process.exit(2)
}

const outDir = path.join(WORKDIR, '..', 'decrypted_from_baks')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(WORKDIR).filter(f => f.toLowerCase().endsWith('.json'))
;(async () => {
  for (const f of files) {
    const p = path.join(WORKDIR, f)
    let raw = fs.readFileSync(p, 'utf8')
    raw = raw.replace(/^\uFEFF/, '').trim()
    let decrypted = null
    if (raw.startsWith(ENCRYPTION_PREFIX)) {
      let ok = await tryDecrypt(raw, NEW_PASSPHRASE)
      if (!ok.ok) {
        for (const lp of LEGACY_PASSPHRASES) {
          ok = await tryDecrypt(raw, lp)
          if (ok.ok) break
        }
      }
      if (ok.ok) decrypted = ok.plaintext
      else { fs.writeFileSync(path.join(outDir, f + '.cannot_decrypt.txt'), raw); console.log(f, 'cannot_decrypt'); continue }
    } else { decrypted = raw }

    fs.writeFileSync(path.join(outDir, f), decrypted, 'utf8')
    console.log('decrypted:', f, '->', path.join(outDir, f))
  }
  console.log('Done')
})().catch(e => { console.error(e); process.exit(1) })
