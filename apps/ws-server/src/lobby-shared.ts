import { and, eq, inArray, ne } from 'drizzle-orm'
import { gamePlayers, games, type Db } from '@degommix/db'
import { CommandError } from './ack'

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

/** Throws ALREADY_IN_GAME when the user already sits in a non-finished game. */
export async function assertNotInGame(db: Db, userId: string): Promise<void> {
  const memberships = await findActiveMemberships(db, userId)
  if (memberships.length > 0) throw new CommandError('ALREADY_IN_GAME')
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
