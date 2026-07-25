import { describe, expect, it } from 'vitest'
import { GAME_CORE } from '../index'

describe('game-core smoke', () => {
  it('exports the placeholder constant', () => {
    expect(GAME_CORE).toBe(true)
  })
})
