// No `vi.mock('@/lib/db')` here, unlike records.test.ts / month-champions.test.ts:
// `almanach.ts` is deliberately db-free (its query sibling lives in
// src/lib/queries/almanach.ts), so the import graph loads with no env at all.

import { describe, expect, it } from 'vitest'
import {
  computeBadFaith,
  computeDistance,
  computeFidelity,
  formatFrenchDecimal,
  formatFrenchNumber,
  formatTableTime,
  pickCarnageRecord,
  CARNAGE_MIN_DURATION_SEC,
} from './almanach'
import type { CharacterStatRow } from './character-stats'
import type { RivalryEventRow } from './rivalries'

function charRow(overrides: Partial<CharacterStatRow> = {}): CharacterStatRow {
  return {
    userId: 'a',
    character: 'asterix',
    played: 1,
    villageGames: 1,
    wins: 0,
    lastPlayed: 0,
    ...overrides,
  }
}

function hit(gameId: string, seq: number, actorId: string, targetId: string): RivalryEventRow {
  return { gameId, seq, type: 'DEGOMMAGE', actorId, targetId, payload: null }
}

function undo(gameId: string, seq: number, actorId: string, targetSeq: number): RivalryEventRow {
  return { gameId, seq, type: 'UNDO', actorId, targetId: null, payload: { targetSeq } }
}

/** `count` consecutive hits from `actorId` on `targetId`, starting at `fromSeq`. */
function hits(
  gameId: string,
  fromSeq: number,
  count: number,
  actorId: string,
  targetId: string
): RivalryEventRow[] {
  return Array.from({ length: count }, (_, index) =>
    hit(gameId, fromSeq + index, actorId, targetId)
  )
}

describe('computeDistance', () => {
  it('returns null with no dégommage at all', () => {
    expect(computeDistance(0)).toBeNull()
  })

  it('returns null for a negative total (defensive)', () => {
    expect(computeDistance(-3)).toBeNull()
  })

  it('converts a single dégommage into pas, metres and menhirs', () => {
    expect(computeDistance(1)).toEqual({ degommages: 1, pas: 38, meters: 28.5, menhirs: 7 })
  })

  it('runs the whole chain without rounding on an exact multiple', () => {
    expect(computeDistance(8)).toEqual({ degommages: 8, pas: 304, meters: 228, menhirs: 57 })
  })

  it('rounds half a menhir up', () => {
    expect(computeDistance(4)?.menhirs).toBe(29)
  })
})

describe('formatTableTime', () => {
  it('prints zero as 0 min', () => {
    expect(formatTableTime(0)).toBe('0 min')
  })

  it('prints under a minute in prose', () => {
    expect(formatTableTime(45)).toBe('moins d’une minute')
  })

  it('prints whole minutes under an hour', () => {
    expect(formatTableTime(1800)).toBe('30 min')
  })

  it('drops the minutes on whole hours', () => {
    expect(formatTableTime(7200)).toBe('2 h')
  })

  it('prints hours and minutes', () => {
    expect(formatTableTime(8100)).toBe('2 h 15 min')
  })
})

describe('pickCarnageRecord', () => {
  it('returns null with no row', () => {
    expect(pickCarnageRecord([])).toBeNull()
  })

  it('ignores games shorter than the minimum duration', () => {
    expect(pickCarnageRecord([{ gameId: 'a', durationSec: 60, degommages: 40 }])).toBeNull()
  })

  it('ignores a long game with no dégommage', () => {
    expect(pickCarnageRecord([{ gameId: 'a', durationSec: 3600, degommages: 0 }])).toBeNull()
  })

  it('picks the highest rate, not the highest count', () => {
    const best = pickCarnageRecord([
      { gameId: 'a', durationSec: 600, degommages: 30 },
      { gameId: 'b', durationSec: 180, degommages: 15 },
    ])
    expect(best?.gameId).toBe('b')
    expect(best?.perMinute).toBe(5)
  })

  it('accepts a game exactly at the minimum duration', () => {
    const best = pickCarnageRecord([
      { gameId: 'a', durationSec: CARNAGE_MIN_DURATION_SEC, degommages: 10 },
    ])
    expect(best?.gameId).toBe('a')
    expect(best?.perMinute).toBe(5)
  })

  it('breaks equal rates by carton, then by gameId', () => {
    const best = pickCarnageRecord([
      { gameId: 'b', durationSec: 240, degommages: 20 },
      { gameId: 'a', durationSec: 120, degommages: 10 },
      { gameId: 'c', durationSec: 240, degommages: 20 },
    ])
    expect(best?.gameId).toBe('b')
    expect(best?.perMinute).toBe(5)
  })
})

