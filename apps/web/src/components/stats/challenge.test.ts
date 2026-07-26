import { describe, expect, it } from 'vitest'
import { challengeState, type ChallengeInput } from './challenge'

const ASTERIX = 'asterix'
const OBELIX = 'obelix'

const input = (overrides: Partial<ChallengeInput> = {}): ChallengeInput => ({
  rivalId: OBELIX,
  friendIds: new Set([ASTERIX, OBELIX]),
  presence: 'online',
  busyRivalId: null,
  ...overrides,
})

describe('challengeState', () => {
  it('hides the key while the friends payload is not in cache yet', () => {
    expect(challengeState(input({ friendIds: undefined }))).toBe('hidden')
  })

  it('hides the key for a rival absent from the friends payload', () => {
    expect(challengeState(input({ friendIds: new Set([ASTERIX]) }))).toBe('hidden')
  })

  it('hides the key for a non-friend even when they are in game', () => {
    expect(challengeState(input({ friendIds: new Set([ASTERIX]), presence: 'in_game' }))).toBe(
      'hidden'
    )
  })

  it('reports busy while an invitation to this rival is in flight', () => {
    expect(challengeState(input({ busyRivalId: OBELIX }))).toBe('busy')
  })

  it('keeps another rival ready while the first one is busy', () => {
    expect(challengeState(input({ rivalId: ASTERIX, busyRivalId: OBELIX }))).toBe('ready')
  })

  it('greys the key when the rival is in game', () => {
    expect(challengeState(input({ presence: 'in_game' }))).toBe('in_game')
  })

  it('is ready for an online friend', () => {
    expect(challengeState(input({ presence: 'online' }))).toBe('ready')
  })

  it('is ready for an offline friend — only in_game blocks an invitation', () => {
    expect(challengeState(input({ presence: 'offline' }))).toBe('ready')
  })
})
