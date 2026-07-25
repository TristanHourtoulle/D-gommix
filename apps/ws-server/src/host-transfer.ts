import { and, asc, eq, ne } from 'drizzle-orm'
import { gamePlayers, games, type Db } from '@degommix/db'
import { broadcastLobbyState } from './lobby-state'
import type { AppServer } from './socket-types'

export interface TimerApi {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => {
    clearTimeout(handle as NodeJS.Timeout)
  },
}

export const HOST_TRANSFER_DELAY_MS = 60_000

export interface HostTransferDeps {
  db: Db
  io: AppServer
  isOnline: (userId: string) => boolean
  timers?: TimerApi
  delayMs?: number
}

interface PendingTransfer {
  hostId: string
  handle: unknown
}

/**
 * Arms a 60s timer when the last socket of a host disconnects; on expiry the
 * host role moves to the connected joined player with the oldest joined_at.
 */
export class HostTransferManager {
  private readonly pending = new Map<string, PendingTransfer>()
  private readonly timers: TimerApi
  private readonly delayMs: number

  constructor(private readonly deps: HostTransferDeps) {
    this.timers = deps.timers ?? realTimers
    this.delayMs = deps.delayMs ?? HOST_TRANSFER_DELAY_MS
  }

  async onUserOffline(userId: string): Promise<void> {
    const hosted = await this.deps.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.hostId, userId), ne(games.status, 'finished')))
    for (const game of hosted) {
      if (this.pending.has(game.id)) continue
      const handle = this.timers.set(() => {
        void this.execute(game.id, userId)
      }, this.delayMs)
      this.pending.set(game.id, { hostId: userId, handle })
    }
  }

  onUserOnline(userId: string): void {
    for (const [gameId, entry] of this.pending) {
      if (entry.hostId === userId) {
        this.timers.clear(entry.handle)
        this.pending.delete(gameId)
      }
    }
  }

  clearGame(gameId: string): void {
    const entry = this.pending.get(gameId)
    if (entry) {
      this.timers.clear(entry.handle)
      this.pending.delete(gameId)
    }
  }

  private async execute(gameId: string, oldHostId: string): Promise<void> {
    this.pending.delete(gameId)
    try {
      await transferHost(this.deps.db, this.deps.io, gameId, oldHostId, this.deps.isOnline)
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          scope: 'host-transfer',
          gameId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }
}

/**
 * Reassigns the host of a game to the oldest-joined connected player.
 * Used both by the disconnect timer and by an explicit host `lobby:leave`.
 */
export async function transferHost(
  db: Db,
  io: AppServer,
  gameId: string,
  oldHostId: string,
  isOnline: (userId: string) => boolean
): Promise<string | null> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game || game.status === 'finished' || game.hostId !== oldHostId) return null
  const candidates = await db
    .select()
    .from(gamePlayers)
    .where(
      and(
        eq(gamePlayers.gameId, gameId),
        eq(gamePlayers.status, 'joined'),
        ne(gamePlayers.userId, oldHostId)
      )
    )
    .orderBy(asc(gamePlayers.joinedAt))
  const next = candidates.find((c) => isOnline(c.userId)) ?? candidates[0]
  if (!next) return null
  await db.update(games).set({ hostId: next.userId }).where(eq(games.id, gameId))
  io.to(`game:${gameId}`).emit('game:host_changed', { newHostId: next.userId })
  if (game.status === 'lobby') await broadcastLobbyState(db, io, gameId)
  return next.userId
}
