#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const ENCRYPTION_PREFIX = 'ENC:v1:'
const ROOT = process.cwd()
const ART = path.join(process.cwd(), 'artifacts_unpacked')
const NEW_PASSPHRASE = process.env.ENCRYPTION_KEY
const LEGACY_PASSPHRASES = (process.env.LEGACY_PASSPHRASES || '').split(',').map(s => s.trim()).filter(Boolean)
const { webcrypto } = require('crypto')
const subtle = webcrypto.subtle
const textEncode = (s) => new TextEncoder().encode(s)
const deriveKey = async (passphrase, salt) => {
  const keyMaterial = await subtle.importKey('raw', textEncode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
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

const listJson = (dir) => fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json'))

(async () => {
  console.log('Checking root JSON files:')
  const rootFiles = listJson(ROOT)
  for (const f of rootFiles) {
    const p = path.join(ROOT, f)
    const raw = fs.readFileSync(p, 'utf8').trim()
    if (!raw.startsWith(ENCRYPTION_PREFIX)) { console.log(f + ': not encrypted'); continue }
    let dec = { ok: false }
    if (NEW_PASSPHRASE) dec = await tryDecrypt(raw, NEW_PASSPHRASE)
    if (!dec.ok && LEGACY_PASSPHRASES.length) {
      for (const lp of LEGACY_PASSPHRASES) { dec = await tryDecrypt(raw, lp); if (dec.ok) break }
    }
    console.log(f + ': ' + (dec.ok ? ('decrypted with length ' + dec.plaintext.length) : 'cannot_decrypt'))
  }
  if (fs.existsSync(ART)) {
    console.log('\nChecking artifact backups:')
    const artFiles = fs.readdirSync(ART).filter(f => f.endsWith('.bak'))
    for (const f of artFiles) {
      const p = path.join(ART, f)
      const raw = fs.readFileSync(p, 'utf8').trim()
      if (!raw.startsWith(ENCRYPTION_PREFIX)) { console.log(f + ': not encrypted'); continue }
      let dec = { ok: false }
      if (NEW_PASSPHRASE) dec = await tryDecrypt(raw, NEW_PASSPHRASE)
      if (!dec.ok && LEGACY_PASSPHRASES.length) {
        for (const lp of LEGACY_PASSPHRASES) { dec = await tryDecrypt(raw, lp); if (dec.ok) break }
      }
      console.log(f + ': ' + (dec.ok ? ('decrypted with length ' + dec.plaintext.length) : 'cannot_decrypt'))
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
