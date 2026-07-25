import { describe, expect, it } from 'vitest'
import { CHARACTERS, ERROR_CODES } from './index'

describe('game-core contracts', () => {
  it('exposes the 4 characters in canonical order', () => {
    expect(CHARACTERS).toEqual(['asterix', 'obelix', 'caius_bonus', 'caligula_minus'])
  })
  it('exposes all 21 error codes', () => {
    expect(ERROR_CODES).toHaveLength(21)
  })
})
