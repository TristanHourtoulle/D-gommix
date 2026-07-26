import { describe, expect, it } from 'vitest'
import {
  compareStandings,
  monthWindowParis,
  nextMonthKey,
  parseMonthKey,
  previousMonthKey,
  type RankedStanding,
} from './season'

/**
 * game-core owns the Paris-month maths since plan 039, so it owns a direct test
 * of it. The web suite (apps/web/src/lib/season.test.ts) still exercises the
 * same functions through the `@/lib/season` re-export — deliberately, since
 * that is the entry point every web surface imports.
 */
describe('monthWindowParis', () => {
  it('crosses the spring DST switch: March opens in CET and closes in CEST', () => {
    const window = monthWindowParis('2026-03')
    expect(window?.from.toISOString()).toBe('2026-02-28T23:00:00.000Z')
    expect(window?.to.toISOString()).toBe('2026-03-31T22:00:00.000Z')
  })

  it('is null on a malformed key', () => {
    expect(monthWindowParis('2026-13')).toBeNull()
  })
})

describe('parseMonthKey', () => {
  it('rejects an out-of-range month, an unpadded month and plain junk', () => {
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('2026-1')).toBeNull()
    expect(parseMonthKey('nope')).toBeNull()
    expect(parseMonthKey('2026-07')).toEqual({ year: 2026, month: 7 })
  })
})

describe('month arithmetic', () => {
  it('steps across the year boundary in both directions', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(nextMonthKey('2026-12')).toBe('2027-01')
    expect(previousMonthKey('nope')).toBeNull()
    expect(nextMonthKey('nope')).toBeNull()
  })
})

describe('compareStandings', () => {
  const standing = (over: Partial<RankedStanding> = {}): RankedStanding => ({
    wins: 0,
    winrate: 0,
    degommages: 0,
    username: 'Zz',
    ...over,
  })

  it('ranks wins, then winrate, then dégommages, then username with the fr collator', () => {
    expect(compareStandings(standing({ wins: 2 }), standing({ wins: 1 }))).toBeLessThan(0)
    expect(
      compareStandings(standing({ wins: 1, winrate: 80 }), standing({ wins: 1, winrate: 40 }))
    ).toBeLessThan(0)
    expect(
      compareStandings(
        standing({ wins: 1, winrate: 50, degommages: 9 }),
        standing({ wins: 1, winrate: 50, degommages: 3 })
      )
    ).toBeLessThan(0)
    // `é` sorts right after `e` under the fr collator, not after `z` as it
    // would under a byte comparison — the reason the locale is pinned.
    expect(compareStandings(standing({ username: 'Ella' }), standing({ username: 'Éva' }))).toBeLessThan(0)
    expect(compareStandings(standing({ username: 'Éva' }), standing({ username: 'Zoé' }))).toBeLessThan(0)
  })

  it('sorts a whole table into the leaderboard order', () => {
    const rows = [
      standing({ username: 'Bonemine', wins: 1, winrate: 50, degommages: 4 }),
      standing({ username: 'Astérix', wins: 3, winrate: 75, degommages: 12 }),
      standing({ username: 'Obélix', wins: 1, winrate: 50, degommages: 9 }),
    ]
    expect([...rows].sort(compareStandings).map((row) => row.username)).toEqual([
      'Astérix',
      'Obélix',
      'Bonemine',
    ])
  })
})