describe('computeFidelity', () => {
  it('returns an empty list with no row', () => {
    expect(computeFidelity([], new Map())).toEqual([])
  })

  it('excludes a player under the minimum seated games', () => {
    const rows = [charRow({ userId: 'a', character: 'asterix', played: 2 })]
    expect(computeFidelity(rows, new Map([['a', 'Alix']]))).toEqual([])
  })

  it('reports a single-character player as fully faithful', () => {
    const rows = [charRow({ userId: 'a', character: 'obelix', played: 4 })]
    const [row] = computeFidelity(rows, new Map([['a', 'Alix']]))
    expect(row).toMatchObject({ character: 'obelix', played: 4, totalPlayed: 4, share: 100 })
  })

  it('computes the share of the fetish character over every seated game', () => {
    const rows = [
      charRow({ userId: 'a', character: 'asterix', played: 6 }),
      charRow({ userId: 'a', character: 'caius_bonus', played: 2 }),
    ]
    const [row] = computeFidelity(rows, new Map([['a', 'Alix']]))
    expect(row).toMatchObject({ character: 'asterix', played: 6, totalPlayed: 8, share: 75 })
  })

  it('orders equal shares by games played desc', () => {
    const rows = [
      charRow({ userId: 'b', character: 'asterix', played: 4 }),
      charRow({ userId: 'a', character: 'obelix', played: 10 }),
    ]
    const result = computeFidelity(
      rows,
      new Map([
        ['a', 'Alix'],
        ['b', 'Bidule'],
      ])
    )
    expect(result.map((row) => row.userId)).toEqual(['a', 'b'])
  })

  it('falls back to Inconnu for a missing username', () => {
    const rows = [charRow({ userId: 'ghost', character: 'asterix', played: 3 })]
    expect(computeFidelity(rows, new Map())[0]?.username).toBe('Inconnu')
  })
})

describe('computeBadFaith', () => {
  it('returns an empty list with no event', () => {
    expect(computeBadFaith([], ['a'], new Map())).toEqual([])
  })

  it('excludes a player under the minimum suffered hits', () => {
    const events = hits('g1', 1, 4, 'x', 'a')
    expect(computeBadFaith(events, ['a', 'x'], new Map([['a', 'Alix']]))).toEqual([])
  })

  it('does not count an undone dégommage as suffered', () => {
    const events = [...hits('g1', 1, 6, 'x', 'a'), undo('g1', 7, 'a', 1)]
    const [row] = computeBadFaith(events, ['a', 'x'], new Map([['a', 'Alix']]))
    expect(row).toMatchObject({ userId: 'a', taken: 5, undos: 1, index: 20 })
  })

  it('credits an undo to its requester, not to the hit target', () => {
    const events = [
      ...hits('g1', 1, 6, 'b', 'a'),
      ...hits('g1', 10, 5, 'a', 'b'),
      undo('g1', 20, 'b', 1),
    ]
    const result = computeBadFaith(
      events,
      ['a', 'b'],
      new Map([
        ['a', 'Alix'],
        ['b', 'Bidule'],
      ])
    )
    expect(result.find((row) => row.userId === 'b')).toMatchObject({ undos: 1, taken: 5 })
    expect(result.find((row) => row.userId === 'a')).toMatchObject({ undos: 0, taken: 5 })
  })

  it('ignores players outside the circle', () => {
    const events = [...hits('g1', 1, 6, 'x', 'ghost'), undo('g1', 10, 'ghost', 1)]
    expect(computeBadFaith(events, ['a', 'x'], new Map())).toEqual([])
  })

  it('sorts by index desc, then undos desc, then username', () => {
    const events = [
      ...hits('g1', 1, 10, 'x', 'a'),
      undo('g1', 101, 'a', 1),
      undo('g1', 102, 'a', 2),
      undo('g1', 103, 'a', 3),
      undo('g1', 104, 'a', 4),
      undo('g1', 105, 'a', 5),
      ...hits('g1', 11, 8, 'x', 'edith'),
      undo('g1', 111, 'edith', 11),
      undo('g1', 112, 'edith', 12),
      undo('g1', 113, 'edith', 13),
      ...hits('g1', 21, 8, 'x', 'zoe'),
      undo('g1', 121, 'zoe', 21),
      undo('g1', 122, 'zoe', 22),
      undo('g1', 123, 'zoe', 23),
    ]
    const result = computeBadFaith(
      events,
      ['a', 'edith', 'zoe', 'x'],
      new Map([
        ['a', 'Alix'],
        ['edith', 'Édith'],
        ['zoe', 'Zoé'],
      ])
    )
    expect(result.map((row) => row.username)).toEqual(['Alix', 'Édith', 'Zoé'])
    expect(result.map((row) => row.index)).toEqual([100, 60, 60])
  })
})

describe('formatFrenchNumber / formatFrenchDecimal', () => {
  it('groups thousands without asserting the separator character', () => {
    const formatted = formatFrenchNumber(1247)
    // `\s` already covers U+00A0 and U+202F — never hard-code the separator,
    // Node's ICU emits a narrow no-break space for fr-FR.
    expect(formatted.replace(/\s/g, '')).toBe('1247')
    expect(formatted.length).toBeGreaterThan(4)
  })

  it('prints one decimal with a French comma', () => {
    expect(formatFrenchDecimal(3.25)).toBe('3,3')
  })
})
