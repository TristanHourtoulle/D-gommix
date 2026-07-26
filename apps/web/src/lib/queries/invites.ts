import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import type { GameFormat } from '@degommix/game-core'
import { db } from '@/lib/db'

export interface PendingInvite {
  gameId: string
  hostUsername: string
  hostAvatarId?: string | null
  format: GameFormat
  /**
   * ISO 8601 creation time of the lobby — the closest honest proxy for the
   * invite time. Optional: live ws patches and old caches carry none.
   */
  createdAt?: string | null
}

function toGameFormat(value: number): GameFormat {
  if (value === 2 || value === 3 || value === 4) return value
  throw new Error(`Invalid game format: ${value}`)
}

/**
 * Invitations still awaiting an answer: `invited` seats of the user in games
 * that are still open lobbies. Newest first — the banner order of the Accueil.
 *
 * A viewer already seated (`joined`) in an ACTIVE game sees no invitations at
 * all: they cannot act on them (accepting throws ALREADY_IN_GAME), so the
 * banner would be dead weight. A seat parked in a never-started lobby does not
 * hide them — accepting evacuates that stale seat server-side. Defense in
 * depth over the ws-server guards.
 */
export async function getPendingInvites(userId: string): Promise<PendingInvite[]> {
  const [seated] = await db
    .select({ gameId: gamePlayers.gameId })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(gamePlayers.status, 'joined'),
        eq(games.status, 'active'),
      ),
    )
    .limit(1)
  if (seated) return []

  const rows = await db
    .select({
      gameId: games.id,
      format: games.format,
      hostUsername: user.username,
      hostAvatarId: user.avatarId,
      createdAt: games.createdAt,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, games.hostId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(gamePlayers.status, 'invited'),
        eq(games.status, 'lobby'),
      ),
    )
    .orderBy(sql`${games.createdAt} desc`)

  return rows.map((row) => ({
    gameId: row.gameId,
    format: toGameFormat(row.format),
    hostUsername: row.hostUsername ?? '',
    hostAvatarId: row.hostAvatarId,
    createdAt: row.createdAt.toISOString(),
  }))
}
