import { describe, expect, it } from 'vitest'
import { SEAL_IDS } from '@degommix/game-core'
import { SEALS, SEAL_COUNT, sealMeta } from './seals'

describe('seal catalog', () => {
  it('covers every SEAL_IDS entry, in the same order', () => {
    expect(SEALS.map((seal) => seal.id)).toEqual([...SEAL_IDS])
    expect(SEAL_COUNT).toBe(SEALS.length)
  })

  it('gives every seal a non-empty French label and hint', () => {
    for (const seal of SEALS) {
      expect(seal.label.trim().length).toBeGreaterThan(0)
      expect(seal.hint.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps the owner-validated names verbatim', () => {
    expect(SEALS.map((seal) => seal.label)).toEqual([
      'Imperator',
      'Tour du village',
      'Premier de cordée',
      'Décurion',
      'Marée montante',
      'Bouclier arverne',
    ])
  })

  it('round-trips every id through sealMeta', () => {
    for (const id of SEAL_IDS) {
      expect(sealMeta(id)?.id).toBe(id)
    }
  })
})
