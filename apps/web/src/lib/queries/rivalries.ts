import { and, eq, sql, gameEvents, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import {
  aggregatePairCounts,
  aggregateTakenCounts,
  pickFavoriteVictim,
  pickNemesis,
  sortRivalryPairs,
  type PairCount,
  type RivalryEventRow,
} from '@/lib/rivalries'
import { gameStarted } from './game-filters'
import { getCircleMemberIds } from './stats'

export interface HeadToHead {
  /** Non-undone degommages the viewer dealt to the other player. */
  dealt: number
  /** Non-undone degommages the other player dealt to the viewer. */
  taken: number
}

export interface RivalryPeer {
  userId: string
  username: string
  avatarId?: string | null
  count: number
}

export interface RivalrySpotlight {
  /** Opponent who dégommed me the most (circle members only). */
  nemesis: RivalryPeer | null
  /** Opponent I dégommed the most (circle members only). */
  favoriteVictim: RivalryPeer | null
}

/** Parameterized `column IN (...)` for a non-empty string list. */
function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}

/**
 * Ids of every finished game the user actually played. Aborted games are
 * included on purpose: per design §5.3 dégommages count « toutes parties finies
 * confondues, abandons inclus ». Lobbies dissolved before the start are not —
 * they carry no event at all, but they must not leak into « parties ensemble ».
 */
async function finishedGameIdsFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: games.id })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted
      )
    )

  return rows.map((row) => row.id)
}

/**
 * Finished, started games where any of the given members held a seat.
 * Exported for queries/titles.ts (plan 032).
 */
export async function finishedGameIdsForMembers(memberIds: string[]): Promise<string[]> {
  if (memberIds.length === 0) return []
  const rows = await db
    .selectDistinct({ id: games.id })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted
      )
    )
  return rows.map((row) => row.id)
}

/**
 * The DEGOMMAGE and UNDO rows of the given games. The UNDO rows are what makes
 * the exclusion in `aggregatePairCounts` possible, so both types are needed.
 * Exported for queries/titles.ts (plan 032).
 */
export async function loadRivalryEvents(gameIds: string[]): Promise<RivalryEventRow[]> {
  if (gameIds.length === 0) return []

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
    .where(
      and(inList(gameEvents.gameId, gameIds), sql`${gameEvents.type} in ('DEGOMMAGE', 'UNDO')`)
    )
}

/** Ids of the finished games both players sat in. */
export async function sharedFinishedGameIds(
  viewerId: string,
  opponentId: string
): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    finishedGameIdsFor(viewerId),
    finishedGameIdsFor(opponentId),
  ])

  const theirSet = new Set(theirs)
  return mine.filter((id) => theirSet.has(id))
}

/**
 * « Qui dégomme qui » between two players, over the finished games they shared.
 * Returns zeros rather than null so the caller always renders a card. The
 * friends-only rule of SPECS.md §Amis is enforced by the caller's guard.
 */
export async function getHeadToHead(viewerId: string, opponentId: string): Promise<HeadToHead> {
  const gameIds = await sharedFinishedGameIds(viewerId, opponentId)
  const rows = await loadRivalryEvents(gameIds)
  const found = aggregatePairCounts(rows, viewerId).find((p) => p.opponentId === opponentId)

  return { dealt: found?.dealt ?? 0, taken: found?.taken ?? 0 }
}

interface SpotlightIdentity {
  username: string
  avatarId: string | null
}

/** Identities of the one or two spotlighted opponents, in a single query. */
async function loadUsernames(ids: string[]): Promise<Map<string, SpotlightIdentity>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: user.id, username: user.username, avatarId: user.avatarId })
    .from(user)
    .where(inList(user.id, ids))

  return new Map(
    rows.map((row) => [row.id, { username: row.username ?? 'Inconnu', avatarId: row.avatarId }])
  )
}

function toPeer(
  pair: PairCount | null,
  counter: 'dealt' | 'taken',
  usernames: Map<string, SpotlightIdentity>
): RivalryPeer | null {
  if (pair === null) return null
  const identity = usernames.get(pair.opponentId)
  return {
    userId: pair.opponentId,
    username: identity?.username ?? 'Inconnu',
    avatarId: identity?.avatarId ?? null,
    count: pair[counter],
  }
}

/**
 * My nemesis and my favourite victim over every finished game I played.
 * Opponents are filtered through my friends circle, so a stranger met via an
 * invite code is never named (design §5.2 « périmètre du classement », and the
 * friends-only visibility rule of SPECS.md §Amis).
 */
