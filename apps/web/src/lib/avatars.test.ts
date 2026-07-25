import { describe, expect, it } from 'vitest'
import {
  AVATARS,
  AVATAR_BOARDS,
  AVATAR_BOARD_LABELS,
  AVATAR_IDS,
  avatarIdSchema,
  avatarsOfBoard,
  isKnownAvatarId,
} from './avatars'

describe('avatar catalog', () => {
  it('holds the sixteen validated avatars', () => {
    expect(AVATARS).toHaveLength(16)
    expect(AVATAR_IDS).toEqual([
      'a-moustachu',
      'a-guerriere',
      'a-druide',
      'a-centurion',
      'a-patricienne',
      'a-legionnaire',
      'b-casque-aile',
      'b-menhir',
      'b-sanglier',
      'b-cimier',
      'b-aigle',
      'b-bouclier',
      'c-torque',
      'c-lyre',
      'c-enseigne',
      'c-sceau',
    ])
  })

  it('splits them 6 / 6 / 4 across the three boards', () => {
    expect(avatarsOfBoard('portraits')).toHaveLength(6)
    expect(avatarsOfBoard('emblemes')).toHaveLength(6)
    expect(avatarsOfBoard('sceaux')).toHaveLength(4)
  })

  it('has no duplicate id', () => {
    expect(new Set(AVATAR_IDS).size).toBe(16)
  })

  it('labels every board', () => {
    for (const board of AVATAR_BOARDS) expect(AVATAR_BOARD_LABELS[board]).toBeTruthy()
  })

  it('uses the typographic apostrophe in the French copy', () => {
    for (const avatar of AVATARS) {
      expect(avatar.label).not.toContain("'")
      expect(avatar.hint).not.toContain("'")
    }
  })
})

describe('avatarIdSchema', () => {
  it('accepts every catalog id', () => {
    for (const id of AVATAR_IDS) expect(avatarIdSchema.parse(id)).toBe(id)
  })

  it('accepts null — back to the pseudo initial', () => {
    expect(avatarIdSchema.parse(null)).toBeNull()
  })

  it('rejects an unknown id', () => {
    expect(avatarIdSchema.safeParse('a-inconnu').success).toBe(false)
  })

  it('rejects markup, a path and a URL', () => {
    for (const bad of ['<script>', '../../etc/passwd', 'https://evil.test/x.svg', '']) {
      expect(avatarIdSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('rejects a non-string', () => {
    expect(avatarIdSchema.safeParse(42).success).toBe(false)
    expect(avatarIdSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('isKnownAvatarId', () => {
  it('is true only for catalog ids', () => {
    expect(isKnownAvatarId('c-sceau')).toBe(true)
    expect(isKnownAvatarId('nope')).toBe(false)
    expect(isKnownAvatarId(null)).toBe(false)
    expect(isKnownAvatarId(undefined)).toBe(false)
  })
})
