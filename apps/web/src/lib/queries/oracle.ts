import { and, eq, sql, games, oraclePicks, user } from '@degommix/db'
import {
  resolveSouffreDouleurId,
  scoreOraclePick,
  scoreOraclePicks,
  type OracleOutcome,
  type OraclePick,
} from '@degommix/game-core'
import { db } from '@/lib/db'
import type { GazetteCount } from '@/lib/gazette/facts'
import { aggregateTakenByGame } from '@/lib/rivalries'
import { inList } from './game-filters'
import { finishedGameIdsForMembers, loadRivalryEvents } from './rivalries'
import { getCircleMemberIds } from './stats'

/**
 * « L'Oracle du village » (plan 040) read layer.
 *
 * Nothing here is stored: `oracle_picks` holds raw human input and every
 * verdict, ranking and Gazette brief below is recomputed from those rows plus
 * the finished game state with the pure scorer in
 * `packages/game-core/src/oracle.ts`.
 */

export interface MyOraclePick {
  predictedWinnerId: string
  predictedSouffreDouleurId: string | null
}

/** The viewer's own pick in a lobby. Safe before the game ends: it is theirs. */
export async function getMyOraclePick(
  gameId: string,
  userId: string
): Promise<MyOraclePick | null> {
  const [row] = await db
    .select({
      predictedWinnerId: oraclePicks.predictedWinnerId,
      predictedSouffreDouleurId: oraclePicks.predictedSouffreDouleurId,
    })
    .from(oraclePicks)
    .where(and(eq(oraclePicks.gameId, gameId), eq(oraclePicks.userId, userId)))
  return row ?? null
}

export interface OraclePickRow {
  userId: string
  username: string
  avatarId: string | null
  predictedWinnerId: string
  predictedWinnerUsername: string
  predictedSouffreDouleurId: string | null
  predictedSouffreDouleurUsername: string | null
}

/**
 * Every pick of a game, with the predicted players' names resolved.
 *
 * SECRECY GATE: returns [] unless `games.status = 'finished'`. This function is
 * the ONLY place other players' predictions may be read, and the check lives
 * here rather than in the route so that no future caller can forget it.
 */
export async function getRevealedOraclePicks(gameId: string): Promise<OraclePickRow[]> {
  const [game] = await db
    .select({ status: games.status })
    .from(games)
    .where(eq(games.id, gameId))
  if (game?.status !== 'finished') return []

  // The predictor is joined for their identity; the two PREDICTED players are
  // resolved in one batched name lookup below rather than two more aliased
  // joins — the souffre-douleur side is nullable and the id set is tiny.
  const predictor = user

  const rows = await db
    .select({
      userId: oraclePicks.userId,
      username: predictor.username,
      avatarId: predictor.avatarId,
      predictedWinnerId: oraclePicks.predictedWinnerId,
      predictedSouffreDouleurId: oraclePicks.predictedSouffreDouleurId,
      createdAt: oraclePicks.createdAt,
    })
    .from(oraclePicks)
    .innerJoin(predictor, eq(predictor.id, oraclePicks.userId))
    .where(eq(oraclePicks.gameId, gameId))
    .orderBy(sql`${oraclePicks.createdAt} asc`, sql`${oraclePicks.userId} asc`)

  const names = await usernamesOf([
    ...rows.map((row) => row.predictedWinnerId),
    ...rows.flatMap((row) =>
      row.predictedSouffreDouleurId === null ? [] : [row.predictedSouffreDouleurId]
    ),
  ])

  const picks: OraclePickRow[] = []
  for (const row of rows) {
    if (row.username === null) continue
    picks.push({
      userId: row.userId,
      username: row.username,
      avatarId: row.avatarId,
      predictedWinnerId: row.predictedWinnerId,
      predictedWinnerUsername: names.get(row.predictedWinnerId) ?? '',
      predictedSouffreDouleurId: row.predictedSouffreDouleurId,
      predictedSouffreDouleurUsername:
        row.predictedSouffreDouleurId === null
          ? null
          : (names.get(row.predictedSouffreDouleurId) ?? ''),
    })
  }
  return picks
}

/** Usernames of the given ids, deduplicated; unnamed users are skipped. */
async function usernamesOf(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inList(user.id, unique))
  const names = new Map<string, string>()
  for (const row of rows) {
    if (row.username === null) continue
    names.set(row.id, row.username)
  }
  return names
}

export interface ProphetRow {
  userId: string
  username: string
  avatarId: string | null
  points: number
  /** Games in which this player predicted anything at all. */
  predictions: number
  /** Predictions that named the exact winner. */
  exactWinners: number
}

