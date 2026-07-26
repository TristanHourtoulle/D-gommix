import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { games } from './games'

/**
 * One-time hauts faits (plan 033). The app's first derived-data table: every
 * other stat is recomputed at read time from games/game_players/game_events.
 * It exists because « Sceau débloqué » is a statement about a TRANSITION —
 * `game_id` records which game first satisfied the condition, which is what the
 * Banquet announcement queries and what a pure derivation cannot answer without
 * recomputing the whole career twice per render.
 *
 * The composite primary key IS the one-time rule: the writer inserts with
 * ON CONFLICT DO NOTHING, so re-running detection over the same game — or
 * replaying every past game through the backfill — changes nothing.
 *
 * `seal_id` is text, not a pgEnum, so adding a seal is a code change and not a
 * migration. Same trade as `user.avatar_id` (allowlist enforced in TypeScript,
 * see packages/game-core/src/seals.ts SEAL_IDS).
 *
 * Rebuildable: this table is a cache of a pure function of the event log.
 * TRUNCATE + backfill reconstructs it exactly.
 */
export const seals = pgTable(
  'seals',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    sealId: text('seal_id').notNull(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.sealId] }),
    // Backfill/debug path: "everything earned in game X, across all players".
    // The per-viewer Banquet query is served by the primary key's user_id prefix.
    index('seals_game').on(t.gameId),
  ]
)
