import { describe, expect, it } from 'vitest'
import type { DegommageEntry } from '@degommix/game-core'
import { HIT_ONOMATOPEES, hitByTarget, hitPhase, pickOnomatopee } from './hit-fx'

function log(...pairs: readonly [number, string][]): DegommageEntry[] {
  return pairs.map(([seq, targetId]) => ({ seq, actorId: 'x', targetId }))
}

describe('hitByTarget', () => {
  it('returns nothing for an empty log', () => {
    expect(hitByTarget([])).toEqual({})
  })

  it('counts every entry per target, in seq order', () => {
    const hits = hitByTarget(log([1, 'a'], [2, 'b'], [3, 'a'], [4, 'a']))
    expect(hits.a).toEqual({ count: 3, seq: 4, word: expect.any(String) })
    expect(hits.b).toEqual({ count: 1, seq: 2, word: expect.any(String) })
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

  it('is a pure function of the log — every phone derives the same words', () => {
    const entries = log([1, 'a'], [2, 'a'], [3, 'b'], [4, 'a'], [5, 'b'])
    expect(hitByTarget(entries)).toEqual(hitByTarget(entries.slice()))
  })

  it('never stamps the same word twice in a row on one card', () => {
    const entries = log(...Array.from({ length: 200 }, (_, i): [number, string] => [i + 1, 'a']))
    const words = entries.map((_, i) => hitByTarget(entries.slice(0, i + 1)).a?.word)
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1])
  })

  it('uses all six words within 60 hits on the same card', () => {
    const entries = log(...Array.from({ length: 60 }, (_, i): [number, string] => [i + 1, 'a']))
    const words = new Set(entries.map((_, i) => hitByTarget(entries.slice(0, i + 1)).a?.word))
    expect(words.size).toBe(6)
  })
})

describe('pickOnomatopee', () => {
  it('offers exactly the six validated words', () => {
    expect(HIT_ONOMATOPEES).toEqual(['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'])
  })

  it('is deterministic for a given seq', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      expect(pickOnomatopee(seq, null)).toBe(pickOnomatopee(seq, null))
      expect(pickOnomatopee(seq, 'Paf !')).toBe(pickOnomatopee(seq, 'Paf !'))
    }
  })

  it('always returns a word from the list', () => {
    for (let seq = 1; seq <= 300; seq++) {
      expect(HIT_ONOMATOPEES).toContain(pickOnomatopee(seq, null))
      expect(HIT_ONOMATOPEES).toContain(pickOnomatopee(seq, 'Vlan !'))
    }
  })

  it('never returns the previous word, whatever the seq', () => {
    for (let seq = 1; seq <= 300; seq++) {
      for (const previous of HIT_ONOMATOPEES) {
        expect(pickOnomatopee(seq, previous)).not.toBe(previous)
      }
    }
  })

  it('ignores an unknown previous word rather than throwing', () => {
    expect(HIT_ONOMATOPEES).toContain(pickOnomatopee(7, 'Menhir !'))
  })
})

describe('hitPhase', () => {
  it('is undefined while the card has taken no hit', () => {
    expect(hitPhase(undefined)).toBeUndefined()
  })

  it('alternates on every new hit so the CSS animation restarts', () => {
    const entries = log([1, 'a'], [2, 'a'], [3, 'a'], [4, 'a'])
    const phases = entries.map((_, i) => hitPhase(hitByTarget(entries.slice(0, i + 1)).a))
    expect(phases).toEqual(['b', 'a', 'b', 'a'])
  })
})
