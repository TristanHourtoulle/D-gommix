/**
 * Replays every past finished game through the same detector the live path
 * uses, so hauts faits are retroactive (plan 033).
 *
 * Idempotency comes from the storage layer, not from bookkeeping: `seals` has a
 * (user_id, seal_id) primary key and every insert is ON CONFLICT DO NOTHING, so
 * a second run inserts zero rows. There is no "already backfilled" flag to get
 * out of sync, and the script is safe to run at any time — before or after new
 * games have been played.
 *
 * Games are replayed in chronological order (ended_at asc, id asc) so that
 * `unlocked_at` and `game_id` land on the game that FIRST satisfied each
 * condition, and so career counters grow in the order they really grew.
 *
 * Not run automatically anywhere: `web` is the only migrator (docs/deploy.md
 * §3) and this needs game-core, so it is a manual one-shot. See the runbook
 * subsection in docs/deploy.md.
 */
import { asc, eq, sql } from 'drizzle-orm'
import { createDb, gameEvents, games } from '@degommix/db'
import { buildGameState } from '@degommix/game-core'
import { rowToGameEvent } from './game-manager'
import { awardSeals } from './seals'

interface BackfillSummary {
  games: number
  skipped: number
  failed: number
  sealsInserted: number
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  const db = createDb(url)
  const summary: BackfillSummary = { games: 0, skipped: 0, failed: 0, sealsInserted: 0 }

  try {
    // `started_at is not null` drops the phantom lobbies (a burned-code registry
    // row, not a game) — same predicate as every stats surface.
    const rows = await db
      .select({ id: games.id })
      .from(games)
      .where(sql`${games.status} = 'finished' and ${games.startedAt} is not null`)
      .orderBy(asc(games.endedAt), asc(games.id))

    for (const { id: gameId } of rows) {
      try {
        const eventRows = await db
          .select()
          .from(gameEvents)
          .where(eq(gameEvents.gameId, gameId))
          .orderBy(asc(gameEvents.seq))
        if (eventRows.length === 0) {
          summary.skipped += 1
          continue
        }
        const state = buildGameState(eventRows.map(rowToGameEvent))
        if (state.status !== 'finished') {
          summary.skipped += 1
          continue
        }
        // One transaction per game: a failure rolls back that game only.
        const earned = await db.transaction((tx) => awardSeals(tx, gameId, state))
        summary.games += 1
        for (const sealIds of earned.values()) summary.sealsInserted += sealIds.length
      } catch (error) {
        // A single corrupt log must not stop the run.
        summary.failed += 1
        console.error(`game ${gameId} failed:`, error instanceof Error ? error.message : error)
      }
    }
  } finally {
    await db.$client.end({ timeout: 5 })
  }

  console.log(JSON.stringify(summary))
  process.exit(summary.failed > 0 ? 1 : 0)
}

void main()
