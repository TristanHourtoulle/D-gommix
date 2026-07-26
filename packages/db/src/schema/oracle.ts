import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { games } from './games'

/**
 * « L'Oracle du village » (plan 040): one optional, secret pre-game prediction
 * per player per game.
 *
 * This table stores INPUT, not derived data — the deliberate opposite of
 * `seals` (plan 033). Who was right, how many points and every ranking are
 * pure functions of these rows plus the finished game state
 * (packages/game-core/src/oracle.ts), recomputed at read time. Retuning the
 * point values therefore needs no migration and no backfill.
 *
 * The composite primary key is one prediction per player per game; the writer
 * upserts, so changing your mind before the launch overwrites rather than
 * duplicates. `created_at` is the FIRST prediction's timestamp and is never
 * moved by an overwrite.
 *
 * Secrecy is enforced by the read layer, not by the schema: no row here may
 * cross the wire before `games.status = 'finished'`
 * (apps/web/src/app/api/oracle/route.ts).
 *
 * Locking is enforced by the write layer: the ws-server refuses a pick once
 * the game left `lobby` (assertLobby, apps/ws-server/src/lobby-shared.ts).
 *
 * No secondary index: every read is either `where game_id = ?` (served by the
 * primary key's leading column) or `where game_id in (...)` over a bounded list.
 */
export const oraclePicks = pgTable(
  'oracle_picks',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    predictedWinnerId: text('predicted_winner_id')
      .notNull()
      .references(() => user.id),
    // NULL = the player predicted a winner and skipped the souffre-douleur,
    // which is explicitly allowed (the whole feature is optional).
    predictedSouffreDouleurId: text('predicted_souffre_douleur_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })]
)
