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
    const empty = {
      rows: [],
      friendCount: 0,
      topDegommeur: null,
      rivalry: { nemesis: null, favoriteVictim: null },
      characterWinrates: [],
    }
    expect(leaderboardPayloadSchema.parse(empty)).toEqual(empty)
  })

  it('keeps the rivalry spotlight on a leaderboard payload', () => {
    const payload = {
      rows: [],
      friendCount: 1,
      topDegommeur: null,
      rivalry: {
        nemesis: { userId: 'u1', username: 'Obelix', count: 4 },
        favoriteVictim: { userId: 'u2', username: 'Asterix', count: 2 },
      },
      characterWinrates: [],
    }
    expect(leaderboardPayloadSchema.parse(payload)).toEqual(payload)
  })

  it('rejects a leaderboard payload without a rivalry spotlight', () => {
    const bad = { rows: [], friendCount: 0, topDegommeur: null, characterWinrates: [] }
    expect(leaderboardPayloadSchema.safeParse(bad).success).toBe(false)
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

/**
 * The avatar field is `.nullable().optional()` everywhere on purpose: the app
 * is a PWA and react-query keeps payloads across deploys, so a payload cached
 * before this feature shipped must still parse.
 */
describe('avatar ids on the wire', () => {
  it('accepts a friends payload without any avatarId — old cached shape', () => {
    const legacy = {
      received: [{ requestId: 'r1', senderId: 'u1', senderUsername: 'Obelix' }],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online' }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.safeParse(legacy).success).toBe(true)
  })

  it('accepts a friends payload carrying avatar ids', () => {
    const fresh = {
      received: [],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online', avatarId: 'b-menhir' }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.parse(fresh).friends[0]?.avatarId).toBe('b-menhir')
  })

  it('accepts an explicit null avatarId — the player chose the initial back', () => {
    const cleared = {
      received: [],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online', avatarId: null }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.safeParse(cleared).success).toBe(true)
  })

  it('accepts a leaderboard payload without any avatarId — old cached shape', () => {
    const legacy = {
      rows: [
        {
          rank: 1,
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
      topDegommeur: { userId: 'u1', username: 'Obelix', degommages: 2 },
      rivalry: {
        nemesis: { userId: 'u2', username: 'Asterix', count: 1 },
        favoriteVictim: null,
      },
      characterWinrates: [],
    }
    expect(leaderboardPayloadSchema.safeParse(legacy).success).toBe(true)
  })

  it('accepts a leaderboard payload carrying avatar ids', () => {
    const fresh = {
      rows: [
        {
          rank: 1,
          userId: 'u1',
          username: 'Obelix',
          avatarId: 'b-sanglier',
          wins: 1,
          winrate: 100,
          villageGames: 1,
          degommages: 2,
          favoriteCharacter: null,
        },
      ],
      friendCount: 1,
      topDegommeur: { userId: 'u1', username: 'Obelix', avatarId: 'b-sanglier', degommages: 2 },
      rivalry: {
        nemesis: { userId: 'u2', username: 'Asterix', avatarId: 'c-lyre', count: 1 },
        favoriteVictim: null,
      },
      characterWinrates: [],
    }
    const parsed = leaderboardPayloadSchema.parse(fresh)
    expect(parsed.rows[0]?.avatarId).toBe('b-sanglier')
    expect(parsed.topDegommeur?.avatarId).toBe('b-sanglier')
    expect(parsed.rivalry.nemesis?.avatarId).toBe('c-lyre')
  })

  it('accepts explicit null avatar ids on a leaderboard payload', () => {
    const cleared = {
      rows: [
        {
          rank: 1,
          userId: 'u1',
          username: 'Obelix',
          avatarId: null,
          wins: 1,
          winrate: 100,
          villageGames: 1,
          degommages: 2,
          favoriteCharacter: null,
        },
      ],
      friendCount: 1,
      topDegommeur: { userId: 'u1', username: 'Obelix', avatarId: null, degommages: 2 },
      rivalry: { nemesis: null, favoriteVictim: null },
      characterWinrates: [],
    }
    expect(leaderboardPayloadSchema.safeParse(cleared).success).toBe(true)
  })

  it('accepts an invites payload without any hostAvatarId — old cached shape', () => {
    const legacy = { invites: [{ gameId: 'g1', hostUsername: 'Obelix', format: 3 }] }
    expect(invitesPayloadSchema.safeParse(legacy).success).toBe(true)
  })

  it('accepts an invites payload carrying a host avatar id', () => {
    const fresh = {
      invites: [{ gameId: 'g1', hostUsername: 'Obelix', hostAvatarId: 'a-druide', format: 3 }],
    }
    expect(invitesPayloadSchema.parse(fresh).invites[0]?.hostAvatarId).toBe('a-druide')
  })

  it('accepts an explicit null hostAvatarId', () => {
    const cleared = {
      invites: [{ gameId: 'g1', hostUsername: 'Obelix', hostAvatarId: null, format: 3 }],
    }
    expect(invitesPayloadSchema.safeParse(cleared).success).toBe(true)
  })

  it('accepts a home payload whose history rows carry no avatar id', () => {
    const legacy = {
      stats,
      activeGame: null,
      lastGames: [
        {
          id: 'a1',
          myResult: 'won',
          winnerUsername: 'Asterix',
          format: 2,
          durationSec: 640,
          endedAt: null,
          participants: [{ username: 'Asterix', character: 'asterix' }],
        },
      ],
    }
    expect(homePayloadSchema.safeParse(legacy).success).toBe(true)
  })

  it('carries the participant avatar ids of a history row over the wire', () => {
    const payload = serializeHomePayload(stats, null, [
      game({
        participants: [
          { username: 'Asterix', avatarId: 'b-menhir', character: 'asterix' },
          { username: 'Obelix', avatarId: null, character: 'obelix' },
        ],
      }),
    ])
    const parsed = homePayloadSchema.parse(JSON.parse(JSON.stringify(payload)))
    expect(parsed.lastGames[0]?.participants[0]?.avatarId).toBe('b-menhir')
    expect(parsed.lastGames[0]?.participants[1]?.avatarId).toBeNull()
  })
})
