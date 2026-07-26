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
 * Marks a never-started lobby as finished/aborted — the code is burned forever
 * — and retires the pending invitees' banners live. `seats` must be the
 * remaining `invited`/`joined` rows of the lobby (see `listSeats`).
 */
export async function dissolveLobby(
  db: Db,
  io: AppServer,
  gameId: string,
  seats: GamePlayerRow[]
): Promise<void> {
  await db
    .update(games)
    .set({ status: 'finished', outcome: 'aborted', endedAt: new Date() })
    .where(eq(games.id, gameId))
  // Pending invitees keep their seat row, but the finished game is already
  // excluded from findActiveMemberships: only the live push was missing to
  // retire their banner.
  for (const pending of seats) {
    if (pending.status !== 'invited') continue
    io.to(`user:${pending.userId}`).emit('invite:canceled', { gameId })
  }
}

/**
 * Evacuates a stale `joined` seat parked in a never-started lobby: the seat is
 * left, and the lobby is dissolved once no joined player remains in it.
 */
async function evacuateStaleLobbySeat(
  db: Db,
  io: AppServer,
  gameId: string,
  userId: string
): Promise<void> {
  await db
    .update(gamePlayers)
    .set({ status: 'left', leftAt: new Date(), character: null })
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
  io.in(`user:${userId}`).socketsLeave(`game:${gameId}`)
  const remaining = await listSeats(db, gameId)
  if (remaining.every((seat) => seat.status !== 'joined')) {
    await dissolveLobby(db, io, gameId, remaining)
    return
  }
  await broadcastLobbyState(db, io, gameId)
}

/**
 * Blocks only on a real seat (`joined`) in an ACTIVE game. A `joined` seat in a
 * never-started lobby is stale parking — the app manufactures those itself
 * (one-tap invites open a lobby, and leaving via the tab bar never sends
 * `lobby:leave`) — so entering a new game auto-leaves it and dissolves the
 * emptied lobby. Pending invitations are auto-declined instead: an unanswered
 * invitation must never lock the user out of creating or joining another game.
 * Hosts learn about it through the `lobby:state` rebroadcast, exactly like an
 * explicit decline.
 */
export async function assertNotJoinedElsewhere(
  db: Db,
  io: AppServer,
  userId: string,
  options: { exceptGameId?: string } = {}
): Promise<void> {
  const memberships = (await findActiveMemberships(db, userId)).filter(
    (m) => m.game.id !== options.exceptGameId
  )
  // Fail before any side effect: an active seat blocks the whole transition.
  if (memberships.some((m) => m.player.status === 'joined' && m.game.status === 'active')) {
    throw new CommandError('ALREADY_IN_GAME')
  }
  for (const membership of memberships) {
    if (membership.player.status === 'joined') {
      // Non-active by the guard above, i.e. a never-started lobby.
      await evacuateStaleLobbySeat(db, io, membership.game.id, userId)
      continue
    }
    if (membership.player.status !== 'invited') continue
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
