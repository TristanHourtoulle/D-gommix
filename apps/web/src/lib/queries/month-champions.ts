import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { currentParisMonthKey, parisMonthKeyOf } from '@/lib/season'
import { gameStarted, inList } from './game-filters'
import { compareStandings, getCircleMemberIds, type CircleStanding } from './stats'

/** One finished, started game seen from one circle member's seat. */
export interface MonthGameRow {
  userId: string
  username: string
  avatarId: string | null
  endedAt: Date
  /** 'village_reached' | 'aborted' for finished games. */
  outcome: string
  won: boolean
  degommages: number
}

export interface MonthChampion {
  /** Paris month key, 'YYYY-MM'. */
  month: string
  userId: string
  username: string
  avatarId: string | null
  wins: number
}

export interface SeasonMeta {
  /** Paris month of the circle's earliest finished game; null when none. */
  earliestMonth: string | null
  /** Completed months with at least one village win, newest first. */
  pastChampions: MonthChampion[]
}

/**
 * « Champion du mois » per completed Paris month (plan 027): rank 1 of the
 * month's standings under the village ordering (design §5.3 — wins > winrate
 * > dégommages; aborted games feed dégommages but not the winrate
 * denominator). The current month is excluded (its race is still running);
 * a month with zero village wins has no champion but still counts for
 * `earliestMonth`.
 */
export function computeSeasonMeta(rows: MonthGameRow[], currentMonth: string): SeasonMeta {
  const byMonth = new Map<string, Map<string, CircleStanding>>()
  let earliestMonth: string | null = null
  for (const row of rows) {
    const month = parisMonthKeyOf(row.endedAt)
    if (earliestMonth === null || month < earliestMonth) earliestMonth = month
    if (month >= currentMonth) continue
    const standings = byMonth.get(month) ?? new Map<string, CircleStanding>()
    const standing = standings.get(row.userId) ?? {
      userId: row.userId,
      username: row.username,
      avatarId: row.avatarId,
      wins: 0,
      villageGames: 0,
      winrate: 0,
      degommages: 0,
    }
    if (row.won) standing.wins += 1
    if (row.outcome === 'village_reached') standing.villageGames += 1
    standing.degommages += row.degommages
    standings.set(row.userId, standing)
    byMonth.set(month, standings)
  }

  const pastChampions: MonthChampion[] = []
  for (const [month, standings] of byMonth) {
    const ranked = [...standings.values()]
    for (const standing of ranked) {
      standing.winrate =
        standing.villageGames > 0 ? Math.round((standing.wins / standing.villageGames) * 100) : 0
    }
    ranked.sort(compareStandings)
    const top = ranked[0]
    if (top === undefined || top.wins < 1) continue
    pastChampions.push({
      month,
      userId: top.userId,
      username: top.username,
      avatarId: top.avatarId,
      wins: top.wins,
    })
  }
  pastChampions.sort((a, b) => b.month.localeCompare(a.month))
  return { earliestMonth, pastChampions }
}

/** Circle-scoped season meta — same scoping rule as `getLeaderboard` (§4). */
export async function getSeasonMeta(userId: string, now: Date = new Date()): Promise<SeasonMeta> {
  const memberIds = await getCircleMemberIds(userId)
  const rows = await db
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      avatarId: user.avatarId,
      endedAt: games.endedAt,
      outcome: games.outcome,
      won: sql`${games.winnerId} = ${gamePlayers.userId}`.mapWith(Boolean),
      degommages: gamePlayers.degommages,
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
        sql`${games.endedAt} is not null`
      )
    )

  return computeSeasonMeta(
    rows.flatMap((row) =>
      row.endedAt === null || row.outcome === null
        ? []
        : [
            {
              userId: row.userId,
              username: row.username ?? 'Inconnu',
              avatarId: row.avatarId ?? null,
              endedAt: row.endedAt,
              outcome: row.outcome,
              won: row.won,
              degommages: row.degommages,
            },
          ]
    ),
    currentParisMonthKey(now)
  )
}
