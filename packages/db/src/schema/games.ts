import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'

export const gameStatus = pgEnum('game_status', ['lobby', 'active', 'finished'])
export const gameOutcome = pgEnum('game_outcome', ['village_reached', 'aborted'])
export const characterId = pgEnum('character_id', [
  'asterix',
  'obelix',
  'caius_bonus',
  'caligula_minus',
])
export const gamePlayerStatus = pgEnum('game_player_status', [
  'invited',
  'joined',
  'declined',
  'kicked',
  'left',
])

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    status: gameStatus('status').notNull().default('lobby'),
    format: smallint('format').notNull(),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id),
    winnerId: text('winner_id').references(() => user.id),
    outcome: gameOutcome('outcome'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('games_format_check', sql`${t.format} IN (2, 3, 4)`)]
)

export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    status: gamePlayerStatus('status').notNull(),
    character: characterId('character'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    degommages: integer('degommages').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.userId] }),
    uniqueIndex('game_players_character_unique')
      .on(t.gameId, t.character)
      .where(sql`${t.character} IS NOT NULL AND ${t.status} IN ('invited', 'joined')`),
  ]
)

export const gameEvents = pgTable(
  'game_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    actorId: text('actor_id').references(() => user.id),
    targetId: text('target_id').references(() => user.id),
    payload: jsonb('payload'),
    clientEventId: uuid('client_event_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('game_events_game_seq_unique').on(t.gameId, t.seq),
    index('game_events_game_seq').on(t.gameId, t.seq),
  ]
)
