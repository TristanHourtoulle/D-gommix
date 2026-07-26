import { and, eq, sql, gameEvents, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import {
  computeBadFaith,
  computeDistance,
  computeFidelity,
  pickCarnageRecord,
  type BadFaithRow,
  type CarnageRecord,
  type CarnageRow,
  type DistanceStat,
  type FidelityRow,
} from '@/lib/almanach'
import type { CharacterStatRow } from '@/lib/character-stats'
import type { RivalryEventRow } from '@/lib/rivalries'
import { gameStarted, inList } from './game-filters'
import { getCircleMemberIds } from './stats'

/**
 * « L'Almanach » — circle-scoped, all-time absurd statistics (plan 036).
 * Deliberately range-free: the windowed range type and the month predicate of
 * stats.ts must never reach this file — the Almanach is all-time by
 * construction. The pure arithmetic lives in `@/lib/almanach`; this file only
 * shapes the rows.
 */

export interface TableTimeStat {
  /** Whole seconds summed over real games (zombie auto-closes excluded). */
  seconds: number
  /** How many games that sum covers — the caption prints it. */
  games: number
}

export interface Almanach {
  distance: DistanceStat | null
  tableTime: TableTimeStat | null
  carnage: CarnageRecord | null
  fidelity: FidelityRow[]
  badFaith: BadFaithRow[]
}

/** Duration of a game in whole seconds (same fragment as records.ts:75). */
const durationSec = sql`round(extract(epoch from (${games.endedAt} - ${games.startedAt})))`

/**
 * True when at least one circle member actually sat in this game. Written as
 * an EXISTS rather than a join so a `from(games)` query counts each game ONCE
 * — a join would fan the row out per participant and multiply the duration.
 */
function circleSeatExists(memberIds: string[]) {
  return sql`exists (
    select 1 from ${gamePlayers}
    where ${gamePlayers.gameId} = ${games.id}
      and ${gamePlayers.status} in ('joined', 'left')
      and ${inList(gamePlayers.userId, memberIds)}
  )`
}

/**
 * Excludes the 24 h zombie auto-closes (apps/ws-server/src/zombie-job.ts).
 * Their `ended_at` is a sweep timestamp, not a moment anyone was at the table,
 * so a ~24 h duration would dwarf every real game in the time budget and drag
 * the carnage rate to zero. The auto-close event tested below is the same
 * signal `deriveAbortReason` uses (queries/game-detail-journal.ts:131) — there
 * is no abort-reason column on `games`. Applied ONLY to the duration metrics:
 * dégommages made in a game that later went zombie really happened.
 */
const notZombieAutoClosed = sql`not exists (
  select 1 from ${gameEvents}
  where ${gameEvents.gameId} = ${games.id}
    and ${gameEvents.type} = 'GAME_AUTO_CLOSED'
)`

/**
 * Total dégommages of the circle, all-time. Reads the denormalized
 * `game_players.degommages` (written by ws-server/src/finalize.ts from the
 * reducer, undos already cancelled). Aborted games count — SPECS.md:126,
 * « les dégommages comptent » — and so do zombie games (see above).
 */
function queryTotalDegommages(memberIds: string[]) {
  return db
    .select({ total: sql`coalesce(sum(${gamePlayers.degommages}), 0)`.mapWith(Number) })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
}

/**
 * Real time the village spent at the table: every finished, started, non-zombie
 * game the circle sat in, counted once. No `outcome` filter on purpose — a
 * table that argued for 40 minutes before abandoning still sat there 40
 * minutes (plan 036 decision 7).
 */
function queryTableTime(memberIds: string[]) {
  return db
    .select({
      seconds: sql`coalesce(sum(${durationSec}), 0)`.mapWith(Number),
      games: sql`count(*)`.mapWith(Number),
    })
    .from(games)
    .where(
      and(
        eq(games.status, 'finished'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        circleSeatExists(memberIds),
        notZombieAutoClosed
      )
    )
}

/**
 * One row per eligible game with the WHOLE table's dégommage total — the join
 * is not restricted to circle members, because the carnage of a game is what
 * happened on that table; `circleSeatExists` is what makes the game ours.
 * The rate itself is picked in `pickCarnageRecord` (pure, with the
 * min-duration guard), so the threshold stays unit-tested rather than buried
 * in SQL.
 */
function queryCarnageRows(memberIds: string[]) {
  return db
    .select({
      gameId: games.id,
      durationSec: durationSec.mapWith(Number),
      degommages: sql`coalesce(sum(${gamePlayers.degommages}), 0)`.mapWith(Number),
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(games.status, 'finished'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        sql`${gamePlayers.status} in ('joined', 'left')`,
        circleSeatExists(memberIds),
        notZombieAutoClosed
      )
    )
    .groupBy(games.id, games.startedAt, games.endedAt)
}

/**
 * `(member, character)` seat counts feeding `buildPerCharacter` (plan 028's
 * machinery). Same predicates as `queryCharacterStats` in stats.ts, minus the
 * range: the Almanach is all-time. `villageGames` / `wins` are unused by the
 * fidelity share but `CharacterStatRow` requires them, and they cost nothing.
 */
function queryCharacterSeats(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      character: gamePlayers.character,
      played: sql`count(*)`.mapWith(Number),
      villageGames: sql`count(*) filter (where ${games.outcome} = 'village_reached')`.mapWith(
        Number
      ),
      wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(Number),
      lastPlayed: sql`extract(epoch from max(${games.startedAt}))`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`,
        sql`${gamePlayers.character} is not null`
      )
    )
    .groupBy(gamePlayers.userId, gamePlayers.character)
}

/**
 * DEGOMMAGE and UNDO rows of every finished, started game the circle sat in.
 * Both types are needed: the UNDO rows are what let `aggregateTakenCounts`
 * cancel undone hits, and they are also the numerator of the bad-faith index.
 */
function queryRivalryEvents(memberIds: string[]) {
  return db
    .select({
      gameId: gameEvents.gameId,
      seq: gameEvents.seq,
      type: gameEvents.type,
      actorId: gameEvents.actorId,
      targetId: gameEvents.targetId,
      payload: gameEvents.payload,
    })
    .from(gameEvents)
    .innerJoin(games, eq(games.id, gameEvents.gameId))
    .where(
      and(
        sql`${gameEvents.type} in ('DEGOMMAGE', 'UNDO')`,
        eq(games.status, 'finished'),
        gameStarted,
        circleSeatExists(memberIds)
      )
    )
}

/** Usernames of the circle, for the per-player rankings. */
function queryCircleUsernames(memberIds: string[]) {
  return db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inList(user.id, memberIds))
}

/**
 * The five Almanach figures, circle-scoped and all-time (plan 036). One
 * `getCircleMemberIds` then everything in parallel — same shape as
 * `getLeaderboard`.
 */
export async function getAlmanach(userId: string): Promise<Almanach> {
  const memberIds = await getCircleMemberIds(userId)

  const [degommageRows, timeRows, carnageRows, seatRows, eventRows, usernameRows] =
    await Promise.all([
      queryTotalDegommages(memberIds),
      queryTableTime(memberIds),
      queryCarnageRows(memberIds),
      queryCharacterSeats(memberIds),
      queryRivalryEvents(memberIds),
      queryCircleUsernames(memberIds),
    ])

  const usernames = new Map(usernameRows.map((row) => [row.id, row.username ?? 'Inconnu']))
  const time = timeRows[0]

  return {
    distance: computeDistance(degommageRows[0]?.total ?? 0),
    tableTime:
      time === undefined || time.games === 0 ? null : { seconds: time.seconds, games: time.games },
    carnage: pickCarnageRecord(carnageRows satisfies CarnageRow[]),
    fidelity: computeFidelity(seatRows satisfies CharacterStatRow[], usernames),
    badFaith: computeBadFaith(eventRows satisfies RivalryEventRow[], memberIds, usernames),
  }
}
