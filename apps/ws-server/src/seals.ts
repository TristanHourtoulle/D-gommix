import { and, desc, eq, or, sql } from 'drizzle-orm'
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
 * All-time village wins, including the game being finalized (this runs after
 * `games` has been stamped). Mirror of `getPlayerStats` in
 * apps/web/src/lib/queries/friends.ts.
 */
async function careerWins(tx: DbTransaction, userId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(
      and(
        eq(games.winnerId, userId),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * Consecutive village wins ending with the most recent village game. Bounded:
 * the detector only needs to know whether the last RISING_TIDE_STREAK village
 * games were all wins, so exactly that many rows are fetched. Aborted games are
 * neutral because they are filtered out entirely — the same rule as
 * apps/web/src/lib/queries/streaks.ts.
 */
async function currentStreak(tx: DbTransaction, userId: string): Promise<number> {
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
        gameStarted
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
 * Detects and persists the hauts faits unlocked by a finished game.
 * Idempotent: the (user_id, seal_id) primary key plus ON CONFLICT DO NOTHING
 * mean re-running this over an already-processed game inserts nothing and
 * returns an empty map — which is what makes the backfill safe to re-run.
 *
 * Runs inside the finalize transaction, AFTER `games` has been stamped with
 * outcome/winner/ended_at, so the career queries below already count this game.
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
  // Sequential on purpose: these share one transaction connection, and the game
  // manager already serializes commands per game, so there is no throughput to
  // win and a concurrent-statement error to avoid.
  for (const userId of state.seats) {
    const wins = await careerWins(tx, userId)
    const streak = await currentStreak(tx, userId)
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
