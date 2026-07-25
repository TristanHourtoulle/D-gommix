import { describe, expect, it } from 'vitest'
import { hashSeq } from './seq-hash'

describe('hashSeq', () => {
  it('is deterministic', () => {
    expect(hashSeq(42)).toBe(hashSeq(42))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const seq of [0, 1, 7, 1000, 2 ** 31 - 1]) {
      const h = hashSeq(seq)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('produces different values for consecutive seqs', () => {
    expect(hashSeq(1)).not.toBe(hashSeq(2))
    expect(hashSeq(2)).not.toBe(hashSeq(3))
  })
})
