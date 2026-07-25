import { z } from 'zod'
import { CHARACTERS } from '@degommix/game-core'
import type { ActiveGame, HomeGame, HomeStats } from '@/lib/queries/home'

/**
 * Wire shapes of the tab data endpoints (`/api/home`, `/api/invites`,
 * `/api/friends`, `/api/leaderboard`). They mirror the server query return
 * types with every `Date` flattened to an ISO string, so the JSON a client
 * query receives is byte-identical to the `initialData` the server component
 * seeds it with.
 */

const characterSchema = z.enum(CHARACTERS)
const formatSchema = z.union([z.literal(2), z.literal(3), z.literal(4)])
const presenceSchema = z.enum(['online', 'in_game', 'offline'])

const homeStatsSchema = z.object({
  wins: z.number(),
  degommages: z.number(),
  favoriteCharacter: characterSchema.nullable(),
})

const activeGameSchema = z.object({
  gameId: z.string(),
  status: z.enum(['lobby', 'active']),
  format: formatSchema,
  characters: z.array(characterSchema),
})

const serializedHomeGameSchema = z.object({
  id: z.string(),
  myResult: z.enum(['won', 'lost', 'aborted']),
  winnerUsername: z.string().nullable(),
  winnerAvatarId: z.string().nullable().optional(),
  format: formatSchema,
  durationSec: z.number().nullable(),
  /** ISO 8601, null when the game never ended. */
  endedAt: z.string().nullable(),
  participants: z.array(
    z.object({
      username: z.string(),
      avatarId: z.string().nullable().optional(),
      character: characterSchema.nullable(),
    })
  ),
})

export const homePayloadSchema = z.object({
  stats: homeStatsSchema,
  activeGame: activeGameSchema.nullable(),
  lastGames: z.array(serializedHomeGameSchema),
})

export const invitesPayloadSchema = z.object({
  invites: z.array(
    z.object({
      gameId: z.string(),
      hostUsername: z.string(),
      hostAvatarId: z.string().nullable().optional(),
      format: formatSchema,
    })
  ),
})

export const friendsPayloadSchema = z.object({
  received: z.array(
    z.object({
      requestId: z.string(),
      senderId: z.string(),
      senderUsername: z.string(),
      senderAvatarId: z.string().nullable().optional(),
    })
  ),
  sent: z.array(
    z.object({
      requestId: z.string(),
      receiverId: z.string(),
      receiverUsername: z.string(),
      receiverAvatarId: z.string().nullable().optional(),
    })
  ),
  friends: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      avatarId: z.string().nullable().optional(),
      initialPresence: presenceSchema,
    })
  ),
  myLobbyId: z.string().nullable(),
})

const rivalryPeerSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: z.string().nullable().optional(),
  count: z.number(),
})

export const leaderboardPayloadSchema = z.object({
  rows: z.array(
    z.object({
      rank: z.number(),
      userId: z.string(),
      username: z.string(),
      avatarId: z.string().nullable().optional(),
      wins: z.number(),
      winrate: z.number(),
      villageGames: z.number(),
      degommages: z.number(),
      favoriteCharacter: characterSchema.nullable(),
    })
  ),
  friendCount: z.number(),
  topDegommeur: z
    .object({
      userId: z.string(),
      username: z.string(),
      avatarId: z.string().nullable().optional(),
      degommages: z.number(),
    })
    .nullable(),
  rivalry: z.object({
    nemesis: rivalryPeerSchema.nullable(),
    favoriteVictim: rivalryPeerSchema.nullable(),
  }),
  characterWinrates: z.array(
    z.object({ character: characterSchema, winrate: z.number(), games: z.number() })
  ),
})

export type SerializedHomeGame = z.infer<typeof serializedHomeGameSchema>
export type HomePayload = z.infer<typeof homePayloadSchema>
export type InvitesPayload = z.infer<typeof invitesPayloadSchema>
export type FriendsPayload = z.infer<typeof friendsPayloadSchema>
export type LeaderboardPayload = z.infer<typeof leaderboardPayloadSchema>

/** Flattens the single `Date` of a home history row to ISO for the wire. */
export function serializeHomeGame(game: HomeGame): SerializedHomeGame {
  return { ...game, endedAt: game.endedAt === null ? null : game.endedAt.toISOString() }
}

/** Rebuilds the `Date` the history row renderer expects. */
export function parseHomeGame(game: SerializedHomeGame): HomeGame {
  return { ...game, endedAt: game.endedAt === null ? null : new Date(game.endedAt) }
}

/** Assembles the `/api/home` body from the three server queries. */
export function serializeHomePayload(
  stats: HomeStats,
  activeGame: ActiveGame | null,
  lastGames: HomeGame[]
): HomePayload {
  return { stats, activeGame, lastGames: lastGames.map(serializeHomeGame) }
}

/** Revives the history rows of a home payload, newest first as sent. */
export function parseHomeGames(games: SerializedHomeGame[]): HomeGame[] {
  return games.map(parseHomeGame)
}
