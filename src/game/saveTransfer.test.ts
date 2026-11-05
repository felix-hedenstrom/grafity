import { beforeEach, describe, expect, it } from 'vitest'
import { RUN_SAVE_KEY, toSavedRunState, useRunStore } from '../store/useRunStore'
import {
  applyGamestateImport,
  buildGamestateExport,
  EXPORT_FORMAT_VERSION,
  serializeGamestateExport,
} from './saveTransfer'

const PERSIST_KEYS = ['grafity-save-v1', 'grafity-prestige-v1', 'grafity-achievements-v1']
const ALL_KEYS = [...PERSIST_KEYS, RUN_SAVE_KEY]

function snapshotStorage(): Record<string, string | null> {
  return Object.fromEntries(ALL_KEYS.map((key) => [key, localStorage.getItem(key)]))
}

beforeEach(() => {
  localStorage.clear()
})

describe('buildGamestateExport', () => {
  it('embeds persist envelopes verbatim and the live run projection', () => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { graphNodeCount: 42 }, version: 0 }))
    const data = buildGamestateExport()
    expect(data.kind).toBe('grafity-gamestate')
    expect(data.version).toBe(EXPORT_FORMAT_VERSION)
    expect(data.progression).toEqual({ state: { graphNodeCount: 42 }, version: 0 })
    expect(data.prestige).toBeNull()
    expect(data.run).toEqual(toSavedRunState(useRunStore.getState()))
    expect(Array.isArray(data.run?.discoveredNodeIds)).toBe(true)
  })
})

describe('applyGamestateImport', () => {
  it('round-trips a serialized export into the same localStorage keys', () => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { graphNodeCount: 42 }, version: 0 }))
    localStorage.setItem('grafity-prestige-v1', JSON.stringify({ state: { prestigeCount: 3 }, version: 2 }))
    localStorage.setItem('grafity-achievements-v1', JSON.stringify({ state: { unlockedIds: ['a'] }, version: 0 }))
    const json = serializeGamestateExport()

    localStorage.clear()
    const result = applyGamestateImport(json)
    expect(result).toEqual({ ok: true })
    expect(JSON.parse(localStorage.getItem('grafity-save-v1')!)).toEqual({ state: { graphNodeCount: 42 }, version: 0 })
    expect(JSON.parse(localStorage.getItem('grafity-prestige-v1')!)).toEqual({ state: { prestigeCount: 3 }, version: 2 })
    expect(JSON.parse(localStorage.getItem('grafity-achievements-v1')!)).toEqual({
      state: { unlockedIds: ['a'] },
      version: 0,
    })
    expect(JSON.parse(localStorage.getItem(RUN_SAVE_KEY)!)).toEqual(toSavedRunState(useRunStore.getState()))
  })

  it('clears keys whose sections are null', () => {
    localStorage.setItem('grafity-prestige-v1', JSON.stringify({ state: { prestigeCount: 3 }, version: 2 }))
    const data = buildGamestateExport()
    localStorage.setItem('grafity-save-v1', 'stale')
    const result = applyGamestateImport(JSON.stringify({ ...data, progression: null, run: null }))
    expect(result).toEqual({ ok: true })
    expect(localStorage.getItem('grafity-save-v1')).toBeNull()
    expect(localStorage.getItem(RUN_SAVE_KEY)).toBeNull()
    expect(localStorage.getItem('grafity-prestige-v1')).not.toBeNull()
  })

  it.each([
    ['garbage JSON', 'not json {'],
    ['wrong kind', JSON.stringify({ kind: 'other', version: 1 })],
    ['wrong version', JSON.stringify({ ...JSON.parse(serializeGamestateExport()), version: 99 })],
    ['malformed envelope', JSON.stringify({ ...JSON.parse(serializeGamestateExport()), progression: { state: 7 } })],
    [
      'run with no walkers',
      JSON.stringify((() => {
        const data = JSON.parse(serializeGamestateExport())
        data.run.walkers = []
        return data
      })()),
    ],
  ])('rejects %s without touching localStorage', (_label, json) => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { graphNodeCount: 1 }, version: 0 }))
    const before = snapshotStorage()
    const result = applyGamestateImport(json)
    expect(result.ok).toBe(false)
    expect(snapshotStorage()).toEqual(before)
  })
})
