import { randomInt } from 'node:crypto'

/** No I, L, O, 0, 1 — avoids ambiguous glyphs when sharing codes aloud. */
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const GAME_CODE_LENGTH = 6

export function generateGameCode(): string {
  let code = ''
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += GAME_CODE_ALPHABET.charAt(randomInt(GAME_CODE_ALPHABET.length))
  }
  return code
}
