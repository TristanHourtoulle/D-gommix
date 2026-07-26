import { describe, expect, it } from 'vitest'
import {
  computeSharedRecord,
  durationSeconds,
  filterSharedGames,
  resolveMyResult,
} from './shared-games'

describe('filterSharedGames', () => {
  it('keeps only games present in both sets', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    const shared = filterSharedGames(rows, new Set(['b', 'z']), 20)

    expect(shared).toEqual([{ id: 'b' }])
  })

  it('preserves the input order', () => {
    const rows = [{ id: 'c' }, { id: 'a' }, { id: 'b' }]

    const shared = filterSharedGames(rows, new Set(['a', 'b', 'c']), 20)

    expect(shared.map((row) => row.id)).toEqual(['c', 'a', 'b'])
  })

  it('caps the result at the limit', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    const shared = filterSharedGames(rows, new Set(['a', 'b', 'c', 'd']), 2)

    expect(shared.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('returns an empty array when the other set is empty', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]

    expect(filterSharedGames(rows, new Set<string>(), 20)).toEqual([])
  })

  it('returns an empty array when there are no rows', () => {
    expect(filterSharedGames([], new Set(['a']), 20)).toEqual([])
  })
})

describe('resolveMyResult', () => {
  it('returns aborted whatever the winner is', () => {
    expect(resolveMyResult('aborted', 'viewer', 'viewer')).toBe('aborted')
    expect(resolveMyResult('aborted', 'other', 'viewer')).toBe('aborted')
    expect(resolveMyResult('aborted', null, 'viewer')).toBe('aborted')
  })

  it('returns won when the viewer is the winner', () => {
    expect(resolveMyResult('village_reached', 'viewer', 'viewer')).toBe('won')
  })

  it('returns lost when the winner is someone else or null', () => {
    expect(resolveMyResult('village_reached', 'other', 'viewer')).toBe('lost')
    expect(resolveMyResult('village_reached', null, 'viewer')).toBe('lost')
    expect(resolveMyResult(null, null, 'viewer')).toBe('lost')
  })
})

describe('computeSharedRecord', () => {
  it('computes played and per-player wins over mixed rows', () => {
    const rows = [
      { id: 'a', outcome: 'village_reached' as const, winnerId: 'me' },
      { id: 'b', outcome: 'village_reached' as const, winnerId: 'friend' },
      { id: 'c', outcome: 'village_reached' as const, winnerId: 'me' },
      { id: 'd', outcome: 'aborted' as const, winnerId: null },
    ]

    const record = computeSharedRecord(rows, new Set(['a', 'b', 'c', 'd']), 'me', 'friend')

    expect(record).toEqual({ played: 4, winsMine: 2, winsTheirs: 1 })
  })

  it('ignores rows outside the shared set entirely', () => {
    const rows = [
      { id: 'a', outcome: 'village_reached' as const, winnerId: 'me' },
      { id: 'x', outcome: 'village_reached' as const, winnerId: 'me' },
    ]

    const record = computeSharedRecord(rows, new Set(['a']), 'me', 'friend')

    expect(record).toEqual({ played: 1, winsMine: 1, winsTheirs: 0 })
  })

  it('counts a game won by a third player in played only', () => {
    const rows = [{ id: 'a', outcome: 'village_reached' as const, winnerId: 'stranger' }]

    const record = computeSharedRecord(rows, new Set(['a']), 'me', 'friend')

    expect(record).toEqual({ played: 1, winsMine: 0, winsTheirs: 0 })
  })

  it('counts an aborted game in played only, even with a non-null winnerId', () => {
    const rows = [
      { id: 'a', outcome: 'aborted' as const, winnerId: 'me' },
      { id: 'b', outcome: 'aborted' as const, winnerId: 'friend' },
    ]

    const record = computeSharedRecord(rows, new Set(['a', 'b']), 'me', 'friend')

    expect(record).toEqual({ played: 2, winsMine: 0, winsTheirs: 0 })
  })

  it('runs over the full shared set, beyond the 20-game display cap', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `game-${index}`,
      outcome: 'village_reached' as const,
      winnerId: 'me',
    }))
    const sharedIds = new Set(rows.map((row) => row.id))

    const record = computeSharedRecord(rows, sharedIds, 'me', 'friend')

    expect(record).toEqual({ played: 25, winsMine: 25, winsTheirs: 0 })
  })

  it('returns zeros for empty rows or an empty shared set', () => {
    const rows = [{ id: 'a', outcome: 'village_reached' as const, winnerId: 'me' }]

    expect(computeSharedRecord([], new Set(['a']), 'me', 'friend')).toEqual({
      played: 0,
      winsMine: 0,
      winsTheirs: 0,
    })
    expect(computeSharedRecord(rows, new Set<string>(), 'me', 'friend')).toEqual({
      played: 0,
      winsMine: 0,
      winsTheirs: 0,
    })
  })

  it('counts a null outcome with the viewer as winner as a viewer win', () => {
    const rows = [{ id: 'a', outcome: null, winnerId: 'me' }]

    const record = computeSharedRecord(rows, new Set(['a']), 'me', 'friend')

    expect(record).toEqual({ played: 1, winsMine: 1, winsTheirs: 0 })
  })
})

describe('durationSeconds', () => {
  it('returns null when startedAt or endedAt is missing', () => {
    const date = new Date('2026-07-25T10:00:00.000Z')

    expect(durationSeconds(null, date)).toBeNull()
    expect(durationSeconds(date, null)).toBeNull()
    expect(durationSeconds(null, null)).toBeNull()
  })

  it('rounds to whole seconds', () => {
    const startedAt = new Date('2026-07-25T10:00:00.000Z')

    expect(durationSeconds(startedAt, new Date('2026-07-25T10:01:05.400Z'))).toBe(65)
    expect(durationSeconds(startedAt, new Date('2026-07-25T10:01:05.600Z'))).toBe(66)
  })

  it('never goes negative', () => {
    const startedAt = new Date('2026-07-25T10:00:00.000Z')

    expect(durationSeconds(startedAt, new Date('2026-07-25T09:59:00.000Z'))).toBe(0)
  })
})
