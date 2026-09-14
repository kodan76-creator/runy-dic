#!/usr/bin/env node
/* CJS migration script: переносит личные JSON-словари пользователей
 * из корня репозитория (citer2380.json, kodan76.json, ...) в папки
 * пользователей: public/users/<email_folder>/dictionary.json
 *
 * Использование:
 *   node scripts/migrate-user-folders.cjs            # dry-run (ничего не пишет)
 *   node scripts/migrate-user-folders.cjs --apply    # копирует файлы на GitHub
 *   node scripts/migrate-user-folders.cjs --apply --delete-old  # копирует и удаляет старые
 *
 * Токен берётся из .env (VITE_GITHUB_TOKEN) или env GITHUB_TOKEN.
 */
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DELETE_OLD = args.includes('--delete-old')
const DRY_RUN = !APPLY

// ── Читаем .env ──────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env')
const env = {}
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const TOKEN = env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('VITE_GITHUB_TOKEN is required (in .env or env). Aborting.')
  process.exit(2)
}

const OWNER = 'kodan76-creator'
const REPO = 'runy-dic'
const BRANCH = 'main'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`

const headers = {
  Authorization: `token ${TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
}

// ── Имена файлов (зеркалят src/dictionaryAccess.ts и src/api/audio.ts) ──
const emailToFolderName = (email) => String(email || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')

const oldFileNameForEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase()
  const localPart = normalized.split('@')[0] || 'user'
  if (!localPart) return 'user.json'
  return `${localPart.replace(/[^a-z0-9._+-]+/g, '_')}.json`
}

const newFileNameForEmail = (email) => {
  const folder = emailToFolderName(email)
  if (!folder) return 'user.json'
  return `public/users/${folder}/dictionary.json`
}

// ── GitHub Contents API ──────────────────────────────────────────────
const fetchFile = async (filePath) => {
  const url = `${API}/contents/${filePath}?ref=${BRANCH}`
  const resp = await fetch(url, { headers })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GET ${filePath}: HTTP ${resp.status} ${await resp.text()}`)
  const data = await resp.json()
  return { content: data.content, sha: data.sha }
}

const putFile = async (filePath, content, sha) => {
  const body = { message: `Migrate user dictionary to ${filePath}`, content, branch: BRANCH }
  if (sha) body.sha = sha
  const resp = await fetch(`${API}/contents/${filePath}`, { method: 'PUT', headers, body: JSON.stringify(body) })
  if (!resp.ok) throw new Error(`PUT ${filePath}: HTTP ${resp.status} ${await resp.text()}`)
  return resp.json()
}

const deleteFile = async (filePath, sha) => {
  const body = { message: `Remove migrated user dictionary ${filePath}`, sha, branch: BRANCH }
  const resp = await fetch(`${API}/contents/${filePath}`, { method: 'DELETE', headers, body: JSON.stringify(body) })
  if (!resp.ok) throw new Error(`DELETE ${filePath}: HTTP ${resp.status} ${await resp.text()}`)
  return resp.json()
}

const main = async () => {
  console.log('Migrate user dictionaries into user folders')
  console.log('Mode:', DRY_RUN ? 'dry-run' : 'apply', DELETE_OLD ? '(delete old files)' : '(keep old files)')

  // 1. Читаем users.json
  const usersFile = await fetchFile('users.json')
  if (!usersFile) { console.error('users.json not found on GitHub'); process.exit(1) }
  const usersRaw = Buffer.from(usersFile.content, 'base64').toString('utf8')
  const users = JSON.parse(usersRaw.replace(/^\uFEFF/, '').trim())
  if (!Array.isArray(users)) { console.error('users.json is not an array'); process.exit(1) }

  const results = []
  for (const user of users) {
    const email = user?.email
    if (!email) continue
    const oldName = oldFileNameForEmail(email)
    const newName = newFileNameForEmail(email)
    if (oldName === newName) continue

    const oldFile = await fetchFile(oldName)
    if (!oldFile) {
      results.push({ email, old: oldName, new: newName, status: 'no_old_file' })
      continue
    }

    if (APPLY) {
      await putFile(newName, oldFile.content, null)
      if (DELETE_OLD) {
        await deleteFile(oldName, oldFile.sha)
      }
    }
    results.push({
      email,
      old: oldName,
      new: newName,
      status: APPLY ? (DELETE_OLD ? 'moved' : 'copied') : 'would_copy',
    })
  }

  console.table(results)
  console.log('Done')
}

main().catch(err => { console.error(err); process.exit(1) })