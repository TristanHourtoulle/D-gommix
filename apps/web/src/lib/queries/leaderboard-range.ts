import { sql, games } from '@degommix/db'

/**
 * The plan-019/027 month window of the Classement, and nothing else. Kept in
 * its own module (rather than in the shared `game-filters.ts`) on purpose: the
 * Palmarès (records.ts) and the Almanach (almanach.ts) are all-time BY DESIGN
 * and import `game-filters`, so putting the window predicate there would make
 * it one autocomplete away from silently windowing an all-time surface.
 *
 * Being free of the `@/lib/db` client is what makes `endedInWindow` directly
 * unit-testable (see leaderboard-range.test.ts) — the bound encoding below is
 * exactly the kind of thing that must never regress unnoticed.
 */
export interface LeaderboardRange {
  /** Count only games with `ended_at >= from`. Omit for all-time. */
  from?: Date
  /** Exclusive upper bound: `ended_at < to`. Omit for month-to-date/all-time. */
  to?: Date
}

/** `ended_at` window filters for a leaderboard range (empty for all-time). */
export function endedInWindow(range: LeaderboardRange) {
  // `.toISOString()`, not the Date: a value interpolated in a raw `sql`
  // fragment bypasses the column's encoder and reaches postgres-js
  // unmapped, which rejects a Date instance (ERR_INVALID_ARG_TYPE).
  return [
    ...(range.from === undefined ? [] : [sql`${games.endedAt} >= ${range.from.toISOString()}`]),
    ...(range.to === undefined ? [] : [sql`${games.endedAt} < ${range.to.toISOString()}`]),
  ]
}
