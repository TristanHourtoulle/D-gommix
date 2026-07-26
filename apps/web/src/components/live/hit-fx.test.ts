import { describe, expect, it } from 'vitest'
import type { CharacterId, DegommageEntry } from '@degommix/game-core'
import {
  HIT_CAMP_FALLBACK,
  HIT_ONOMATOPEES,
  HIT_ONOMATOPEES_BY_CAMP,
  hitByTarget,
  hitPhase,
  pickOnomatopee,
} from './hit-fx'

const GAME = '9f1b7c2e-0000-4000-8000-000000000001'
const OTHER_GAME = '9f1b7c2e-0000-4000-8000-000000000002'

const CAMPS: readonly CharacterId[] = ['asterix', 'obelix', 'caius_bonus', 'caligula_minus']

/** Four seated players, one per camp, ids `a0`…`a3`. */
const PLAYERS = Object.fromEntries(CAMPS.map((character, i) => [`a${i}`, { character }])) as Record<
  string,
  { character: CharacterId }
>

function log(...triples: readonly [number, string, string][]): DegommageEntry[] {
  return triples.map(([seq, actorId, targetId]) => ({ seq, actorId, targetId }))
}

describe('HIT_ONOMATOPEES_BY_CAMP', () => {
  it('covers the four camps with a non-empty set each', () => {
    for (const camp of CAMPS) expect(HIT_ONOMATOPEES_BY_CAMP[camp].length).toBeGreaterThan(1)
  })

  it('gives « Paf ! » to Astérix and « Boum ! » to Obélix', () => {
    expect(HIT_ONOMATOPEES_BY_CAMP.asterix).toContain('Paf !')
    expect(HIT_ONOMATOPEES_BY_CAMP.obelix).toContain('Boum !')
  })

  it('uses pairwise-distinct words across camps — the no-repeat invariant rests on it', () => {
    expect(new Set(HIT_ONOMATOPEES).size).toBe(HIT_ONOMATOPEES.length)
  })

  it('flattens every camp set into HIT_ONOMATOPEES', () => {
    for (const camp of CAMPS) {
      for (const word of HIT_ONOMATOPEES_BY_CAMP[camp]) expect(HIT_ONOMATOPEES).toContain(word)
    }
  })
})

describe('hitByTarget', () => {
  it('returns nothing for an empty log', () => {
    expect(hitByTarget(GAME, [], PLAYERS)).toEqual({})
  })

  it('counts every entry per target, in seq order', () => {
    const hits = hitByTarget(
      GAME,
      log([1, 'a1', 'a'], [2, 'a1', 'b'], [3, 'a1', 'a'], [4, 'a1', 'a']),
      PLAYERS
    )
    expect(hits.a).toEqual({ count: 3, seq: 4, word: expect.any(String), camp: 'obelix' })
    expect(hits.b).toEqual({ count: 1, seq: 2, word: expect.any(String), camp: 'obelix' })
  })

  it('keeps counting undone dégommages — the log is append-only', () => {
    // An UNDO never removes an entry from degommageLog (see reducer.ts), so the
    // count must not move when one happens; only a new DEGOMMAGE moves it.
    const before = hitByTarget(GAME, log([1, 'a1', 'a'], [2, 'a1', 'a']), PLAYERS)
    const after = hitByTarget(GAME, log([1, 'a1', 'a'], [2, 'a1', 'a']), PLAYERS)
    expect(after).toEqual(before)
  })

  it('flips the count parity on every consecutive hit on the same target', () => {
    const entries = log([1, 'a1', 'a'], [5, 'a1', 'a'], [9, 'a1', 'a'])
    const parities = entries.map(
      (_, i) => hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a?.count ?? 0
    )
    expect(parities).toEqual([1, 2, 3])
  })

  it('is a pure function of the log — every phone derives the same words', () => {
    const entries = log(
      [1, 'a1', 'a'],
      [2, 'a1', 'a'],
      [3, 'a2', 'b'],
      [4, 'a2', 'a'],
      [5, 'a3', 'b']
    )
    expect(hitByTarget(GAME, entries, PLAYERS)).toEqual(hitByTarget(GAME, entries.slice(), PLAYERS))
  })

  it('never stamps the same word twice in a row on one card', () => {
    const entries = log(
      ...Array.from({ length: 200 }, (_, i): [number, string, string] => [i + 1, 'a1', 'a'])
    )
    const words = entries.map((_, i) => hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a?.word)
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1])
  })
})

