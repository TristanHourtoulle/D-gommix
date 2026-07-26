import { and, eq, sql, gamePlayers, games } from '@degommix/db'
import { db } from '@/lib/db'
import { aggregateTakenByGame } from '@/lib/rivalries'
import {
  buildTitleEntries,
  computeMiracleValues,
  COMEBACK_LOSSES,
  type PlayerTitleEntry,
  type TitleId,
  type TitlePlayerFacts,
} from '@/lib/titles'
import { gameStarted, inList } from './game-filters'
import { queryVillageResults } from './records'
import { finishedGameIdsForMembers, loadRivalryEvents } from './rivalries'
import { getCircleMemberIds } from './stats'
import { computeComebackWinners } from './streaks'

/**
 * « Titres gaulois » — always all-time and always circle-scoped, never
 * windowed by the plan-019 month range: a title is a standing verdict on a
 * player, not a monthly statistic. Same rule as the Palmarès records.
 */

/** Finished, actually-started seats of the circle (aborted games included). */
function circleSeats(memberIds: string[]) {
  return and(
    inList(gamePlayers.userId, memberIds),
    eq(games.status, 'finished'),
    gameStarted,
    sql`${gamePlayers.status} in ('joined', 'left')`
  )
}

/**
 * Games played and biggest single-game carton per member — « L’Increvable »
 * and « Le Berserker ». `count(*)` mirrors getPlayerStats' gamesPlayed
 * (friends.ts), `max(degommages)` mirrors queryBiggestCarton (records.ts).
 */
function queryVolumeFacts(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      gamesPlayed: sql`count(*)`.mapWith(Number),
      bestCarton: sql`coalesce(max(${gamePlayers.degommages}), 0)`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(circleSeats(memberIds))
    .groupBy(gamePlayers.userId)
}

/**
 * Fewest dégommages dealt in a won game, per member — « Le Pacifiste ».
 * `winner_id = user_id` is a sufficient « he won » predicate: the reducer only
 * ever sets a winner on a village_reached close (game-core reducer.ts).
 */
function queryQuietestWins(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      quietestWin: sql`min(${gamePlayers.degommages})`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(circleSeats(memberIds), sql`${games.winnerId} = ${gamePlayers.userId}`))
    .groupBy(gamePlayers.userId)
}

/** Circle games that produced a winner, for « Le Miraculé ». */
function queryWonGames(memberIds: string[]) {
  return db
    .selectDistinct({ gameId: games.id, winnerId: games.winnerId })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(and(circleSeats(memberIds), sql`${games.winnerId} is not null`))
}

/**
 * Worn title of every circle member who has one, computed from the viewer's
 * own friends circle (design §5.2: a stranger met via an invite code is never
 * ranked or named). Titles are viewer-scoped by construction — two players in
 * different circles can legitimately see different titles on the same person.
 */
export async function getCircleTitles(viewerId: string): Promise<PlayerTitleEntry[]> {
  const memberIds = await getCircleMemberIds(viewerId)
  if (memberIds.length === 0) return []

  const gameIds = await finishedGameIdsForMembers(memberIds)
  const [volumeRows, quietRows, wonGameRows, eventRows, villageResults] = await Promise.all([
    queryVolumeFacts(memberIds),
    queryQuietestWins(memberIds),
    queryWonGames(memberIds),
    loadRivalryEvents(gameIds),
    queryVillageResults(memberIds),
  ])

  const takenByGame = aggregateTakenByGame(eventRows)
  const takenTotals = new Map<string, number>()
  for (const [, game] of takenByGame) {
    for (const [userId, count] of game) {
      takenTotals.set(userId, (takenTotals.get(userId) ?? 0) + count)
    }
  }

  const winners = wonGameRows.flatMap((row) =>
    row.winnerId === null ? [] : [{ gameId: row.gameId, winnerId: row.winnerId }]
  )
  const miracles = computeMiracleValues(takenByGame, winners)
  const comebacks = computeComebackWinners(villageResults, COMEBACK_LOSSES)

  const volumeById = new Map(volumeRows.map((row) => [row.userId, row]))
  const quietById = new Map(quietRows.map((row) => [row.userId, row.quietestWin]))

  const facts: TitlePlayerFacts[] = memberIds.map((userId) => ({
    userId,
    gamesPlayed: volumeById.get(userId)?.gamesPlayed ?? 0,
    bestCarton: volumeById.get(userId)?.bestCarton ?? 0,
    quietestWin: quietById.get(userId) ?? null,
    bestMiracle: miracles.get(userId) ?? 0,
    taken: takenTotals.get(userId) ?? 0,
    hasComeback: comebacks.has(userId),
  }))

  return buildTitleEntries(facts)
}

/**
 * The one title `subjectId` wears, as seen from `viewerId`'s circle. Thin
 * accessor for the profile pages — and the stable entry point any other
 * surface (e.g. a future gazette) should use rather than re-deriving titles.
 */
export async function getTitleFor(viewerId: string, subjectId: string): Promise<TitleId | null> {
  const entries = await getCircleTitles(viewerId)
  return entries.find((entry) => entry.userId === subjectId)?.title ?? null
}
