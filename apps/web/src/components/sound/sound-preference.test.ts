import { describe, expect, it } from 'vitest'
import {
  SOUND_PREFERENCES,
  SOUND_STORAGE_KEY,
  isSoundPreference,
  type SoundPreference,
} from './sound-preference'

describe('sound preference vocabulary', () => {
  it('offers exactly « off » and « on », in that order', () => {
    expect(SOUND_PREFERENCES).toEqual(['off', 'on'])
  })

  it('uses the degommix-* localStorage namespace, like the theme', () => {
    expect(SOUND_STORAGE_KEY).toBe('degommix-sound')
  })

  it('accepts the two known values', () => {
    for (const value of SOUND_PREFERENCES) expect(isSoundPreference(value)).toBe(true)
  })

  it('rejects anything else, including legacy-looking values', () => {
    for (const value of [null, undefined, '', 'true', '1', 'ON', 0, {}]) {
      expect(isSoundPreference(value)).toBe(false)
    }
  })

  it('types the tuple as the preference union', () => {
    const preference: SoundPreference = 'off'
    expect(SOUND_PREFERENCES).toContain(preference)
  })
})
