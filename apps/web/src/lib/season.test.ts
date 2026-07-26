import { describe, expect, it } from 'vitest'
import { startOfCurrentMonthParis } from './season'

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
