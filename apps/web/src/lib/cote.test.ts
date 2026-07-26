import { describe, expect, it } from 'vitest'
import {
  applyGame,
  computeCotes,
  expectedScore,
  COTE_BASE,
  COTE_K,
  COTE_SCALE,
  type CoteGameResult,
} from './cote'

/** Seats of one finished village game; `winnerId` null = won by an outsider. */
function seats(gameId: string, winnerId: string | null, userIds: string[]): CoteGameResult[] {
  return userIds.map((userId) => ({ gameId, userId, won: userId === winnerId }))
}

/**
 * Chronological games → the newest-first row list `computeCotes` consumes
 * (queryVillageResults orders by `ended_at desc, id desc`).
 */
function newestFirstRows(...chronological: CoteGameResult[][]): CoteGameResult[] {
  return [...chronological].reverse().flat()
}

/** Sum of a raw rating map — the zero-sum invariant's left-hand side. */
function total(ratings: ReadonlyMap<string, number>): number {
  let sum = 0
  for (const rating of ratings.values()) sum += rating
  return sum
}

describe('expectedScore', () => {
  it('is 0.5 for equal ratings and symmetric', () => {
    expect(expectedScore(COTE_BASE, COTE_BASE)).toBe(0.5)
    expect(expectedScore(1234, 987) + expectedScore(987, 1234)).toBeCloseTo(1, 12)
  })

  it('gives the favourite 10/11 across a full COTE_SCALE gap', () => {
    expect(expectedScore(COTE_BASE + COTE_SCALE, COTE_BASE)).toBeCloseTo(10 / 11, 12)
    expect(expectedScore(COTE_BASE, COTE_BASE + COTE_SCALE)).toBeCloseTo(1 / 11, 12)
  })
})

describe('computeCotes — hand-computed fixtures', () => {
  it('moves an even 1v1 by exactly COTE_K / 2', () => {
    const entries = computeCotes(newestFirstRows(seats('g1', 'a', ['a', 'b'])))
    expect(entries).toEqual([
      { userId: 'a', cote: COTE_BASE + COTE_K / 2, games: 1, trend: 16 },
      { userId: 'b', cote: COTE_BASE - COTE_K / 2, games: 1, trend: -16 },
    ])
  })

  it('scores a 2-player sequence from pre-game ratings', () => {
    // Game 2 pre: A 1016, B 984. E(B,A) = 1/(1+10^0.08) = 0.4540787…
    // gain = 32 × 0.5459213… = 17.46948… → B 1001.46948…, A 998.53052…
    const entries = computeCotes(
      newestFirstRows(seats('g1', 'a', ['a', 'b']), seats('g2', 'b', ['a', 'b']))
    )
    expect(entries).toEqual([
      { userId: 'b', cote: 1001, games: 2, trend: 17 },
      { userId: 'a', cote: 999, games: 2, trend: -17 },
    ])
  })

  it('pays a 4-player win three even duels at once', () => {
    const entries = computeCotes(newestFirstRows(seats('g1', 'a', ['a', 'b', 'c', 'd'])))
    expect(entries).toEqual([
      { userId: 'a', cote: 1048, games: 1, trend: 48 },
      { userId: 'b', cote: 984, games: 1, trend: -16 },
      { userId: 'c', cote: 984, games: 1, trend: -16 },
      { userId: 'd', cote: 984, games: 1, trend: -16 },
    ])
  })

  it('scores a 4-player sequence from pre-game ratings', () => {
    // Game 2 pre: A 1048, B/C/D 984. E(B,A) = 1/(1+10^0.16) = 0.408925…
    // gain(A) = 18.9144…, gain(C) = gain(D) = 16
    // → B 1034.9144…, A 1029.0856…, C = D = 968
    const entries = computeCotes(
      newestFirstRows(
        seats('g1', 'a', ['a', 'b', 'c', 'd']),
        seats('g2', 'b', ['a', 'b', 'c', 'd'])
      )
    )
    expect(entries).toEqual([
      { userId: 'b', cote: 1035, games: 2, trend: 51 },
      { userId: 'a', cote: 1029, games: 2, trend: -19 },
      { userId: 'c', cote: 968, games: 2, trend: -16 },
      { userId: 'd', cote: 968, games: 2, trend: -16 },
    ])
  })

  it('keeps the raw 4-player sequence within floating-point noise of the hand figures', () => {
    const afterFirst = applyGame(new Map(), {
      participantIds: ['a', 'b', 'c', 'd'],
      winnerId: 'a',
    })
    const afterSecond = applyGame(afterFirst, {
      participantIds: ['a', 'b', 'c', 'd'],
      winnerId: 'b',
    })
    expect(afterSecond.get('b')).toBeCloseTo(1034.9144, 3)
    expect(afterSecond.get('a')).toBeCloseTo(1029.0856, 3)
    expect(afterSecond.get('c')).toBeCloseTo(968, 9)
    expect(afterSecond.get('d')).toBeCloseTo(968, 9)
  })
})

