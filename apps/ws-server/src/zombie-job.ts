import { and, eq, lt } from 'drizzle-orm'
import { gamePlayers, games, type Db } from '@degommix/db'
import type { GameManager } from './game-manager'
import type { AppServer } from './socket-types'

export const ZOMBIE_SWEEP_INTERVAL_MS = 15 * 60_000
export const ZOMBIE_INACTIVITY_MS = 24 * 60 * 60_000

export interface ZombieJobDeps {
  db: Db
  io: AppServer
  manager: GameManager
  now?: () => Date
  thresholdMs?: number
  intervalMs?: number
}

export interface ZombieJob {
  /**
   * Closes every active game and dissolves every lobby inactive for longer than
   * the threshold. Returns the count.
   */
  tick: () => Promise<number>
  start: () => void
  stop: () => void
}

export function createZombieJob(deps: ZombieJobDeps): ZombieJob {
  const now = deps.now ?? ((): Date => new Date())
  const thresholdMs = deps.thresholdMs ?? ZOMBIE_INACTIVITY_MS
  const intervalMs = deps.intervalMs ?? ZOMBIE_SWEEP_INTERVAL_MS
  let handle: NodeJS.Timeout | null = null

  /** Closes started games nobody touched: the state machine records the reason. */
  const sweepZombieGames = async (cutoff: Date): Promise<number> => {
    const zombies = await deps.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.status, 'active'), lt(games.lastActivityAt, cutoff)))
    for (const game of zombies) {
      await deps.manager.appendSystemEvent(game.id, {
        type: 'GAME_AUTO_CLOSED',
        actorId: null,
        targetId: null,
        payload: { reason: 'zombie' },
      })
    }
    return zombies.length
  }

  /** Dissolves lobbies nobody ever launched: the code is burned, seats freed. */
  const sweepStaleLobbies = async (cutoff: Date): Promise<number> => {
    const stale = await deps.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.status, 'lobby'), lt(games.lastActivityAt, cutoff)))
    for (const game of stale) {
      const seats = await deps.db
        .select({ userId: gamePlayers.userId, status: gamePlayers.status })
        .from(gamePlayers)
        .where(eq(gamePlayers.gameId, game.id))
      await deps.db
        .update(games)
        .set({ status: 'finished', outcome: 'aborted', endedAt: now() })
        .where(eq(games.id, game.id))
      for (const seat of seats) {
        if (seat.status !== 'invited') continue
        deps.io.to(`user:${seat.userId}`).emit('invite:canceled', { gameId: game.id })
      }
    }
    return stale.length
  }

  const tick = async (): Promise<number> => {
    const cutoff = new Date(now().getTime() - thresholdMs)
    const closed = await sweepZombieGames(cutoff)
    const dissolved = await sweepStaleLobbies(cutoff)
    return closed + dissolved
  }

  return {
    tick,
    start: (): void => {
      if (handle) return
      handle = setInterval(() => {
        tick().catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: 'error',
              scope: 'zombie-job',
              error: error instanceof Error ? error.message : String(error),
            })
          )
        })
      }, intervalMs)
      handle.unref()
    },
    stop: (): void => {
      if (handle) clearInterval(handle)
      handle = null
    },
  }
}
