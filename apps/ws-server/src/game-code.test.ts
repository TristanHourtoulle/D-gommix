import { describe, expect, it } from 'vitest'
import { GAME_CODE_ALPHABET, GAME_CODE_LENGTH, generateGameCode } from './game-code'

describe('generateGameCode', () => {
  it('produces 6-char codes from the unambiguous alphabet', () => {
    const pattern = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/
    for (let i = 0; i < 200; i++) {
      const code = generateGameCode()
      expect(code).toHaveLength(GAME_CODE_LENGTH)
      expect(code).toMatch(pattern)
    }
  })

  it('never contains ambiguous characters', () => {
    for (const forbidden of ['I', 'L', 'O', '0', '1']) {
      expect(GAME_CODE_ALPHABET).not.toContain(forbidden)
    }
  })
})
