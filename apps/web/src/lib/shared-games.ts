import type { HomeGameResult } from './queries/home'

/**
 * Pure pieces of the « Vieilles querelles » query, kept db-free so they are
 * unit-testable (apps/web/vitest.config.ts runs with no database, no env vars).
 */

/** Keeps, in input order, the rows whose game is also one of `otherGameIds`, capped at `limit`. */
export function filterSharedGames<T extends { id: string }>(
  rows: readonly T[],
  otherGameIds: ReadonlySet<string>,
  limit: number
): T[] {
  const shared: T[] = []
  for (const row of rows) {
    if (!otherGameIds.has(row.id)) continue
    shared.push(row)
    if (shared.length === limit) break
  }
  return shared
}

/** Result of a finished game from `viewerId`'s point of view. */
export function resolveMyResult(
  outcome: 'village_reached' | 'aborted' | null,
  winnerId: string | null,
  viewerId: string
): HomeGameResult {
  if (outcome === 'aborted') return 'aborted'
  return winnerId === viewerId ? 'won' : 'lost'
}

/** Win record of the viewer/friend pair over their shared finished games. */
export interface SharedGamesRecord {
  /** Shared finished games, aborted included. */
  played: number
  /** Shared games the viewer won. */
  winsMine: number
  /** Shared games the friend won. Wins by third players count in neither. */
  winsTheirs: number
}

/**
 * Reduces the viewer's finished-game rows to the pair record, over the FULL
 * shared set (never the 20-row display cap). FFA semantics: one winner per
 * game, so winsMine + winsTheirs can be smaller than played (third-player
 * wins and aborted games count for nobody).
 */
export function computeSharedRecord<
  T extends {
    id: string
    outcome: 'village_reached' | 'aborted' | null
    winnerId: string | null
  },
>(
  rows: readonly T[],
  sharedGameIds: ReadonlySet<string>,
  viewerId: string,
  friendId: string
): SharedGamesRecord {
  let played = 0
  let winsMine = 0
  let winsTheirs = 0
  for (const row of rows) {
    if (!sharedGameIds.has(row.id)) continue
    played += 1
    if (resolveMyResult(row.outcome, row.winnerId, viewerId) === 'won') winsMine += 1
    else if (resolveMyResult(row.outcome, row.winnerId, friendId) === 'won') winsTheirs += 1
  }
  return { played, winsMine, winsTheirs }
}

/** Whole seconds between start and end, null when either timestamp is missing. */
export function durationSeconds(startedAt: Date | null, endedAt: Date | null): number | null {
  if (!startedAt || !endedAt) return null
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
}
