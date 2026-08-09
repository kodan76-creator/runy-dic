// Тесты оффлайн-очереди: применение отложенных изменений к массиву слов.
import { describe, it, expect, beforeEach } from 'vitest'
import { applyOfflineChange, enqueueOfflineChange, getOfflineChanges, removeOfflineChanges, cacheDictionaryForOffline, getCachedDictionary } from './offline'

const w1 = { id: '1', word: 'hello', translation: 'привет' }
const w2 = { id: '2', word: 'world', translation: 'мир' }
const w3 = { id: '3', word: 'foo', translation: 'бар' }

describe('applyOfflineChange', () => {
  it('add — добавляет слово в конец', () => {
    const out = applyOfflineChange([w1, w2], { type: 'add', word: w3 })
    expect(out.map(w => w.id)).toEqual(['1', '2', '3'])
  })

  it('add — не дублирует слово с тем же id', () => {
    const out = applyOfflineChange([w1], { type: 'add', word: w1 })
    expect(out).toHaveLength(1)
  })

  it('update — обновляет поля найденного слова', () => {
    const out = applyOfflineChange([w1, w2], { type: 'update', id: '1', data: { translation: 'привет!' } })
    expect(out[0]).toEqual({ ...w1, translation: 'привет!' })
    expect(out[1]).toEqual(w2)
  })

  it('update — не трогает остальные слова при отсутствии id', () => {
    const out = applyOfflineChange([w1, w2], { type: 'update', id: '999', data: { translation: 'x' } })
    expect(out).toEqual([w1, w2])
  })

  it('delete — удаляет слово по id', () => {
    const out = applyOfflineChange([w1, w2, w3], { type: 'delete', id: '2' })
    expect(out.map(w => w.id)).toEqual(['1', '3'])
  })

  it('move — перемещает слово на указанную позицию', () => {
    const out = applyOfflineChange([w1, w2, w3], { type: 'move', id: '3', toIndex: 0 })
    expect(out.map(w => w.id)).toEqual(['3', '1', '2'])
  })

  it('reorder — выстраивает слова по переданному порядку id', () => {
    const out = applyOfflineChange([w1, w2, w3], { type: 'reorder', order: ['3', '1', '2'] })
    expect(out.map(w => w.id)).toEqual(['3', '1', '2'])
  })

  it('reorder — незнакомые слова дописывает в конец', () => {
    const out = applyOfflineChange([w1, w2, w3], { type: 'reorder', order: ['2', '1'] })
    expect(out.map(w => w.id)).toEqual(['2', '1', '3'])
  })

  it('возвращает новый массив, не мутируя исходный', () => {
    const src = [w1, w2]
    const out = applyOfflineChange(src, { type: 'delete', id: '1' })
    expect(src).toHaveLength(2)
    expect(out).toHaveLength(1)
  })
})

describe('offline queue (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('enqueue + get + remove', () => {
    enqueueOfflineChange({ type: 'update', fileName: 'x.json', id: '1', data: {} })
    const all = getOfflineChanges()
    expect(all).toHaveLength(1)
    expect(all[0].type).toBe('update')
    expect(typeof all[0].queuedAt).toBe('number')
    removeOfflineChanges([all[0].queuedAt])
    expect(getOfflineChanges()).toHaveLength(0)
  })

  it('cacheDictionaryForOffline + getCachedDictionary', () => {
    cacheDictionaryForOffline('u@test.com', [w1])
    const cached = getCachedDictionary('u@test.com')
    expect(cached).toEqual([w1])
  })
})
