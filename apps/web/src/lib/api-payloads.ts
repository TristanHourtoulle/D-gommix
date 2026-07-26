import { z } from 'zod'
import { CHARACTERS } from '@degommix/game-core'
import type { ActiveGame, HomeGame, HomeStats } from '@/lib/queries/home'
import type { ViewerRank } from '@/lib/queries/stats'

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
  /**
   * Rank chip of the hero header, null when the viewer never finished a game.
   * Optional so pre-redesign caches keep parsing (legacy-cache convention).
   */
  viewerRank: z.object({ rank: z.number(), winrate: z.number() }).nullable().optional(),
})

export const invitesPayloadSchema = z.object({
  invites: z.array(
    z.object({
      gameId: z.string(),
      hostUsername: z.string(),
      hostAvatarId: z.string().nullable().optional(),
      format: formatSchema,
      /** ISO 8601 lobby creation; optional for old caches and live ws patches. */
      createdAt: z.string().nullable().optional(),
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
      /** ISO 8601, null before the first ws connection; optional for old caches. */
      lastSeenAt: z.string().nullable().optional(),
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

const rivalryPairSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: z.string().nullable().optional(),
  dealt: z.number(),
  taken: z.number(),
})

const recordHolderSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: z.string().nullable().optional(),
})

const gameRecordSchema = z.object({
  gameId: z.string(),
  /** Whole seconds, computed in SQL — no Date crosses the wire. */
  durationSec: z.number(),
  holder: recordHolderSchema,
})

const countRecordSchema = z.object({
  holder: recordHolderSchema,
  count: z.number(),
  /** Game that set the record, when a single game did (biggest carton). */
  gameId: z.string().optional(),
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
      /** Optional for old PWA-cached SSR payloads (same convention as lastSeenAt). */
      currentStreak: z.number().optional(),
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
  /** Optional for old PWA-cached SSR payloads (same convention as currentStreak). */
  rivalryPairs: z.array(rivalryPairSchema).optional(),
  characterWinrates: z.array(
    z.object({ character: characterSchema, winrate: z.number(), games: z.number() })
  ),
  /**
   * Season archive meta (plan 027): earliest playable month plus the champion
   * of every completed Paris month. Optional for old PWA-cached SSR payloads
   * (same convention as lastSeenAt / currentStreak).
   */
  season: z
    .object({
      earliestMonth: z.string().nullable(),
      pastChampions: z.array(
        z.object({
          month: z.string(),
          userId: z.string(),
          username: z.string(),
          avatarId: z.string().nullable().optional(),
          wins: z.number(),
        })
      ),
    })
    .optional(),
  /**
   * All-time « Palmarès » records — never affected by `?period=` (plan 026).
   * Optional for old PWA-cached SSR payloads (same convention as
   * currentStreak / lastSeenAt).
   */
  records: z
    .object({
      fastestVillage: gameRecordSchema.nullable(),
      longestVillage: gameRecordSchema.nullable(),
      longestStreak: countRecordSchema.nullable(),
      biggestCarton: countRecordSchema.nullable(),
    })
    .optional(),
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

/** Assembles the `/api/home` body from the four server queries. */
export function serializeHomePayload(
  stats: HomeStats,
  activeGame: ActiveGame | null,
  lastGames: HomeGame[],
  viewerRank: ViewerRank | null
): HomePayload {
  return { stats, activeGame, lastGames: lastGames.map(serializeHomeGame), viewerRank }
}

/** Revives the history rows of a home payload, newest first as sent. */
export function parseHomeGames(games: SerializedHomeGame[]): HomeGame[] {
  return games.map(parseHomeGame)
}
