import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { durationSeconds, filterSharedGames, resolveMyResult } from '@/lib/shared-games'
import { gameStarted } from './game-filters'
import { toGameFormat, type HomeGame, type HomeGameParticipant } from './home'
import { sharedFinishedGameIds } from './rivalries'

/** Newest-first cap, mirroring the home history list (design §5.2, « mes 20 dernières parties »). */
const SHARED_GAMES_LIMIT = 20

/**
 * Finished games where BOTH `viewerId` and `friendId` held a seat, newest first,
 * from the viewer's point of view. Every row is a game the viewer played, so the
 * `/parties/[id]` detail page it links to is already authorized for them
 * (see getGameDetail in ./stats.ts).
 */
export async function getSharedGames(viewerId: string, friendId: string): Promise<HomeGame[]> {
  const sharedIds = await sharedFinishedGameIds(viewerId, friendId)
  if (sharedIds.length === 0) return []

  // The viewer's finished games, newest first — same filters as getLastGames.
  const viewerRows = await db
    .select({
      id: games.id,
      outcome: games.outcome,
      winnerId: games.winnerId,
      winnerUsername: user.username,
      format: games.format,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .leftJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        eq(gamePlayers.userId, viewerId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted
      )
    )
    .orderBy(sql`${games.endedAt} desc nulls last`)

  const shared = filterSharedGames(viewerRows, new Set(sharedIds), SHARED_GAMES_LIMIT)
  if (shared.length === 0) return []

  // Participants of those games only — same shape as getLastGames.
  const gameIdList = sql.join(
    shared.map((row) => sql`${row.id}`),
    sql`, `
  )
  const participantRows = await db
    .select({
      gameId: gamePlayers.gameId,
      username: user.username,
      character: gamePlayers.character,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        sql`${gamePlayers.gameId} in (${gameIdList})`,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
    .orderBy(sql`${gamePlayers.joinedAt} asc nulls last`)

  const participantsByGame = new Map<string, HomeGameParticipant[]>()
  for (const row of participantRows) {
    const list = participantsByGame.get(row.gameId) ?? []
    list.push({ username: row.username ?? '?', character: row.character })
    participantsByGame.set(row.gameId, list)
  }

  return shared.map((row) => ({
    id: row.id,
    myResult: resolveMyResult(row.outcome, row.winnerId, viewerId),
    winnerUsername: row.winnerUsername,
    format: toGameFormat(row.format),
    durationSec: durationSeconds(row.startedAt, row.endedAt),
    endedAt: row.endedAt,
    participants: participantsByGame.get(row.id) ?? [],
  }))
}