/** « Classement des prophètes » — circle-scoped, all-time, points desc. */
export async function getProphets(userId: string): Promise<ProphetRow[]> {
  const memberIds = await getCircleMemberIds(userId)
  const gameIds = await finishedGameIdsForMembers(memberIds)
  if (gameIds.length === 0) return []

  const picks = await db
    .select({
      gameId: oraclePicks.gameId,
      userId: oraclePicks.userId,
      predictedWinnerId: oraclePicks.predictedWinnerId,
      predictedSouffreDouleurId: oraclePicks.predictedSouffreDouleurId,
    })
    .from(oraclePicks)
    .where(inList(oraclePicks.gameId, gameIds))
  // No prediction anywhere in the circle: the tile disappears entirely rather
  // than rendering a permanent zero. Predictions cannot be backfilled.
  if (picks.length === 0) return []

  const members = new Set(memberIds)
  const outcomes = await outcomesOf(gameIds)

  interface Tally {
    points: number
    predictions: number
    exactWinners: number
  }
  const tallies = new Map<string, Tally>()
  for (const pick of picks) {
    if (!members.has(pick.userId)) continue
    const outcome = outcomes.get(pick.gameId)
    if (!outcome) continue
    const score = scoreOraclePick(
      {
        userId: pick.userId,
        predictedWinnerId: pick.predictedWinnerId,
        predictedSouffreDouleurId: pick.predictedSouffreDouleurId,
      },
      outcome
    )
    const tally = tallies.get(pick.userId) ?? { points: 0, predictions: 0, exactWinners: 0 }
    tally.points += score.points
    tally.predictions += 1
    if (score.winnerHit) tally.exactWinners += 1
    tallies.set(pick.userId, tally)
  }
  if (tallies.size === 0) return []

  const identities = await db
    .select({ id: user.id, username: user.username, avatarId: user.avatarId })
    .from(user)
    .where(inList(user.id, [...tallies.keys()]))

  const rows: ProphetRow[] = []
  for (const identity of identities) {
    const tally = tallies.get(identity.id)
    if (!tally || identity.username === null) continue
    rows.push({
      userId: identity.id,
      username: identity.username,
      avatarId: identity.avatarId,
      points: tally.points,
      predictions: tally.predictions,
      exactWinners: tally.exactWinners,
    })
  }
  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.exactWinners - a.exactWinners ||
      a.username.localeCompare(b.username, 'fr')
  )
}

/** Winner + souffre-douleur of each finished game, resolved from the event log. */
async function outcomesOf(gameIds: string[]): Promise<Map<string, OracleOutcome>> {
  const [winnerRows, events] = await Promise.all([
    db
      .select({ id: games.id, winnerId: games.winnerId })
      .from(games)
      .where(inList(games.id, gameIds)),
    loadRivalryEvents(gameIds),
  ])
  const takenByGame = aggregateTakenByGame(events)
  const outcomes = new Map<string, OracleOutcome>()
  for (const row of winnerRows) {
    const taken = takenByGame.get(row.id)
    outcomes.set(row.id, {
      winnerId: row.winnerId,
      souffreDouleurId: resolveSouffreDouleurId(
        taken ? Object.fromEntries(taken) : {}
      ),
    })
  }
  return outcomes
}

/**
 * The strictly-ahead top scorer of one game's predictions, as the Gazette
 * names it. Null when nobody predicted, when nobody scored, or on a tie — the
 * same « strictly ahead or nothing » rule `getTitleHolder` uses, so two players
 * opening the same parchment always read the same brief.
 *
 * Because `getRevealedOraclePicks` gates on `status = 'finished'` and the
 * gazette page already redirects unfinished games, secrecy holds without a
 * second check here.
 */
export async function getGameProphet(
  gameId: string,
  outcomeInput: { winnerId: string | null; takenCounts: readonly GazetteCount[] }
): Promise<GazetteCount | null> {
  const rows = await getRevealedOraclePicks(gameId)
  if (rows.length === 0) return null

  const outcome: OracleOutcome = {
    winnerId: outcomeInput.winnerId,
    souffreDouleurId: resolveSouffreDouleurId(
      Object.fromEntries(outcomeInput.takenCounts.map((count) => [count.userId, count.count]))
    ),
  }
  const picks: OraclePick[] = rows.map((row) => ({
    userId: row.userId,
    predictedWinnerId: row.predictedWinnerId,
    predictedSouffreDouleurId: row.predictedSouffreDouleurId,
  }))
  const scored = scoreOraclePicks(picks, outcome).filter((score) => score.points > 0)
  const best = scored[0]
  if (!best) return null
  const runnerUp = scored[1]
  if (runnerUp && runnerUp.points === best.points) return null

  const username = rows.find((row) => row.userId === best.userId)?.username
  if (username === undefined) return null
  return { userId: best.userId, username, count: best.points }
}
