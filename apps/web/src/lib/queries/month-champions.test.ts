import { describe, expect, it, vi } from 'vitest'
import { computeSeasonMeta, type MonthGameRow } from './month-champions'

// `month-champions.ts` (and the `stats.ts` it borrows the ranking order from)
// reach the database through `@/lib/db`, whose module-level `env` parse would
// throw here (unit tests run without the server env). Only the pure
// aggregation is under test, so a hollow stub keeps the import graph loadable
// — same convention as records.test.ts.
vi.mock('@/lib/db', () => ({ db: {} }))

const CURRENT_MONTH = '2026-07'

interface RowOverrides {
  userId?: string
  username?: string
  endedAt?: string
  outcome?: 'village_reached' | 'aborted'
  won?: boolean
  degommages?: number
}

/** Village game of « Astérix » in June 2026 unless overridden. */
function row(overrides: RowOverrides = {}): MonthGameRow {
  const userId = overrides.userId ?? 'a'
  return {
    userId,
    username: overrides.username ?? userId,
    avatarId: null,
    endedAt: new Date(overrides.endedAt ?? '2026-06-15T12:00:00Z'),
    outcome: overrides.outcome ?? 'village_reached',
    won: overrides.won ?? false,
    degommages: overrides.degommages ?? 0,
  }
}

describe('computeSeasonMeta', () => {
  it('returns nothing for an empty history', () => {
    expect(computeSeasonMeta([], CURRENT_MONTH)).toEqual({
      earliestMonth: null,
      pastChampions: [],
    })
  })

  it('never archives the running month', () => {
    const meta = computeSeasonMeta(
      [row({ endedAt: '2026-07-10T12:00:00Z', won: true })],
      CURRENT_MONTH
    )
    expect(meta.earliestMonth).toBe('2026-07')
    expect(meta.pastChampions).toEqual([])
  })

  it('crowns the clear winner of a completed month', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', won: true }),
        row({ userId: 'a', won: true }),
        row({ userId: 'b', won: false }),
      ],
      CURRENT_MONTH
    )
    expect(meta.earliestMonth).toBe('2026-06')
    expect(meta.pastChampions).toEqual([
      {
        month: '2026-06',
        userId: 'a',
        username: 'a',
        avatarId: null,
        wins: 2,
        barde: { userId: 'b', username: 'b', avatarId: null, wins: 0 },
      },
    ])
  })

  it('breaks a wins tie on winrate, aborted games staying out of the denominator', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', won: true }),
        row({ userId: 'a', won: true }),
        row({ userId: 'a', outcome: 'aborted' }),
        row({ userId: 'b', won: true }),
        row({ userId: 'b', won: true }),
        row({ userId: 'b', won: false }),
      ],
      CURRENT_MONTH
    )
    expect(meta.pastChampions).toHaveLength(1)
    expect(meta.pastChampions[0]?.userId).toBe('a')
  })

  it('breaks a wins+winrate tie on dégommages, aborted dégommages counting', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', won: true, degommages: 0 }),
        row({ userId: 'a', outcome: 'aborted', degommages: 5 }),
        row({ userId: 'b', won: true, degommages: 2 }),
      ],
      CURRENT_MONTH
    )
    expect(meta.pastChampions[0]?.userId).toBe('a')
    expect(meta.pastChampions[0]?.wins).toBe(1)
  })

  it('breaks a full tie on French collation of usernames', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'o', username: 'Obélix', won: true }),
        row({ userId: 'a', username: 'Astérix', won: true }),
      ],
      CURRENT_MONTH
    )
    expect(meta.pastChampions[0]?.username).toBe('Astérix')
  })

  it('leaves a month of aborted games championless but dated', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', outcome: 'aborted', degommages: 3 }),
        row({ userId: 'b', outcome: 'aborted', degommages: 1 }),
      ],
      CURRENT_MONTH
    )
    expect(meta.earliestMonth).toBe('2026-06')
    expect(meta.pastChampions).toEqual([])
  })

  it('orders months newest first and attributes a boundary instant to the new month', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', endedAt: '2026-05-15T12:00:00Z', won: true }),
        // 2026-06-01T00:00 Paris (CEST) — the first instant of June.
        row({ userId: 'b', endedAt: '2026-05-31T22:00:00Z', won: true }),
      ],
      CURRENT_MONTH
    )
    expect(meta.earliestMonth).toBe('2026-05')
    expect(meta.pastChampions.map((champion) => [champion.month, champion.userId])).toEqual([
      ['2026-06', 'b'],
      ['2026-05', 'a'],
    ])
  })

  it('names the last ranked player barde du soir', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', won: true }),
        row({ userId: 'a', won: true }),
        row({ userId: 'b', won: false }),
      ],
      CURRENT_MONTH
    )
    expect(meta.pastChampions[0]?.barde?.userId).toBe('b')
    expect(meta.pastChampions[0]?.barde?.wins).toBe(0)
    expect(meta.pastChampions[0]?.barde?.userId).not.toBe(meta.pastChampions[0]?.userId)
  })

  it('leaves a month with a single ranked player without a barde', () => {
    const meta = computeSeasonMeta([row({ userId: 'a', won: true })], CURRENT_MONTH)
    expect(meta.pastChampions).toHaveLength(1)
    expect(meta.pastChampions[0]?.userId).toBe('a')
    expect(meta.pastChampions[0]?.barde).toBeNull()
  })

  it('breaks a bottom tie on French collation', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'o', username: 'Obélix', won: true }),
        row({ userId: 'a', username: 'Astérix', won: true }),
      ],
      CURRENT_MONTH
    )
    expect(meta.pastChampions[0]?.username).toBe('Astérix')
    expect(meta.pastChampions[0]?.barde?.username).toBe('Obélix')
  })

  it('scopes the barde to its own month', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', endedAt: '2026-05-15T12:00:00Z', won: true }),
        row({ userId: 'b', endedAt: '2026-05-15T12:00:00Z', won: false }),
        row({ userId: 'a', won: false }),
        row({ userId: 'b', won: true }),
      ],
      CURRENT_MONTH
    )
    expect(
      meta.pastChampions.map((champion) => [champion.month, champion.userId, champion.barde?.userId])
    ).toEqual([
      ['2026-06', 'b', 'a'],
      ['2026-05', 'a', 'b'],
    ])
  })

  it('never names a player who sat the month out', () => {
    const meta = computeSeasonMeta(
      [
        row({ userId: 'a', won: true }),
        row({ userId: 'b', won: false }),
        row({ userId: 'c', endedAt: '2026-05-15T12:00:00Z', won: false }),
      ],
      CURRENT_MONTH
    )
    const june = meta.pastChampions.find((champion) => champion.month === '2026-06')
    expect(june?.barde?.userId).toBe('b')
    expect(
      meta.pastChampions.some(
        (champion) => champion.month === '2026-06' && champion.barde?.userId === 'c'
      )
    ).toBe(false)
  })
})
