import { describe, expect, it } from 'vitest'
import { elapsedSeconds, formatChrono } from './chrono'

describe('elapsedSeconds', () => {
  it('computes elapsed time corrected by the server offset', () => {
    const startedAt = Date.parse('2026-07-25T10:00:00.000Z')
    const clientNow = Date.parse('2026-07-25T10:05:00.000Z')
    // Client clock 30s behind the server.
    expect(elapsedSeconds(startedAt, 30_000, clientNow)).toBe(330)
    expect(elapsedSeconds(startedAt, 0, clientNow)).toBe(300)
  })

  it('never returns a negative duration', () => {
    const startedAt = Date.parse('2026-07-25T10:00:00.000Z')
    expect(elapsedSeconds(startedAt, 0, startedAt - 5000)).toBe(0)
  })
})

describe('formatChrono', () => {
  it('formats minutes and seconds under one hour', () => {
    expect(formatChrono(0)).toBe('00:00')
    expect(formatChrono(65)).toBe('01:05')
    expect(formatChrono(3599)).toBe('59:59')
  })

  it('adds the hour digit beyond one hour', () => {
    expect(formatChrono(3600)).toBe('1:00:00')
    expect(formatChrono(3723)).toBe('1:02:03')
  })

  it('clamps negative and fractional inputs', () => {
    expect(formatChrono(-10)).toBe('00:00')
    expect(formatChrono(61.9)).toBe('01:01')
  })
})
