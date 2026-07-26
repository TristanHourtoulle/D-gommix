import { describe, expect, it } from 'vitest'
import { computeComebackWinners, computeCurrentStreaks, computeLongestStreaks } from './streaks'

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

describe('computeLongestStreaks', () => {
  it('returns an empty map for no games', () => {
    expect(computeLongestStreaks([]).size).toBe(0)
  })

  it('counts a single win as a streak of 1', () => {
    const longest = computeLongestStreaks([{ userId: 'a', won: true }])
    expect(longest.get('a')).toBe(1)
  })

  it('keeps a past run that beats the current one', () => {
    const longest = computeLongestStreaks([
      { userId: 'a', won: true },
      { userId: 'a', won: false },
      { userId: 'a', won: true },
      { userId: 'a', won: true },
      { userId: 'a', won: true },
    ])
    expect(longest.get('a')).toBe(3)
  })

  it('keeps the current run when it is the best', () => {
    const longest = computeLongestStreaks([
      { userId: 'a', won: true },
      { userId: 'a', won: true },
      { userId: 'a', won: false },
      { userId: 'a', won: true },
    ])
    expect(longest.get('a')).toBe(2)
  })

  it('reports the shared max when past and current runs tie', () => {
    const longest = computeLongestStreaks([
      { userId: 'a', won: true },
      { userId: 'a', won: true },
      { userId: 'a', won: false },
      { userId: 'a', won: true },
      { userId: 'a', won: true },
    ])
    expect(longest.get('a')).toBe(2)
  })

  it('leaves a player with only losses absent', () => {
    const longest = computeLongestStreaks([
      { userId: 'a', won: false },
      { userId: 'a', won: false },
    ])
    expect(longest.has('a')).toBe(false)
  })

  it('tracks interleaved users independently', () => {
    const longest = computeLongestStreaks([
      { userId: 'a', won: true },
      { userId: 'b', won: false },
      { userId: 'a', won: true },
      { userId: 'b', won: true },
    ])
    expect(longest.get('a')).toBe(2)
    expect(longest.get('b')).toBe(1)
  })
})

describe('computeComebackWinners', () => {
  it('returns an empty set for no games', () => {
    expect(computeComebackWinners([], 3).size).toBe(0)
  })

  it('flags a win that follows exactly three losses', () => {
    // Newest first: the win is the most recent game, the three losses precede it.
    const comebacks = computeComebackWinners(
      [
        { userId: 'a', won: true },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
      ],
      3
    )
    expect(comebacks.has('a')).toBe(true)
  })

  it('flags a win that follows more than three losses', () => {
    const comebacks = computeComebackWinners(
      [
        { userId: 'a', won: true },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
      ],
      3
    )
    expect(comebacks.has('a')).toBe(true)
  })

  it('does not flag a win that follows only two losses', () => {
    // Direction-sensitive: the oldest win here comes BEFORE the losses.
    const comebacks = computeComebackWinners(
      [
        { userId: 'a', won: true },
        { userId: 'a', won: false },
        { userId: 'a', won: false },
        { userId: 'a', won: true },
      ],
      3
    )
    expect(comebacks.has('a')).toBe(false)
  })

  it('keeps players independent', () => {
    const comebacks = computeComebackWinners(
      [
        { userId: 'a', won: true },
        { userId: 'b', won: false },
        { userId: 'b', won: false },
        { userId: 'b', won: false },
      ],
      3
    )
    expect(comebacks.has('a')).toBe(false)
    expect(comebacks.has('b')).toBe(false)
  })
})
