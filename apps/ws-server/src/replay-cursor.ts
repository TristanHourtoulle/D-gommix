import { and, eq, lt, lte, or, sql } from 'drizzle-orm'
import { games } from '@degommix/db'
import type { DbTransaction } from './finalize'

/**
 * A lobby dissolved before anybody launched it is stored as a finished/aborted
 * game with a NULL started_at (a burned-code registry row, not a game). Mirror
 * of `gameStarted` in apps/web/src/lib/queries/game-filters.ts — duplicated
 * because apps/ws-server cannot import from apps/web.
 */
export const gameStarted = sql`${games.startedAt} is not null`

/**
 * The point in history the career queries are evaluated at: the game being
 * processed. Live, that game IS the most recent one, so the cursor is a no-op;
 * during the retroactive replay (apps/ws-server/src/backfill-seals.ts) it is
 * what stops a game from seeing the results of the games that followed it.
 */
export interface ReplayCursor {
  readonly endedAt: Date
  readonly gameId: string
  /** `games.started_at` — the duration seals need a clock the state has not. */
  readonly startedAt: Date | null
}

/**
 * « Every game up to and including the cursor », in the exact order the
 * backfill replays them (ended_at asc, id asc) and the streak query reads them
 * (that same order, reversed). Games with a NULL ended_at have no place in that
 * order, so they drop out of both queries — they are unfinalized rows, not
 * history.
 */
export function upToCursor(cursor: ReplayCursor) {
  return or(
    lt(games.endedAt, cursor.endedAt),
    and(eq(games.endedAt, cursor.endedAt), lte(games.id, cursor.gameId))
  )
}

/**
 * Reads the processed game's own `(ended_at, id)` back from the row that was
 * just stamped. Derived here rather than passed in on purpose: it is the one
 * thing that makes the live and replay paths a single code path — no caller can
 * hand over a cursor that disagrees with the game it is processing.
 */
export async function replayCursor(tx: DbTransaction, gameId: string): Promise<ReplayCursor> {
  const [row] = await tx
    .select({ endedAt: games.endedAt, startedAt: games.startedAt })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
  if (!row?.endedAt) {
    throw new Error(`cannot award seals for game ${gameId}: no ended_at`)
  }
  return { endedAt: row.endedAt, gameId, startedAt: row.startedAt }
}
