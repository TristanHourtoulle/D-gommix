import { describe, expect, it } from 'vitest'
import { computeCurrentStreaks } from './streaks'

describe('computeCurrentStreaks', () => {
  it('returns an empty map for no games', () => {
    expect(computeCurrentStreaks([]).size).toBe(0)
  })

  it('counts a single win as a streak of 1', () => {
    const streaks = computeCurrentStreaks([{ userId: 'a', won: true }])
    expect(streaks.get('a')).toBe(1)
  })

  it('stops at the first loss and ignores older wins', () => {
    const streaks = computeCurrentStreaks([
      { userId: 'a', won: true },
      { userId: 'a', won: true },
      { userId: 'a', won: false },
      { userId: 'a', won: true },
    ])
    expect(streaks.get('a')).toBe(2)
  })

  it('leaves a player absent when their newest game is a loss', () => {
    const streaks = computeCurrentStreaks([
      { userId: 'a', won: false },
      { userId: 'a', won: true },
    ])
    expect(streaks.has('a')).toBe(false)
  })

  it('tracks interleaved users independently', () => {
    const streaks = computeCurrentStreaks([
      { userId: 'a', won: true },
      { userId: 'b', won: false },
      { userId: 'a', won: true },
      { userId: 'b', won: true },
    ])
    expect(streaks.get('a')).toBe(2)
    expect(streaks.has('b')).toBe(false)
  })

  it('leaves a player with only losses absent', () => {
    const streaks = computeCurrentStreaks([
      { userId: 'a', won: false },
      { userId: 'a', won: false },
    ])
    expect(streaks.has('a')).toBe(false)
  })
})
