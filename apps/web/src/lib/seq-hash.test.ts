import { describe, expect, it } from 'vitest'
import { hashGameSeq } from './seq-hash'

const GAME = '9f1b7c2e-0000-4000-8000-000000000001'
const OTHER = '9f1b7c2e-0000-4000-8000-000000000002'

describe('hashGameSeq', () => {
  it('is deterministic', () => {
    expect(hashGameSeq(GAME, 42)).toBe(hashGameSeq(GAME, 42))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const seq of [0, 1, 7, 1000, 2 ** 31 - 1]) {
      const h = hashGameSeq(GAME, seq)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('produces different values for consecutive seqs', () => {
    expect(hashGameSeq(GAME, 1)).not.toBe(hashGameSeq(GAME, 2))
    expect(hashGameSeq(GAME, 2)).not.toBe(hashGameSeq(GAME, 3))
  })

  it('produces different values for the same seq in two games', () => {
    for (const seq of [1, 2, 3, 4, 5]) {
      expect(hashGameSeq(GAME, seq)).not.toBe(hashGameSeq(OTHER, seq))
    }
  })

  it('spreads 200 consecutive seqs over at least 190 distinct values', () => {
    const seen = new Set<number>()
    for (let seq = 1; seq <= 200; seq++) seen.add(hashGameSeq(GAME, seq))
    expect(seen.size).toBeGreaterThanOrEqual(190)
  })

  it('spreads seq 2 of 200 games over at least 190 distinct values', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(hashGameSeq(`game-${i}`, 2))
    expect(seen.size).toBeGreaterThanOrEqual(190)
  })
})
