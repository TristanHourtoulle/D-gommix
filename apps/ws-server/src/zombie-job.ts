import { and, eq, lt } from 'drizzle-orm'
import { games, type Db } from '@degommix/db'
import type { GameManager } from './game-manager'

export const ZOMBIE_SWEEP_INTERVAL_MS = 15 * 60_000
export const ZOMBIE_INACTIVITY_MS = 24 * 60 * 60_000

export interface ZombieJobDeps {
  db: Db
  manager: GameManager
  now?: () => Date
  thresholdMs?: number
  intervalMs?: number
}

export interface ZombieJob {
  /** Closes every active game inactive for longer than the threshold. Returns the count. */
  tick: () => Promise<number>
  start: () => void
  stop: () => void
}

export function createZombieJob(deps: ZombieJobDeps): ZombieJob {
  const now = deps.now ?? ((): Date => new Date())
  const thresholdMs = deps.thresholdMs ?? ZOMBIE_INACTIVITY_MS
  const intervalMs = deps.intervalMs ?? ZOMBIE_SWEEP_INTERVAL_MS
  let handle: NodeJS.Timeout | null = null

  const tick = async (): Promise<number> => {
    const cutoff = new Date(now().getTime() - thresholdMs)
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
