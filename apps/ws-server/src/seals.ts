import { and, desc, eq, lt, lte, or, sql } from 'drizzle-orm'
import { gamePlayers, games, seals } from '@degommix/db'
import { detectSeals, RISING_TIDE_STREAK, type GameState, type SealId } from '@degommix/game-core'
import type { DbTransaction } from './finalize'

/**
 * A lobby dissolved before anybody launched it is stored as a finished/aborted
 * game with a NULL started_at (a burned-code registry row, not a game). Mirror
 * of `gameStarted` in apps/web/src/lib/queries/game-filters.ts — duplicated
 * because apps/ws-server cannot import from apps/web.
 */
const gameStarted = sql`${games.startedAt} is not null`

/**
 * The point in history the career queries are evaluated at: the game being
 * processed. Live, that game IS the most recent one, so the cursor is a no-op;
 * during the retroactive replay (apps/ws-server/src/backfill-seals.ts) it is
 * what stops a game from seeing the results of the games that followed it.
 */
interface ReplayCursor {
  readonly endedAt: Date
  readonly gameId: string
}

/**
 * « Every game up to and including the cursor », in the exact order the
 * backfill replays them (ended_at asc, id asc) and the streak query reads them
 * (that same order, reversed). Games with a NULL ended_at have no place in that
 * order, so they drop out of both queries — they are unfinalized rows, not
 * history.
 */
function upToCursor(cursor: ReplayCursor) {
  return or(
    lt(games.endedAt, cursor.endedAt),
    and(eq(games.endedAt, cursor.endedAt), lte(games.id, cursor.gameId))
  )
}

/**
 * Village wins up to and including the game being processed (this runs after
 * `games` has been stamped, so that game counts). Mirror of `getPlayerStats` in
 * apps/web/src/lib/queries/friends.ts, plus the replay bound.
 */
async function careerWins(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(
      and(
        eq(games.winnerId, userId),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        upToCursor(cursor)
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * Consecutive village wins ending with the game being processed. Bounded twice:
 * by the replay cursor (never look past that game) and by RISING_TIDE_STREAK
 * rows, since the detector only needs to know whether that many village games
 * in a row were wins. Aborted games are neutral because they are filtered out
 * entirely — the same rule as apps/web/src/lib/queries/streaks.ts.
 */
async function currentStreak(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const recent = await tx
    .select({ winnerId: games.winnerId })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        or(eq(gamePlayers.status, 'joined'), eq(gamePlayers.status, 'left')),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        upToCursor(cursor)
      )
    )
    // games.id breaks endedAt ties so the order is deterministic.
    .orderBy(desc(games.endedAt), desc(games.id))
    .limit(RISING_TIDE_STREAK)

  let streak = 0
  for (const row of recent) {
    if (row.winnerId !== userId) break
    streak += 1
  }
  return streak
}

/**
 * Reads the processed game's own `(ended_at, id)` back from the row that was
 * just stamped. Derived here rather than passed in on purpose: it is the one
 * thing that makes the live and replay paths a single code path — no caller can
 * hand over a cursor that disagrees with the game it is processing.
 */
async function replayCursor(tx: DbTransaction, gameId: string): Promise<ReplayCursor> {
  const [row] = await tx
    .select({ endedAt: games.endedAt })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
  if (!row?.endedAt) {
    throw new Error(`cannot award seals for game ${gameId}: no ended_at`)
  }
  return { endedAt: row.endedAt, gameId }
}

/**
 * Detects and persists the hauts faits unlocked by a finished game.
 * Idempotent: the (user_id, seal_id) primary key plus ON CONFLICT DO NOTHING
 * mean re-running this over an already-processed game inserts nothing and
 * returns an empty map — which is what makes the backfill safe to re-run.
 *
 * Runs inside the finalize transaction, AFTER `games` has been stamped with
 * outcome/winner/ended_at, so the career queries below already count this game
 * — and, thanks to the replay cursor, count NOTHING after it. Live that is the
 * same thing (the finalized game is the most recent one); in the backfill it is
 * the difference between replaying history and re-reading today's totals for
 * every past game.
 *
 * Returns the rows actually inserted, keyed by user id: the « newly earned »
 * diff. Clients do not consume it (they read `seals` by game id over HTTP);
 * it exists for tests and logging.
 */
export async function awardSeals(
  tx: DbTransaction,
  gameId: string,
  state: GameState
): Promise<Map<string, SealId[]>> {
  const newlyEarned = new Map<string, SealId[]>()
  const cursor = await replayCursor(tx, gameId)
  // Sequential on purpose: these share one transaction connection, and the game
  // manager already serializes commands per game, so there is no throughput to
  // win and a concurrent-statement error to avoid.
  for (const userId of state.seats) {
    const wins = await careerWins(tx, userId, cursor)
    const streak = await currentStreak(tx, userId, cursor)
    const detected = detectSeals({ userId, state, careerWins: wins, currentStreak: streak })
    if (detected.length === 0) continue
    const inserted = await tx
      .insert(seals)
      .values(detected.map((sealId) => ({ userId, sealId, gameId })))
      .onConflictDoNothing({ target: [seals.userId, seals.sealId] })
      .returning({ sealId: seals.sealId })
    if (inserted.length > 0) {
      newlyEarned.set(
        userId,
        inserted.map((row) => row.sealId as SealId)
      )
    }
  }
  return newlyEarned
}
