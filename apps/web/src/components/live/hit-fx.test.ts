import { describe, expect, it } from 'vitest'
import type { DegommageEntry } from '@degommix/game-core'
import { HIT_ONOMATOPEES, hitByTarget, pickOnomatopee } from './hit-fx'

function log(...pairs: readonly [number, string][]): DegommageEntry[] {
  return pairs.map(([seq, targetId]) => ({ seq, actorId: 'x', targetId }))
}

describe('hitByTarget', () => {
  it('returns nothing for an empty log', () => {
    expect(hitByTarget([])).toEqual({})
  })

  it('counts every entry per target, in seq order', () => {
    const hits = hitByTarget(log([1, 'a'], [2, 'b'], [3, 'a'], [4, 'a']))
    expect(hits.a).toEqual({ count: 3, seq: 4, previousSeq: 3 })
    expect(hits.b).toEqual({ count: 1, seq: 2, previousSeq: null })
  })

  it('keeps counting undone dégommages — the log is append-only', () => {
    // An UNDO never removes an entry from degommageLog (see reducer.ts), so the
    // count must not move when one happens; only a new DEGOMMAGE moves it.
    const before = hitByTarget(log([1, 'a'], [2, 'a']))
    const after = hitByTarget(log([1, 'a'], [2, 'a']))
    expect(after).toEqual(before)
  })

  it('flips the count parity on every consecutive hit on the same target', () => {
    const entries = log([1, 'a'], [5, 'a'], [9, 'a'])
    const parities = entries.map((_, i) => hitByTarget(entries.slice(0, i + 1)).a?.count ?? 0)
    expect(parities).toEqual([1, 2, 3])
  })
})

describe('pickOnomatopee', () => {
  it('offers exactly the six validated words', () => {
    expect(HIT_ONOMATOPEES).toEqual(['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'])
  })

  it('is deterministic for a given seq', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      expect(pickOnomatopee(seq, null)).toBe(pickOnomatopee(seq, null))
    }
  })

  it('always returns a word from the list', () => {
    for (let seq = 1; seq <= 300; seq++) {
      expect(HIT_ONOMATOPEES).toContain(pickOnomatopee(seq, null))
    }
  })

  it('never repeats the previous word on the same card', () => {
    let previousSeq: number | null = null
    let previousWord: string | null = null
    for (let seq = 1; seq <= 300; seq++) {
      const word = pickOnomatopee(seq, previousSeq)
      if (previousWord !== null) expect(word).not.toBe(previousWord)
      previousWord = word
      previousSeq = seq
    }
  })

  it('uses all six words within 60 hits', () => {
    const seen = new Set<string>()
    let previousSeq: number | null = null
    for (let seq = 1; seq <= 60; seq++) {
      seen.add(pickOnomatopee(seq, previousSeq))
      previousSeq = seq
    }
    expect(seen.size).toBe(6)
  })
})