describe('applyGame — zero-sum invariant', () => {
  it('conserves the total across every game shape', () => {
    const shapes: { participantIds: string[]; winnerId: string }[] = [
      { participantIds: ['a', 'b'], winnerId: 'a' },
      { participantIds: ['a', 'b'], winnerId: 'b' },
      { participantIds: ['a', 'b', 'c', 'd'], winnerId: 'a' },
      { participantIds: ['a', 'b', 'c', 'd'], winnerId: 'b' },
      { participantIds: ['a', 'b', 'c'], winnerId: 'c' },
    ]
    let ratings: ReadonlyMap<string, number> = new Map()
    for (const shape of shapes) {
      const before = new Set([...ratings.keys(), ...shape.participantIds])
      const post = applyGame(ratings, shape)
      expect(post.size).toBe(before.size)
      expect(total(post)).toBeCloseTo(COTE_BASE * post.size, 9)
      ratings = post
    }
  })

  it('never mutates the input map', () => {
    const before = new Map([['a', 1200]])
    applyGame(before, { participantIds: ['a', 'b'], winnerId: 'b' })
    expect(before.get('a')).toBe(1200)
    expect(before.has('b')).toBe(false)
  })
})

describe('computeCotes — fold properties', () => {
  const history = [
    seats('g1', 'a', ['a', 'b', 'c']),
    seats('g2', 'b', ['a', 'b', 'c']),
    seats('g3', 'c', ['b', 'c']),
  ]

  it('is deterministic for identical input', () => {
    const rows = newestFirstRows(...history)
    expect(computeCotes(rows)).toEqual(computeCotes(rows))
  })

  it('equals folding the same games one by one (retroactivity)', () => {
    let ratings: ReadonlyMap<string, number> = new Map()
    ratings = applyGame(ratings, { participantIds: ['a', 'b', 'c'], winnerId: 'a' })
    ratings = applyGame(ratings, { participantIds: ['a', 'b', 'c'], winnerId: 'b' })
    ratings = applyGame(ratings, { participantIds: ['b', 'c'], winnerId: 'c' })

    const entries = computeCotes(newestFirstRows(...history))
    expect(entries).toHaveLength(3)
    for (const entry of entries) {
      expect(entry.cote).toBe(Math.round(ratings.get(entry.userId) ?? Number.NaN))
    }
  })

  it('produces different cotes when the same games arrive in the opposite order', () => {
    const first = seats('g1', 'a', ['a', 'b'])
    const second = seats('g2', 'b', ['b', 'c'])
    const forward = computeCotes(newestFirstRows(first, second))
    const backward = computeCotes(newestFirstRows(second, first))
    expect(forward).not.toEqual(backward)
  })
})

describe('computeCotes — skips and thresholds', () => {
  it('returns [] for no rows', () => {
    expect(computeCotes([])).toEqual([])
  })

  it('skips a game won by someone outside the circle', () => {
    const outsiderGame = seats('g1', null, ['a', 'b'])
    expect(computeCotes(newestFirstRows(outsiderGame))).toEqual([])
  })

  it('leaves ratings untouched when an outsider win sits between rated games', () => {
    const rated = computeCotes(newestFirstRows(seats('g1', 'a', ['a', 'b'])))
    const withOutsider = computeCotes(
      newestFirstRows(seats('g1', 'a', ['a', 'b']), seats('g2', null, ['a', 'b']))
    )
    expect(withOutsider).toEqual(rated)
  })

  it('skips a lone circle member among strangers', () => {
    expect(computeCotes(newestFirstRows(seats('g1', 'a', ['a'])))).toEqual([])
  })

  it('reports the fold’s own rated-game count, below the UI threshold', () => {
    const entries = computeCotes(
      newestFirstRows(seats('g1', 'a', ['a', 'b']), seats('g2', 'a', ['a', 'b']))
    )
    expect(entries.map((entry) => entry.games)).toEqual([2, 2])
  })
})
