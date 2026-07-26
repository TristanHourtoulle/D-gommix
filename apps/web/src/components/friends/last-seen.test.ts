import { describe, expect, it } from 'vitest'
import { formatLastSeen } from './last-seen'

const NOW = new Date('2026-07-26T12:00:00.000Z')

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

const SECOND = 1_000
const MINUTE = 60_000
const HOUR = 3_600_000

describe('formatLastSeen', () => {
  it('returns null for a null input', () => {
    expect(formatLastSeen(null, NOW)).toBeNull()
  })

  it('returns null for an invalid ISO string', () => {
    expect(formatLastSeen('not-a-date', NOW)).toBeNull()
  })

  it('returns « à l’instant » under a minute — 59 s', () => {
    expect(formatLastSeen(ago(59 * SECOND), NOW)).toBe('à l’instant')
  })

  it('returns « à l’instant » for a timestamp slightly in the future (clock skew)', () => {
    expect(formatLastSeen(ago(-5 * SECOND), NOW)).toBe('à l’instant')
  })

  it('switches to minutes at exactly 60 s', () => {
    expect(formatLastSeen(ago(60 * SECOND), NOW)).toBe('il y a 1 min')
  })

  it('stays in minutes at 59 min', () => {
    expect(formatLastSeen(ago(59 * MINUTE), NOW)).toBe('il y a 59 min')
  })

  it('switches to hours at exactly 60 min', () => {
    expect(formatLastSeen(ago(60 * MINUTE), NOW)).toBe('il y a 1 h')
  })

  it('stays in hours at 23 h', () => {
    expect(formatLastSeen(ago(23 * HOUR), NOW)).toBe('il y a 23 h')
  })

  it('switches to « hier » at exactly 24 h', () => {
    expect(formatLastSeen(ago(24 * HOUR), NOW)).toBe('hier')
  })

  it('stays on « hier » at 47 h', () => {
    expect(formatLastSeen(ago(47 * HOUR), NOW)).toBe('hier')
  })

  it('returns null at 48 h and beyond', () => {
    expect(formatLastSeen(ago(48 * HOUR), NOW)).toBeNull()
    expect(formatLastSeen(ago(30 * 24 * HOUR), NOW)).toBeNull()
  })
})
