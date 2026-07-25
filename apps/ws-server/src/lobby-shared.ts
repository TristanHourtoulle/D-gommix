import { and, eq, inArray, ne } from 'drizzle-orm'
import { gamePlayers, games, type Db } from '@degommix/db'
import { CommandError } from './ack'
import { broadcastLobbyState } from './lobby-state'
import type { AppServer } from './socket-types'

export type GameRow = typeof games.$inferSelect
export type GamePlayerRow = typeof gamePlayers.$inferSelect

export interface ActiveMembership {
  game: GameRow
  player: GamePlayerRow
}

/** Every non-finished game where the user sits as `invited` or `joined`. */
export async function findActiveMemberships(
  db: Db,
  userId: string
): Promise<ActiveMembership[]> {
  const rows = await db
    .select({ game: games, player: gamePlayers })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        inArray(gamePlayers.status, ['invited', 'joined']),
        ne(games.status, 'finished')
      )
    )
  return rows
}

/**
 * Blocks only on a real seat (`joined`) in a non-finished game. Pending
 * invitations are auto-declined instead: an unanswered invitation must never
 * lock the user out of creating or joining another game. Hosts learn about it
 * through the `lobby:state` rebroadcast, exactly like an explicit decline.
 */
export async function assertNotJoinedElsewhere(
  db: Db,
  io: AppServer,
  userId: string,
  options: { exceptGameId?: string } = {}
): Promise<void> {
  const memberships = await findActiveMemberships(db, userId)
  if (memberships.some((m) => m.player.status === 'joined')) {
    throw new CommandError('ALREADY_IN_GAME')
  }
  for (const membership of memberships) {
    if (membership.player.status !== 'invited') continue
    if (membership.game.id === options.exceptGameId) continue
    await db
      .update(gamePlayers)
      .set({ status: 'declined' })
      .where(and(eq(gamePlayers.gameId, membership.game.id), eq(gamePlayers.userId, userId)))
    io.to(`user:${userId}`).emit('invite:canceled', { gameId: membership.game.id })
    await broadcastLobbyState(db, io, membership.game.id)
  }
}

export async function getGameOrThrow(db: Db, gameId: string): Promise<GameRow> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game) throw new CommandError('NOT_FOUND')
  return game
}

export function assertLobby(game: GameRow): void {
  if (game.status !== 'lobby') throw new CommandError('LOBBY_ALREADY_STARTED')
}

export function assertHost(game: GameRow, userId: string): void {
  if (game.hostId !== userId) throw new CommandError('NOT_HOST')
}

/** All seats currently held (`invited` + `joined`) in a game. */
export async function listSeats(db: Db, gameId: string): Promise<GamePlayerRow[]> {
  return db
    .select()
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.status, ['invited', 'joined'])))
}

export async function getSeat(
  db: Db,
  gameId: string,
  userId: string
): Promise<GamePlayerRow | undefined> {
  const [row] = await db
    .select()
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
  return row
}
