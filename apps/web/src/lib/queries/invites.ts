import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import type { GameFormat } from '@degommix/game-core'
import { db } from '@/lib/db'

export interface PendingInvite {
  gameId: string
  hostUsername: string
  format: GameFormat
}

function toGameFormat(value: number): GameFormat {
  if (value === 2 || value === 3 || value === 4) return value
  throw new Error(`Invalid game format: ${value}`)
}

/**
 * Invitations still awaiting an answer: `invited` seats of the user in games
 * that are still open lobbies. Newest first — the banner order of the Accueil.
 */
export async function getPendingInvites(userId: string): Promise<PendingInvite[]> {
  const rows = await db
    .select({ gameId: games.id, format: games.format, hostUsername: user.username })
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
  }))
}