export async function getRivalrySpotlight(viewerId: string): Promise<RivalrySpotlight> {
  const [gameIds, memberIds] = await Promise.all([
    finishedGameIdsFor(viewerId),
    getCircleMemberIds(viewerId),
  ])

  const rows = await loadRivalryEvents(gameIds)
  const circle = new Set(memberIds)
  const pairs = aggregatePairCounts(rows, viewerId).filter((pair) => circle.has(pair.opponentId))

  const nemesisPair = pickNemesis(pairs)
  const victimPair = pickFavoriteVictim(pairs)
  const spotlighted = new Set(
    [nemesisPair?.opponentId, victimPair?.opponentId].filter(
      (id): id is string => id !== undefined
    )
  )
  const usernames = await loadUsernames([...spotlighted])

  return {
    nemesis: toPeer(nemesisPair, 'taken', usernames),
    favoriteVictim: toPeer(victimPair, 'dealt', usernames),
  }
}

/**
 * Circle member who suffered the most non-undone degommages, all-time — the
 * taken-side twin of the « Fléau des Gaules » spotlight. A member can only be
 * dégommé in a game they sat in, so scanning the union of the circle's games
 * counts exactly each member's own suffered hits. Strangers met via code are
 * filtered out (SPECS.md §Amis: « Profil et stats visibles par les amis
 * uniquement »). Null when nobody in the circle was ever dégommé.
 */
export async function getSouffreDouleur(viewerId: string): Promise<RivalryPeer | null> {
  const memberIds = await getCircleMemberIds(viewerId)
  const gameIds = await finishedGameIdsForMembers(memberIds)
  const rows = await loadRivalryEvents(gameIds)
  const taken = aggregateTakenCounts(rows)

  const circle = new Set(memberIds)
  let bestId: string | null = null
  let bestTaken = 0
  for (const [userId, count] of taken) {
    if (!circle.has(userId) || count === 0) continue
    const beats =
      count > bestTaken ||
      (count === bestTaken && bestId !== null && userId.localeCompare(bestId) < 0)
    if (beats) {
      bestId = userId
      bestTaken = count
    }
  }
  if (bestId === null) return null

  const identity = (await loadUsernames([bestId])).get(bestId)
  return {
    userId: bestId,
    username: identity?.username ?? 'Inconnu',
    avatarId: identity?.avatarId ?? null,
    count: bestTaken,
  }
}

/**
 * Total non-undone degommages this player suffered over their finished games.
 * Goes through the same UNDO-cancellation path as the pair aggregation — a raw
 * SQL count over game_events would overcount undone hits.
 */
export async function getDegommagesTaken(userId: string): Promise<number> {
  const gameIds = await finishedGameIdsFor(userId)
  const rows = await loadRivalryEvents(gameIds)
  return aggregateTakenCounts(rows).get(userId) ?? 0
}

export interface RivalryPair {
  userId: string
  username: string
  avatarId?: string | null
  /** Non-undone degommages the viewer dealt to this opponent. */
  dealt: number
  /** Non-undone degommages this opponent dealt to the viewer. */
  taken: number
}

/**
 * Every « qui dégomme qui » pair of the viewer, most active first. Same scope
 * rules as getRivalrySpotlight: circle members only (SPECS.md §4, a stranger
 * met via an invite code is never named), all-time in both leaderboard period
 * views (plan 019 decision — rivalry data is never windowed).
 */
export async function getRivalryPairs(viewerId: string): Promise<RivalryPair[]> {
  const [gameIds, memberIds] = await Promise.all([
    finishedGameIdsFor(viewerId),
    getCircleMemberIds(viewerId),
  ])

  const rows = await loadRivalryEvents(gameIds)
  const circle = new Set(memberIds)
  const pairs = aggregatePairCounts(rows, viewerId).filter((pair) => circle.has(pair.opponentId))
  const usernames = await loadUsernames(pairs.map((pair) => pair.opponentId))

  return sortRivalryPairs(
    pairs.map((pair) => {
      const identity = usernames.get(pair.opponentId)
      return {
        userId: pair.opponentId,
        username: identity?.username ?? 'Inconnu',
        avatarId: identity?.avatarId ?? null,
        dealt: pair.dealt,
        taken: pair.taken,
      }
    })
  )
}
