import { describe, expect, it, vi } from 'vitest'
import { pickLongestStreakHolder, type VillageResultRow } from './records'

// `records.ts` reaches the database through `@/lib/db`, whose module-level
// `env` parse would throw here (unit tests run without the server env). Only
// the pure picker is under test, and it never touches `db`, so a hollow stub
// is enough to keep the import graph loadable.
vi.mock('@/lib/db', () => ({ db: {} }))

function row(userId: string, username: string | null): VillageResultRow {
  // `gameId` is unread by the picker; it exists for the cote fold (plan 043).
  return { gameId: `g-${userId}`, userId, username, avatarId: null, won: true }
}

describe('pickLongestStreakHolder', () => {
  it('returns null when nobody has a streak', () => {
    expect(pickLongestStreakHolder(new Map(), [])).toBeNull()
  })

  it('returns null when the best streak is a lone win', () => {
    expect(pickLongestStreakHolder(new Map([['a', 1]]), [row('a', 'Obelix')])).toBeNull()
  })

  it('reports the holder identity and the streak count', () => {
    const record = pickLongestStreakHolder(new Map([['a', 3]]), [row('a', 'Obelix')])
    expect(record).toEqual({
      holder: { userId: 'a', username: 'Obelix', avatarId: null },
      count: 3,
    })
  })

  it('breaks a tie on French alphabetical order', () => {
    const record = pickLongestStreakHolder(
      new Map([
        ['a', 2],
        ['b', 2],
      ]),
      [row('a', 'Zoé'), row('b', 'Édith')]
    )
    expect(record?.holder.username).toBe('Édith')
    expect(record?.count).toBe(2)
  })

  it('falls back to « Inconnu » when no row carries the holder', () => {
    const record = pickLongestStreakHolder(new Map([['a', 2]]), [])
    expect(record?.holder).toEqual({ userId: 'a', username: 'Inconnu', avatarId: null })
  })
})
