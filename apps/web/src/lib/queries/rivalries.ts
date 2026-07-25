import { and, eq, sql, gameEvents, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import {
  aggregatePairCounts,
  pickFavoriteVictim,
  pickNemesis,
  type PairCount,
  type RivalryEventRow,
} from '@/lib/rivalries'
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
 * Ids of every finished game where the user held a seat. Aborted games are
 * included on purpose: per design §5.3 dégommages count « toutes parties finies
 * confondues, abandons inclus ».
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
        eq(games.status, 'finished')
      )
    )

  return rows.map((row) => row.id)
}

/**
 * The DEGOMMAGE and UNDO rows of the given games. The UNDO rows are what makes
 * the exclusion in `aggregatePairCounts` possible, so both types are needed.
 */
async function loadRivalryEvents(gameIds: string[]): Promise<RivalryEventRow[]> {
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

/** Usernames of the one or two spotlighted opponents, in a single query. */
async function loadUsernames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inList(user.id, ids))

  return new Map(rows.map((row) => [row.id, row.username ?? 'Inconnu']))
}

function toPeer(
  pair: PairCount | null,
  counter: 'dealt' | 'taken',
  usernames: Map<string, string>
): RivalryPeer | null {
  if (pair === null) return null
  return {
    userId: pair.opponentId,
    username: usernames.get(pair.opponentId) ?? 'Inconnu',
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
