#!/usr/bin/env node
/*
 Migration utility for encryption format.

 Usage:
  node scripts/migrate-encryption.js --dry-run
  node scripts/migrate-encryption.js --apply
  node scripts/migrate-encryption.js --remote --apply

 Environment:
  ENCRYPTION_KEY - passphrase for new encryption (required)
  LEGACY_PASSPHRASES - optional comma-separated legacy passphrases
  GITHUB_TOKEN - required for --remote
  REPO_OWNER, REPO_NAME, REPO_BRANCH - optional for remote (defaults set below)
*/

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const ENCRYPTION_PREFIX = 'ENC:v1:'

const argv = require('minimist')(process.argv.slice(2), { boolean: ['dry-run', 'apply', 'remote'], default: { 'dry-run': true } })
const DRY_RUN = argv['dry-run'] && !argv['apply']
const APPLY = argv['apply'] || false
const REMOTE = argv['remote'] || false

const WORKDIR = process.cwd()

const NEW_PASSPHRASE = process.env.ENCRYPTION_KEY
const LEGACY_PASSPHRASES = (process.env.LEGACY_PASSPHRASES || '').split(',').map(s => s.trim()).filter(Boolean)

if (!NEW_PASSPHRASE) {
  console.error('ENCRYPTION_KEY is required in env to encrypt files with the new key.')
  process.exitCode = 2
}

const EXCLUDE = ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json']

const listLocalJsonFiles = () => {
  return fs.readdirSync(WORKDIR)
    .filter(f => f.toLowerCase().endsWith('.json') && !EXCLUDE.includes(f))
}

// WebCrypto helpers for Node
const { subtle } = globalThis.crypto || require('crypto').webcrypto

const textEncode = (s) => new TextEncoder().encode(s)

const deriveKey = async (passphrase, salt /* Uint8Array */) => {
  const keyMaterial = await subtle.importKey('raw', textEncode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const encryptWithSalt = async (plaintext, passphrase) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncode(plaintext))
  const encBytes = new Uint8Array(enc)
  const combined = new Uint8Array(salt.length + iv.length + encBytes.length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(encBytes, salt.length + iv.length)
  let binary = ''
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i])
  return ENCRYPTION_PREFIX + Buffer.from(binary, 'binary').toString('base64')
}

const tryDecrypt = async (data, passphrase) => {
  // data: string (base64 prefixed)
  if (!data || !data.startsWith(ENCRYPTION_PREFIX)) return { ok: false }
  const base64 = data.slice(ENCRYPTION_PREFIX.length)
  const raw = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  // try new format
  if (bytes.length > 28) {
    const salt = bytes.slice(0, 16)
    const iv = bytes.slice(16, 28)
    const ciphertext = bytes.slice(28)
    try {
      const key = await deriveKey(passphrase, salt)
      const dec = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch (e) { /* fallthrough */ }
  }

  // legacy format: iv(12) | ciphertext (using legacy salt)
  if (bytes.length > 12) {
    const iv = bytes.slice(0, 12)
    const ciphertext = bytes.slice(12)
    // legacy salt: 'runy-dic-salt-v1'
    const salt = textEncode('runy-dic-salt-v1')
    try {
      const key = await deriveKey(passphrase, salt)
      const dec = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
      return { ok: true, plaintext: new TextDecoder().decode(dec) }
    } catch (e) { /* fallthrough */ }
  }
  return { ok: false }
}

const migrateLocal = async () => {
  const files = listLocalJsonFiles()
  const results = []
  for (const file of files) {
    const p = path.join(WORKDIR, file)
    let raw = fs.readFileSync(p, 'utf8')
    raw = raw.replace(/^\uFEFF/, '').trim()
    let decrypted = null
    if (raw.startsWith(ENCRYPTION_PREFIX)) {
      // try new passphrase
      let ok = await tryDecrypt(raw, NEW_PASSPHRASE)
      if (!ok.ok) {
        // try legacy passphrases env
        for (const lp of LEGACY_PASSPHRASES) {
          ok = await tryDecrypt(raw, lp)
          if (ok.ok) break
        }
      }
      if (ok.ok) decrypted = ok.plaintext
      else {
        results.push({ file, status: 'cannot_decrypt' })
        continue
      }
    } else {
      decrypted = raw
    }

    // encrypt with new passphrase
    const encrypted = await encryptWithSalt(decrypted, NEW_PASSPHRASE)
    results.push({ file, status: 'would_replace', encryptedLength: encrypted.length })
    if (APPLY) {
      // backup
      fs.copyFileSync(p, p + '.bak')
      fs.writeFileSync(p, encrypted + '\n', 'utf8')
      results[results.length - 1].status = 'replaced'
    }
  }
  return results
}

const main = async () => {
  console.log('Migration utility')
  console.log('Mode:', REMOTE ? 'remote' : 'local', DRY_RUN ? '(dry-run)' : '(apply)')
  if (!NEW_PASSPHRASE) {
    console.error('ENCRYPTION_KEY env var is required. Aborting.')
    process.exit(2)
  }
  if (!REMOTE) {
    const res = await migrateLocal()
    console.table(res)
    console.log('Done')
    return
  }

  console.error('Remote mode not implemented in this script. Use local mode or request remote migration.')
}

main().catch(err => { console.error(err); process.exit(1) })
