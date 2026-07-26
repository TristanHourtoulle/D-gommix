import { and, desc, eq, or, sql } from 'drizzle-orm'
import { gamePlayers, games, seals } from '@degommix/db'
import {
  detectSeals,
  RISING_TIDE_STREAK,
  SEAL_IDS,
  type GameState,
  type MonthRecord,
  type SealId,
} from '@degommix/game-core'
import type { DbTransaction } from './finalize'
import {
  circleMemberIds,
  lastCompletedActiveMonth,
  lastCompletedChampionMonth,
  monthAggregate,
  type MonthAggregate,
} from './month-standings'
import { gameStarted, replayCursor, upToCursor, type ReplayCursor } from './replay-cursor'

/**
 * Village wins up to and including the game being processed (this runs after
 * `games` has been stamped, so that game counts). Mirror of `getPlayerStats` in
 * apps/web/src/lib/queries/friends.ts, plus the replay bound.
 */
async function careerWins(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(
      and(
        eq(games.winnerId, userId),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        upToCursor(cursor)
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * Consecutive village wins ending with the game being processed. Bounded twice:
 * by the replay cursor (never look past that game) and by RISING_TIDE_STREAK
 * rows, since the detector only needs to know whether that many village games
 * in a row were wins. Aborted games are neutral because they are filtered out
 * entirely — the same rule as apps/web/src/lib/queries/streaks.ts.
 */
async function currentStreak(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const recent = await tx
    .select({ winnerId: games.winnerId })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        or(eq(gamePlayers.status, 'joined'), eq(gamePlayers.status, 'left')),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        upToCursor(cursor)
      )
    )
    // games.id breaks endedAt ties so the order is deterministic.
    .orderBy(desc(games.endedAt), desc(games.id))
    .limit(RISING_TIDE_STREAK)

  let streak = 0
  for (const row of recent) {
    if (row.winnerId !== userId) break
    streak += 1
  }
  return streak
}

/**
 * Career dégommages dealt, net of undos, up to and including this game
 * (`game_players.degommages` is written by finalizeGame just before this runs).
 * NO outcome filter on purpose: design §5.3 counts dégommages in abandoned
 * games too.
 */
async function careerDegommages(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`coalesce(sum(${gamePlayers.degommages}), 0)::int` })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted,
        upToCursor(cursor)
      )
    )
  return rows[0]?.total ?? 0
}

