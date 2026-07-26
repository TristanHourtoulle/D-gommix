import { describe, expect, it } from 'vitest'
import {
  cooldownSecondsLeft,
  isTauntId,
  TAUNT_COOLDOWN_MS,
  TAUNTS,
  tauntCooldownRemaining,
  tauntText,
} from './taunts'

describe('taunts', () => {
  it('holds exactly the 8 owner-validated lines', () => {
    expect(TAUNTS).toHaveLength(8)
  })

  it('has a unique id per taunt', () => {
    const ids = TAUNTS.map((taunt) => taunt.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses non-empty copy with the typographic apostrophe', () => {
    expect(TAUNTS.every((taunt) => taunt.text.length > 0)).toBe(true)
    expect(TAUNTS.every((taunt) => !taunt.text.includes("'"))).toBe(true)
  })

  it('accepts a known id', () => {
    expect(isTauntId('crazy_romans')).toBe(true)
  })

  it('rejects an unknown id', () => {
    expect(isTauntId('not_a_taunt')).toBe(false)
  })

  it('returns the French line of a known id', () => {
    expect(tauntText('crazy_romans')).toBe('Ils sont fous ces Romains !')
  })

  it('returns null for an id this client does not know', () => {
    expect(tauntText('not_a_taunt')).toBeNull()
  })

  it('has no cooldown before the first taunt of the game', () => {
    expect(tauntCooldownRemaining(null, 1000)).toBe(0)
  })

  it('runs the full window down to zero and never goes negative', () => {
    expect(tauntCooldownRemaining(1000, 1000)).toBe(TAUNT_COOLDOWN_MS)
    expect(tauntCooldownRemaining(1000, 1000 + TAUNT_COOLDOWN_MS)).toBe(0)
    expect(tauntCooldownRemaining(1000, 1000 + TAUNT_COOLDOWN_MS * 2)).toBe(0)
  })

  it('rounds the remaining seconds up', () => {
    expect(cooldownSecondsLeft(1)).toBe(1)
    expect(cooldownSecondsLeft(0)).toBe(0)
  })
})
