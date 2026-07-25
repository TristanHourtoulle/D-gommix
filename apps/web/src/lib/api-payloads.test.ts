import { describe, expect, it } from 'vitest'
import type { ActiveGame, HomeGame, HomeStats } from '@/lib/queries/home'
import {
  friendsPayloadSchema,
  homePayloadSchema,
  invitesPayloadSchema,
  leaderboardPayloadSchema,
  parseHomeGame,
  parseHomeGames,
  serializeHomeGame,
  serializeHomePayload,
} from './api-payloads'

function game(overrides: Partial<HomeGame> = {}): HomeGame {
  return {
    id: 'a1',
    myResult: 'won',
    winnerUsername: 'Asterix',
    format: 2,
    durationSec: 640,
    endedAt: new Date('2026-07-25T18:47:12.000Z'),
    participants: [{ username: 'Asterix', character: 'asterix' }],
    ...overrides,
  }
}

const stats: HomeStats = { wins: 3, degommages: 7, favoriteCharacter: 'obelix' }

describe('serializeHomeGame', () => {
  it('flattens endedAt to ISO 8601', () => {
    expect(serializeHomeGame(game()).endedAt).toBe('2026-07-25T18:47:12.000Z')
  })

  it('keeps a null endedAt null', () => {
    expect(serializeHomeGame(game({ endedAt: null })).endedAt).toBeNull()
  })

  it('leaves every other field untouched', () => {
    const serialized = serializeHomeGame(game())
    expect(serialized.participants).toEqual([{ username: 'Asterix', character: 'asterix' }])
    expect(serialized.durationSec).toBe(640)
  })
})

describe('parseHomeGame', () => {
  it('round-trips a date through serialize', () => {
    const original = game()
    const revived = parseHomeGame(serializeHomeGame(original))
    expect(revived.endedAt).toBeInstanceOf(Date)
    expect(revived).toEqual(original)
  })

  it('round-trips a null date', () => {
    expect(parseHomeGame(serializeHomeGame(game({ endedAt: null }))).endedAt).toBeNull()
  })
})

describe('serializeHomePayload', () => {
  const activeGame: ActiveGame = {
    gameId: 'g1',
    status: 'lobby',
    format: 3,
    characters: ['asterix', 'obelix'],
  }

  it('produces a body accepted by the wire schema', () => {
    const payload = serializeHomePayload(stats, activeGame, [game(), game({ endedAt: null })])
    expect(homePayloadSchema.parse(payload)).toEqual(payload)
  })

  it('survives a JSON round-trip without losing the history dates', () => {
    const payload = serializeHomePayload(stats, null, [game()])
    const overTheWire = homePayloadSchema.parse(JSON.parse(JSON.stringify(payload)))
    expect(parseHomeGames(overTheWire.lastGames)[0]?.endedAt).toEqual(game().endedAt)
  })

  it('serializes an empty history', () => {
    expect(serializeHomePayload(stats, null, []).lastGames).toEqual([])
  })
})

describe('wire schemas', () => {
  it('rejects an unknown character id', () => {
    const payload = serializeHomePayload(stats, null, [])
    const corrupted = { ...payload, stats: { ...stats, favoriteCharacter: 'panoramix' } }
    expect(homePayloadSchema.safeParse(corrupted).success).toBe(false)
  })

  it('rejects an unsupported game format', () => {
    const payload = serializeHomePayload(stats, null, [game({ format: 5 as 2 })])
    expect(homePayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('accepts an empty invites payload', () => {
    const empty = { invites: [] }
    expect(invitesPayloadSchema.parse(empty)).toEqual(empty)
  })

  it('rejects an invitation with an unsupported game format', () => {
    const bad = { invites: [{ gameId: 'g1', hostUsername: 'Obelix', format: 5 }] }
    expect(invitesPayloadSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts an empty friends payload', () => {
    const empty = { received: [], sent: [], friends: [], myLobbyId: null }
    expect(friendsPayloadSchema.parse(empty)).toEqual(empty)
  })

  it('rejects a friends payload with an unknown presence', () => {
    const bad = {
      received: [],
      sent: [],
      friends: [{ id: 'u1', username: 'Obelix', initialPresence: 'away' }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts an empty leaderboard payload', () => {
    const empty = { rows: [], friendCount: 0, topDegommeur: null, characterWinrates: [] }
    expect(leaderboardPayloadSchema.parse(empty)).toEqual(empty)
  })

  it('rejects a leaderboard row missing its rank', () => {
    const bad = {
      rows: [
        {
          userId: 'u1',
          username: 'Obelix',
          wins: 1,
          winrate: 100,
          villageGames: 1,
          degommages: 2,
          favoriteCharacter: null,
        },
      ],
      friendCount: 1,
      topDegommeur: null,
      characterWinrates: [],
    }
    expect(leaderboardPayloadSchema.safeParse(bad).success).toBe(false)
  })
})
