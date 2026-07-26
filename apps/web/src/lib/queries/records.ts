import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { gameStarted, inList } from './game-filters'
import { computeLongestStreaks, type StreakGameResult } from './streaks'

/**
 * All-time « Palmarès » records of the friends circle (design §4: every stat
 * is circle-scoped, never app-global). Deliberately range-free: records must
 * NEVER carry the plan-019 month window, so neither the window type nor the
 * window predicate that stats.ts defines may ever be imported here.
 */

export interface RecordHolder {
  userId: string
  username: string
  avatarId?: string | null
}

export interface GameRecord {
  gameId: string
  /** Whole seconds between started_at and ended_at, rounded in SQL. */
  durationSec: number
  /** The game's winner (a village_reached game always has one). */
  holder: RecordHolder
}

export interface CountRecord {
  holder: RecordHolder
  count: number
  /** Game that set the record, when a single game did (biggest carton). */
  gameId?: string
}

export interface CircleRecords {
  fastestVillage: GameRecord | null
  longestVillage: GameRecord | null
  longestStreak: CountRecord | null
  biggestCarton: CountRecord | null
}

/** One row of the circle's all-time village_reached history, newest first. */
export interface VillageResultRow extends StreakGameResult {
  /** Groups seats into games for the cote fold (plan 043). */
  gameId: string
  username: string | null
  avatarId: string | null
}

/**
 * All-time win/loss list of the circle's village_reached games, newest first
 * by (ended_at, id). Single source for the current-streak chips (stats.ts),
 * the longest-streak record and the « Cote du guerrier » fold (plan 043), so
 * the table is scanned once per leaderboard load.
 */
export function queryVillageResults(memberIds: string[]) {
  return db
    .select({
      gameId: games.id,
      userId: gamePlayers.userId,
      username: user.username,
      avatarId: user.avatarId,
      won: sql`${games.winnerId} = ${gamePlayers.userId}`.mapWith(Boolean),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
    // (ended_at, id) — the replay-cursor order of PR #75
    // (apps/ws-server/src/backfill-seals.ts, apps/ws-server/src/seals.ts),
    // read in reverse. `games.id` breaks ended_at ties so the sequence — and
    // therefore the cote fold that consumes it — is deterministic.
    .orderBy(sql`${games.endedAt} desc`, sql`${games.id} desc`)
}

const durationSec =sql`round(extract(epoch from (${games.endedAt} - ${games.startedAt})))`

/**
 * Extreme-duration village_reached game of the circle, winner joined for the
 * holder identity. `outcome = 'village_reached'` is load-bearing: a 24 h
 * zombie auto-close (outcome 'aborted', ws-server/src/zombie-job.ts) must
 * never be « la partie la plus longue ». Ties go to the earliest ended_at —
 * the first game to set a record keeps it. The gamePlayers join fans out one
 * row per circle participant, but every selected column is game- or
 * winner-level, so the duplicate rows are identical and limit 1 is safe.
 */
function queryVillageGameByDuration(memberIds: string[], direction: 'asc' | 'desc') {
  return db
    .select({
      gameId: games.id,
      durationSec: durationSec.mapWith(Number),
      userId: user.id,
      username: user.username,
      avatarId: user.avatarId,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .innerJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
    .orderBy(
      direction === 'asc' ? sql`${durationSec} asc` : sql`${durationSec} desc`,
      sql`${games.endedAt} asc`
    )
    .limit(1)
}

/**
 * Biggest single-game dégommage count. No outcome filter on purpose: design
 * §5.3, « les dégommages comptent » even in abandoned games — only the
 * winrate denominator excludes them. `> 0` keeps an all-zero circle at null.
 */
function queryBiggestCarton(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      avatarId: user.avatarId,
      degommages: gamePlayers.degommages,
      gameId: gamePlayers.gameId,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`,
        sql`${gamePlayers.degommages} > 0`
      )
    )
    .orderBy(sql`${gamePlayers.degommages} desc`, sql`${games.endedAt} asc`)
    .limit(1)
}

/**
 * Record holder of the longest-ever win streak. Requires at least 2 wins —
 * a « série » of one is just a win (same threshold as the podium streak
 * chip). Ties break on French alphabetical order of usernames, like the
 * leaderboard's own last tiebreaker (compareStandings, stats.ts).
 */
export function pickLongestStreakHolder(
  longestByUser: Map<string, number>,
  rows: VillageResultRow[]
): CountRecord | null {
  const usernameOf = (userId: string): string =>
    rows.find((row) => row.userId === userId)?.username ?? 'Inconnu'

  let best: { userId: string; count: number } | null = null
  for (const [userId, count] of longestByUser) {
    if (count < 2) continue
    const beats =
      best === null ||
      count > best.count ||
      (count === best.count &&
        usernameOf(userId).localeCompare(usernameOf(best.userId), 'fr') < 0)
    if (beats) best = { userId, count }
  }
  if (best === null) return null

  const winner = best
  const holderRow = rows.find((row) => row.userId === winner.userId)
  return {
    holder: {
      userId: winner.userId,
      username: holderRow?.username ?? 'Inconnu',
      avatarId: holderRow?.avatarId ?? null,
    },
    count: winner.count,
  }
}

/**
 * The four all-time records. `villageResults` is the promise getLeaderboard
 * already kicked off (queryVillageResults) so the shared scan runs once;
 * passing the promise (not the awaited rows) keeps everything parallel.
 */
export async function getCircleRecords(
  memberIds: string[],
  villageResults: VillageResultRow[] | PromiseLike<VillageResultRow[]>
): Promise<CircleRecords> {
  const [fastestRows, longestRows, cartonRows, results] = await Promise.all([
    queryVillageGameByDuration(memberIds, 'asc'),
    queryVillageGameByDuration(memberIds, 'desc'),
    queryBiggestCarton(memberIds),
    villageResults,
  ])

  const toGameRecord = (
    row: Awaited<ReturnType<typeof queryVillageGameByDuration>>[number] | undefined
  ): GameRecord | null =>
    row === undefined
      ? null
      : {
          gameId: row.gameId,
          durationSec: row.durationSec,
          holder: {
            userId: row.userId,
            username: row.username ?? 'Inconnu',
            avatarId: row.avatarId ?? null,
          },
        }

  const carton = cartonRows[0]
  return {
    fastestVillage: toGameRecord(fastestRows[0]),
    longestVillage: toGameRecord(longestRows[0]),
    longestStreak: pickLongestStreakHolder(computeLongestStreaks(results), results),
    biggestCarton:
      carton === undefined
        ? null
        : {
            holder: {
              userId: carton.userId,
              username: carton.username ?? 'Inconnu',
              avatarId: carton.avatarId ?? null,
            },
            count: carton.degommages,
            gameId: carton.gameId,
          },
  }
}
