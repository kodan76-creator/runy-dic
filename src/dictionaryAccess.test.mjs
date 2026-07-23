import test from 'node:test'
import assert from 'node:assert/strict'
import { getDictionaryFileNameForEmail, resolveDictionaryFile } from './dictionaryAccess.js'

test('admins and paid users can read shared dictionary, unpaid users use personal dictionary', () => {
  assert.equal(resolveDictionaryFile({ role: 'admin', email: 'admin@example.com' }), 'dictionary.json')
  assert.equal(resolveDictionaryFile({ role: 'user', paid: true, email: 'user@example.com' }), 'dictionary.json')
  assert.equal(resolveDictionaryFile({ role: 'user', paid: false, email: 'user@example.com' }), 'user.json')
  assert.equal(resolveDictionaryFile('user@example.com'), 'user.json')
})

test('derive personal dictionary filename from email', () => {
  assert.equal(getDictionaryFileNameForEmail('user@example.com'), 'user.json')
  assert.equal(getDictionaryFileNameForEmail('user.name+tag@example.org'), 'user.name+tag.json')
})
