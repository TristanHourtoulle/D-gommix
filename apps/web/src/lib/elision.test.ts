import { describe, expect, it } from 'vitest'
import { deName } from './elision'

describe('deName', () => {
  it('elides before a vowel', () => {
    expect(deName('Astrid')).toBe('d’Astrid')
    expect(deName('Obelix')).toBe('d’Obelix')
    expect(deName('idefix')).toBe('d’idefix')
  })

  it('elides before an accented vowel', () => {
    expect(deName('Élodie')).toBe('d’Élodie')
    expect(deName('Ambre')).toBe('d’Ambre')
    expect(deName('Ève')).toBe('d’Ève')
  })

  it('elides before an h, treated as always mute', () => {
    expect(deName('Hugo')).toBe('d’Hugo')
    expect(deName('hector')).toBe('d’hector')
  })

  it('keeps « de » before a consonant', () => {
    expect(deName('Marc')).toBe('de Marc')
    expect(deName('Tristan')).toBe('de Tristan')
    expect(deName('Zoé')).toBe('de Zoé')
  })

  it('keeps « de » before a digit or a symbol', () => {
    expect(deName('42')).toBe('de 42')
    expect(deName('_ghost')).toBe('de _ghost')
  })

  it('keeps « de » for an empty name', () => {
    expect(deName('')).toBe('de ')
  })

  it('uses the typographic apostrophe U+2019', () => {
    expect(deName('Astrid')).toContain('’')
    expect(deName('Astrid')).not.toContain("'")
  })
})
