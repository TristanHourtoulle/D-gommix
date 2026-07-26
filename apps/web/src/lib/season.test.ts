import { describe, expect, it } from 'vitest'
import {
  monthWindowParis,
  nextMonthKey,
  parisMonthKeyOf,
  parseMonthKey,
  previousMonthKey,
  startOfCurrentMonthParis,
  startOfMonthParis,
} from './season'

describe('startOfCurrentMonthParis', () => {
  it('returns July 1 00:00 Paris (+02:00) for a summer instant', () => {
    expect(startOfCurrentMonthParis(new Date('2026-07-15T10:00:00Z')).toISOString()).toBe(
      '2026-06-30T22:00:00.000Z'
    )
  })

  it('returns January 1 00:00 Paris (+01:00) across the year rollover', () => {
    expect(startOfCurrentMonthParis(new Date('2026-01-20T10:00:00Z')).toISOString()).toBe(
      '2025-12-31T23:00:00.000Z'
    )
  })

  it('uses the CET offset of March 1 after the spring DST switch mid-month', () => {
    expect(startOfCurrentMonthParis(new Date('2026-03-30T10:00:00Z')).toISOString()).toBe(
      '2026-02-28T23:00:00.000Z'
    )
  })

  it('uses the CEST offset of October 1 after the autumn DST switch mid-month', () => {
    expect(startOfCurrentMonthParis(new Date('2026-10-27T10:00:00Z')).toISOString()).toBe(
      '2026-09-30T22:00:00.000Z'
    )
  })

  it('keeps an instant exactly at the boundary in the new month', () => {
    expect(startOfCurrentMonthParis(new Date('2026-06-30T22:00:00Z')).toISOString()).toBe(
      '2026-06-30T22:00:00.000Z'
    )
  })
})

describe('startOfMonthParis', () => {
  it('resolves a summer month to its CEST boundary', () => {
    expect(startOfMonthParis(2026, 7).toISOString()).toBe('2026-06-30T22:00:00.000Z')
  })

  it('resolves a winter month to its CET boundary', () => {
    expect(startOfMonthParis(2026, 3).toISOString()).toBe('2026-02-28T23:00:00.000Z')
  })

  it('resolves the first month after the autumn switch to CET', () => {
    expect(startOfMonthParis(2026, 11).toISOString()).toBe('2026-10-31T23:00:00.000Z')
  })
})

describe('monthWindowParis', () => {
  it('straddles the spring DST switch: CET lower bound, CEST upper bound', () => {
    const window = monthWindowParis('2026-03')
    expect(window?.from.toISOString()).toBe('2026-02-28T23:00:00.000Z')
    expect(window?.to.toISOString()).toBe('2026-03-31T22:00:00.000Z')
  })

  it('straddles the autumn DST switch: CEST lower bound, CET upper bound', () => {
    const window = monthWindowParis('2026-10')
    expect(window?.from.toISOString()).toBe('2026-09-30T22:00:00.000Z')
    expect(window?.to.toISOString()).toBe('2026-10-31T23:00:00.000Z')
  })

  it('rolls the year over in the upper bound', () => {
    const window = monthWindowParis('2025-12')
    expect(window?.from.toISOString()).toBe('2025-11-30T23:00:00.000Z')
    expect(window?.to.toISOString()).toBe('2025-12-31T23:00:00.000Z')
  })
})

describe('parisMonthKeyOf', () => {
  it('attributes a boundary instant to the new month', () => {
    expect(parisMonthKeyOf(new Date('2026-06-30T22:00:00Z'))).toBe('2026-07')
    expect(parisMonthKeyOf(new Date('2026-06-30T21:59:59Z'))).toBe('2026-06')
  })
})

describe('month key navigation', () => {
  it('steps across the year rollover and rejects malformed keys', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(nextMonthKey('2025-12')).toBe('2026-01')
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(monthWindowParis('garbage')).toBeNull()
  })
})
