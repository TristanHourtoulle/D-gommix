import { and, asc, eq, inArray } from 'drizzle-orm'
import { gamePlayers, games, user, type Db } from '@degommix/db'
import type { CharacterId, GameFormat } from '@degommix/game-core'
import type { AppServer } from './socket-types'

export interface LobbyPlayer {
  userId: string
  username: string
  status: 'invited' | 'joined'
  character: CharacterId | null
}

export interface LobbyState {
  gameId: string
  code: string
  format: GameFormat
  hostId: string
  players: LobbyPlayer[]
}

export async function loadLobbyState(db: Db, gameId: string): Promise<LobbyState | null> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game) return null
  const rows = await db
    .select({
      userId: gamePlayers.userId,
      status: gamePlayers.status,
      character: gamePlayers.character,
      username: user.username,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.status, ['invited', 'joined'])))
    .orderBy(asc(gamePlayers.joinedAt))
  return {
    gameId: game.id,
    code: game.code,
    format: game.format as GameFormat,
    hostId: game.hostId,
    players: rows.map((row) => ({
      userId: row.userId,
      username: row.username ?? '',
      status: row.status as 'invited' | 'joined',
      character: row.character,
    })),
  }
}

/** Rebroadcasts the full lobby state to everyone in the game room. */
export async function broadcastLobbyState(
  db: Db,
  io: AppServer,
  gameId: string
): Promise<LobbyState | null> {
  const state = await loadLobbyState(db, gameId)
  if (state) io.to(`game:${gameId}`).emit('lobby:state', state)
  return state
}