describe('hitByTarget — camps', () => {
  it('tags the hit with the ACTOR’s camp, not the target’s', () => {
    const hits = hitByTarget(GAME, log([1, 'a1', 'a0']), PLAYERS)
    expect(hits.a0?.camp).toBe('obelix')
  })

  it('falls back to Astérix when the actor is not in the players map', () => {
    const hits = hitByTarget(GAME, log([1, 'ghost', 'a0']), PLAYERS)
    expect(hits.a0?.camp).toBe(HIT_CAMP_FALLBACK)
    expect(HIT_CAMP_FALLBACK).toBe('asterix')
  })

  it('changes camp when the hitter changes', () => {
    const entries = log([1, 'a1', 'a0'], [2, 'a2', 'a0'], [3, 'a3', 'a0'])
    const camps = entries.map(
      (_, i) => hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a0?.camp
    )
    expect(camps).toEqual(['obelix', 'caius_bonus', 'caligula_minus'])
  })

  it('stamps a word from the actor’s camp', () => {
    for (let seq = 1; seq <= 120; seq++) {
      const hits = hitByTarget(GAME, log([seq, 'a2', 'a0']), PLAYERS)
      expect(HIT_ONOMATOPEES_BY_CAMP.caius_bonus).toContain(hits.a0?.word)
    }
  })

  it('never stamps the same word twice in a row, even when the hitter alternates', () => {
    const entries = log(
      ...Array.from({ length: 200 }, (_, i): [number, string, string] => [i + 1, `a${i % 4}`, 'a0'])
    )
    const words = entries.map(
      (_, i) => hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a0?.word
    )
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1])
  })

  it('uses every word of a camp within 60 hits from that camp', () => {
    const entries = log(
      ...Array.from({ length: 60 }, (_, i): [number, string, string] => [i + 1, 'a1', 'a0'])
    )
    const words = new Set(
      entries.map((_, i) => hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a0?.word)
    )
    expect(words.size).toBe(HIT_ONOMATOPEES_BY_CAMP.obelix.length)
  })

  it('is a pure function of (gameId, log, players) — every phone derives the same hit', () => {
    const entries = log([1, 'a1', 'a0'], [2, 'a2', 'a0'], [3, 'a0', 'a1'])
    expect(hitByTarget(GAME, entries, PLAYERS)).toEqual(
      hitByTarget(GAME, entries.slice(), { ...PLAYERS })
    )
  })
})

describe('pickOnomatopee — per camp', () => {
  it('is deterministic for a given game, seq and camp', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      for (const camp of CAMPS) {
        expect(pickOnomatopee(GAME, seq, null, camp)).toBe(pickOnomatopee(GAME, seq, null, camp))
        expect(pickOnomatopee(GAME, seq, 'Paf !', camp)).toBe(
          pickOnomatopee(GAME, seq, 'Paf !', camp)
        )
      }
    }
  })

  it('does not stamp the same first word on every game', () => {
    // Same monotony as the journal sentences: seeded on `seq` alone, the very
    // first hit of every single game stamped the very same word.
    const first = new Set(
      Array.from({ length: 60 }, (_, i) => pickOnomatopee(`game-${i}`, 2, null, 'asterix'))
    )
    expect(first.size).toBe(HIT_ONOMATOPEES_BY_CAMP.asterix.length)
    expect(pickOnomatopee(GAME, 2, null, 'asterix')).not.toBe(
      pickOnomatopee(OTHER_GAME, 2, null, 'asterix')
    )
  })

  it('always returns a word from the camp’s own set', () => {
    for (let seq = 1; seq <= 300; seq++) {
      for (const camp of CAMPS) {
        expect(HIT_ONOMATOPEES_BY_CAMP[camp]).toContain(pickOnomatopee(GAME, seq, null, camp))
      }
    }
  })

  it('never returns the previous word, whatever the seq and the camp', () => {
    for (let seq = 1; seq <= 200; seq++) {
      for (const camp of CAMPS) {
        for (const previous of HIT_ONOMATOPEES) {
          expect(pickOnomatopee(GAME, seq, previous, camp)).not.toBe(previous)
        }
      }
    }
  })

  it('ignores an unknown previous word rather than throwing', () => {
    for (const camp of CAMPS) {
      expect(HIT_ONOMATOPEES_BY_CAMP[camp]).toContain(pickOnomatopee(GAME, 7, 'Not a word !', camp))
    }
  })
})

describe('hitPhase', () => {
  it('is undefined while the card has taken no hit', () => {
    expect(hitPhase(undefined)).toBeUndefined()
  })

  it('alternates on every new hit so the CSS animation restarts', () => {
    const entries = log([1, 'a1', 'a'], [2, 'a1', 'a'], [3, 'a1', 'a'], [4, 'a1', 'a'])
    const phases = entries.map((_, i) =>
      hitPhase(hitByTarget(GAME, entries.slice(0, i + 1), PLAYERS).a)
    )
    expect(phases).toEqual(['b', 'a', 'b', 'a'])
  })
})
