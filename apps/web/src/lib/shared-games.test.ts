import { describe, expect, it } from 'vitest'
import { durationSeconds, filterSharedGames, resolveMyResult } from './shared-games'

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
