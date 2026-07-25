import type { HomeGameResult } from './queries/home'

/**
 * Pure pieces of the « Vos parties ensemble » query, kept db-free so they are
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

/** Whole seconds between start and end, null when either timestamp is missing. */
export function durationSeconds(startedAt: Date | null, endedAt: Date | null): number | null {
  if (!startedAt || !endedAt) return null
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
}
