import { and, eq, gte, lt, or, sql } from 'drizzle-orm'
import { friendships, gamePlayers, games, user } from '@degommix/db'
import {
  compareStandings,
  monthWindowParis,
  parisMonthKeyOf,
  parseMonthKey,
  startOfMonthParis,
} from '@degommix/game-core'
import type { DbTransaction } from './finalize'
import { gameStarted, upToCursor, type ReplayCursor } from './replay-cursor'

/**
 * Circle-scoped, cursor-bounded month standings for the title seals (plan 039).
 *
 * Scope is the awardee's circle (self + friends), NOT the whole app:
 * SPECS.md:19 and :122 — « classement scopé au cercle d'amis (+ soi), jamais
 * global à l'app ». A globally-ranked champion would contradict the « Champion
 * du mois » chip the player reads on /classement (getSeasonMeta,
 * apps/web/src/lib/queries/month-champions.ts), which is circle-scoped.
 *
 * Every query carries `upToCursor(cursor)`: during the backfill a 2026-01 game
 * must not see 2026-07 standings (the bug PR #75 fixed for the career queries).
 *
 * The aggregation rule is a mirror of `computeSeasonMeta`: all finished started
 * games feed `degommages`, only `village_reached` games feed `villageGames`,
 * and a month whose top standing has zero wins has no champion. The folding
 * happens in SQL rather than in JS (the one deviation from the web
 * implementation) because this runs inside the authoritative game-close
 * transaction.
 */

export interface MonthStanding {
  userId: string
  username: string
  wins: number
  villageGames: number
  winrate: number
  degommages: number
}

export interface MonthAggregate {
  monthKey: string
  /** Sorted by compareStandings — index 0 is the champion when wins >= 1. */
  ranked: MonthStanding[]
  byUser: Map<string, MonthStanding>
  /** Strict, unique maximum with degommages > 0; null on a tie or an empty month. */
  topDegommeurId: string | null
}

/** Parameterized `column IN (...)`, mirror of apps/web queries/game-filters.ts. */
function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}

/**
 * Self + friends, exactly like `getCircleMemberIds`
 * (apps/web/src/lib/queries/stats.ts). Duplicated rather than imported:
 * apps/ws-server cannot depend on apps/web, and the web version binds the
 * request-scoped `db` rather than this transaction.
 *
 * `friendships` has no history, so this is the circle AS OF NOW even when the
 * cursor points at a past game — see plan 039 § Maintenance notes.
 */
export async function circleMemberIds(tx: DbTransaction, userId: string): Promise<string[]> {
  const pairs = await tx
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))

  const ids = new Set<string>([userId])
  for (const pair of pairs) ids.add(pair.low === userId ? pair.high : pair.low)
  return [...ids]
}

/**
 * First instant of the Paris month the processed game belongs to. Everything
 * that ended before it belongs to a COMPLETED month.
 */
function startOfCursorMonth(cursor: ReplayCursor): Date | null {
  const parsed = parseMonthKey(parisMonthKeyOf(cursor.endedAt))
  if (parsed === null) return null
  return startOfMonthParis(parsed.year, parsed.month)
}

/**
 * Paris month key of the player's most recent finished, started game that ended
 * BEFORE the cursor month started; null when they have none. See plan 039
 * § Architecture decision 3.
 */
export async function lastCompletedActiveMonth(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<string | null> {
  const monthStart = startOfCursorMonth(cursor)
  if (monthStart === null) return null
  const rows = await tx
    .select({ latest: sql<Date | null>`max(${games.endedAt})` })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        lt(games.endedAt, monthStart),
        upToCursor(cursor)
      )
    )
    .limit(1)
  const latest = rows[0]?.latest
  return latest === null || latest === undefined ? null : parisMonthKeyOf(new Date(latest))
}

/**
 * Same, for the circle's most recent completed month holding a village win —
 * « le champion en titre » is crowned from that month (computeSeasonMeta skips
 * months whose top standing has `wins < 1`, and `pastChampions[0]` is the
 * newest of the rest).
 */
export async function lastCompletedChampionMonth(
  tx: DbTransaction,
  memberIds: string[],
  cursor: ReplayCursor
): Promise<string | null> {
  if (memberIds.length === 0) return null
  const monthStart = startOfCursorMonth(cursor)
  if (monthStart === null) return null
  const rows = await tx
    .select({ latest: sql<Date | null>`max(${games.endedAt})` })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        sql`${games.winnerId} is not null`,
        gameStarted,
        sql`${games.endedAt} is not null`,
        lt(games.endedAt, monthStart),
        upToCursor(cursor)
      )
    )
    .limit(1)
  const latest = rows[0]?.latest
  return latest === null || latest === undefined ? null : parisMonthKeyOf(new Date(latest))
}

/**
 * One Paris month of one circle, aggregated and ranked. The month bounds go
 * through the typed `gte` / `lt` helpers, which run the `Date` through the
 * timestamp column's encoder — a `Date` interpolated in a raw `sql` fragment
 * reaches postgres-js unmapped and throws (PR #74, a production 500).
 */
export async function monthAggregate(
  tx: DbTransaction,
  memberIds: string[],
  monthKey: string,
  cursor: ReplayCursor
): Promise<MonthAggregate> {
  const empty: MonthAggregate = { monthKey, ranked: [], byUser: new Map(), topDegommeurId: null }
  const window = monthWindowParis(monthKey)
  if (window === null || memberIds.length === 0) return empty

  const rows = await tx
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      wins: sql<number>`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})::int`,
      villageGames: sql<number>`count(*) filter (where ${games.outcome} = 'village_reached')::int`,
      degommages: sql<number>`coalesce(sum(${gamePlayers.degommages}), 0)::int`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        gte(games.endedAt, window.from),
        lt(games.endedAt, window.to),
        upToCursor(cursor)
      )
    )
    .groupBy(gamePlayers.userId, user.username)

  const ranked: MonthStanding[] = rows.map((row) => ({
    userId: row.userId,
    username: row.username ?? 'Inconnu',
    wins: row.wins,
    villageGames: row.villageGames,
    // Identical to computeSeasonMeta: percentage over village games only.
    winrate: row.villageGames > 0 ? Math.round((row.wins / row.villageGames) * 100) : 0,
    degommages: row.degommages,
  }))
  ranked.sort(compareStandings)

  return {
    monthKey,
    ranked,
    byUser: new Map(ranked.map((standing) => [standing.userId, standing])),
    topDegommeurId: strictTopDegommeur(ranked),
  }
}

/**
 * The month's single best dégommeur. A tie awards nobody — « Le Sanglier d'or »
 * is one boar (plan 039, invented guard) — and a month without a dégommage has
 * no top dégommeur at all.
 */
function strictTopDegommeur(ranked: readonly MonthStanding[]): string | null {
  let best: MonthStanding | undefined
  let tied = false
  for (const standing of ranked) {
    if (best === undefined || standing.degommages > best.degommages) {
      best = standing
      tied = false
    } else if (standing.degommages === best.degommages) {
      tied = true
    }
  }
  if (best === undefined || tied || best.degommages <= 0) return null
  return best.userId
}
