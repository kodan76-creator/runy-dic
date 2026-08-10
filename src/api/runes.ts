// src/api/runes.js
// Работа со словарём «Новые Руны» (runes.json)
import { RUNES_FILE } from './constants'
import { fetchGitHubFile, updateGitHubFile } from './client'

export const getRunes = async () => fetchGitHubFile(RUNES_FILE)

export const addRune = async (runeData, userEmail) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? runes : []
  const newRune = { ...runeData, id: Date.now().toString(), createdAt: new Date().toISOString(), createdBy: userEmail }
  await updateGitHubFile(RUNES_FILE, [newRune, ...arr], sha)
  return newRune
}

export const updateRune = async (id, updatedData) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? runes : []
  const updated = arr.map(r => r.id === id ? { ...r, ...updatedData } : r)
  await updateGitHubFile(RUNES_FILE, updated, sha)
}

export const deleteRune = async (id) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? runes : []
  const filtered = arr.filter(r => r.id !== id)
  await updateGitHubFile(RUNES_FILE, filtered, sha)
}

export const moveRuneUp = async (id) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? [...runes] : []
  const idx = arr.findIndex(r => r.id === id)
  if (idx <= 0) return // already first
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  await updateGitHubFile(RUNES_FILE, arr, sha)
}

export const moveRuneDown = async (id) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? [...runes] : []
  const idx = arr.findIndex(r => r.id === id)
  if (idx === -1 || idx >= arr.length - 1) return // already last
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  await updateGitHubFile(RUNES_FILE, arr, sha)
}

export const moveRuneToTop = async (id) => {
  const { data: runes, sha } = await getRunes()
  const arr = Array.isArray(runes) ? [...runes] : []
  const idx = arr.findIndex(r => r.id === id)
  if (idx <= 0) return // already first
  const [item] = arr.splice(idx, 1)
  arr.unshift(item)
  await updateGitHubFile(RUNES_FILE, arr, sha)
}