/** Distinct characters this player has ever won a village game with. */
async function careerCharacterWins(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(distinct ${gamePlayers.character})::int` })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(games.winnerId, userId),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        sql`${gamePlayers.character} is not null`,
        gameStarted,
        upToCursor(cursor)
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * Games this player hosted that reached the village. « Menées à leur terme »
 * excludes abandons — and therefore the 24 h zombie auto-close, which writes
 * `outcome = 'aborted'` (apps/ws-server/src/zombie-job.ts). Guard invented by
 * plan 039.
 */
async function hostedFinishedGames(
  tx: DbTransaction,
  userId: string,
  cursor: ReplayCursor
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(
      and(
        eq(games.hostId, userId),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        upToCursor(cursor)
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * The seals this player already owns. One primary-key-prefix lookup that saves
 * every query feeding a seal they cannot earn again — plan 039 § Architecture
 * decision 4. Semantically transparent: a held seal can never be inserted twice
 * (ON CONFLICT DO NOTHING), so its detector verdict was already discarded.
 */
async function heldSeals(tx: DbTransaction, userId: string): Promise<Set<string>> {
  const rows = await tx.select({ sealId: seals.sealId }).from(seals).where(eq(seals.userId, userId))
  return new Set(rows.map((row) => row.sealId))
}

/** `games.host_id` of the game being processed — the « Chef de camp » input. */
async function gameHostId(tx: DbTransaction, gameId: string): Promise<string | null> {
  const [row] = await tx
    .select({ hostId: games.hostId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
  return row?.hostId ?? null
}

/**
 * Detects and persists the hauts faits unlocked by a finished game.
 * Idempotent: the (user_id, seal_id) primary key plus ON CONFLICT DO NOTHING
 * mean re-running this over an already-processed game inserts nothing and
 * returns an empty map — which is what makes the backfill safe to re-run.
 *
 * Runs inside the finalize transaction, AFTER `games` has been stamped with
 * outcome/winner/ended_at, so the career queries below already count this game
 * — and, thanks to the replay cursor, count NOTHING after it. Live that is the
 * same thing (the finalized game is the most recent one); in the backfill it is
 * the difference between replaying history and re-reading today's totals for
 * every past game.
 *
 * Cost (plan 039 § Architecture decision 4): two queries per game plus one per
 * seat, plus one per query that feeds a seal the player is still MISSING. A
 * veteran who owns the whole board costs exactly one query.
 *
 * Returns the rows actually inserted, keyed by user id: the « newly earned »
 * diff. Clients do not consume it (they read `seals` by game id over HTTP);
 * it exists for tests and logging.
 */
export async function awardSeals(
  tx: DbTransaction,
  gameId: string,
  state: GameState
): Promise<Map<string, SealId[]>> {
  const newlyEarned = new Map<string, SealId[]>()
  const cursor = await replayCursor(tx, gameId)
  const hostId = await gameHostId(tx, gameId)
  const durationMs =
    cursor.startedAt === null ? null : cursor.endedAt.getTime() - cursor.startedAt.getTime()
  // One aggregate per (circle, month) per game: the champion month and a
  // player's last active month are very often the same month.
  const monthCache = new Map<string, MonthAggregate>()
  const cachedAggregate = async (
    memberIds: string[],
    monthKey: string
  ): Promise<MonthAggregate> => {
    const key = `${[...memberIds].sort().join(',')}|${monthKey}`
    const cached = monthCache.get(key)
    if (cached !== undefined) return cached
    const aggregate = await monthAggregate(tx, memberIds, monthKey, cursor)
    monthCache.set(key, aggregate)
    return aggregate
  }

  // Sequential on purpose: these share one transaction connection, and the game
  // manager already serializes commands per game, so there is no throughput to
  // win and a concurrent-statement error to avoid.
  for (const userId of state.seats) {
    const held = await heldSeals(tx, userId)
    if (SEAL_IDS.every((sealId) => held.has(sealId))) continue
    const needs = (...ids: SealId[]): boolean => ids.some((id) => !held.has(id))

    const wins = needs('first_win', 'decurion') ? await careerWins(tx, userId, cursor) : 0
    const streak = needs('rising_tide') ? await currentStreak(tx, userId, cursor) : 0
    const dealt = needs('centurion') ? await careerDegommages(tx, userId, cursor) : 0
    const characterWins = needs('collector') ? await careerCharacterWins(tx, userId, cursor) : 0
    const hosted = needs('camp_chief') ? await hostedFinishedGames(tx, userId, cursor) : 0

    let circle: string[] | null = null
    const memberIdsOf = async (): Promise<string[]> => {
      circle ??= await circleMemberIds(tx, userId)
      return circle
    }

    let reigningChampionId: string | null = null
    if (needs('champion_slayer')) {
      const memberIds = await memberIdsOf()
      const championMonth = await lastCompletedChampionMonth(tx, memberIds, cursor)
      const top =
        championMonth === null
          ? undefined
          : (await cachedAggregate(memberIds, championMonth)).ranked[0]
      if (top !== undefined && top.wins >= 1) reigningChampionId = top.userId
    }

    let lastCompletedMonth: MonthRecord | null = null
    if (needs('unbeaten', 'golden_boar')) {
      const memberIds = await memberIdsOf()
      const monthKey = await lastCompletedActiveMonth(tx, userId, cursor)
      const aggregate = monthKey === null ? undefined : await cachedAggregate(memberIds, monthKey)
      const own = aggregate?.byUser.get(userId)
      if (aggregate !== undefined && own !== undefined) {
        lastCompletedMonth = {
          villageGames: own.villageGames,
          wins: own.wins,
          degommages: own.degommages,
          isTopDegommeur: aggregate.topDegommeurId === userId,
          rankedPlayers: aggregate.ranked.length,
        }
      }
    }

    const detected = detectSeals({
      userId,
      state,
      careerWins: wins,
      currentStreak: streak,
      durationMs,
      careerDegommages: dealt,
      careerCharacterWins: characterWins,
      hostedFinishedGames: hosted,
      isHost: hostId === userId,
      reigningChampionId,
      lastCompletedMonth,
    })
    if (detected.length === 0) continue
    const inserted = await tx
      .insert(seals)
      .values(detected.map((sealId) => ({ userId, sealId, gameId })))
      .onConflictDoNothing({ target: [seals.userId, seals.sealId] })
      .returning({ sealId: seals.sealId })
    if (inserted.length > 0) {
      newlyEarned.set(
        userId,
        inserted.map((row) => row.sealId as SealId)
      )
    }
  }
  return newlyEarned
}
