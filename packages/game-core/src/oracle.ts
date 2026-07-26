import type { GameState } from './types'

/**
 * « L'Oracle du village » (plan 040): the scoring half of the optional
 * pre-game prediction. Everything here is a pure function of a FINISHED
 * GameState plus the raw picks — nothing is persisted beyond the picks
 * themselves (packages/db/src/schema/oracle.ts), so retuning the point values
 * below retro-scores the whole history with no migration and no backfill.
 */

/** Points for naming the exact winner. Owner-validated. */
export const ORACLE_WINNER_POINTS = 2
/** Points for naming the souffre-douleur of the game. Owner-validated. */
export const ORACLE_SOUFFRE_DOULEUR_POINTS = 1
/**
 * Hits a player must have taken before they can BE the souffre-douleur.
 * Deliberately 1, not the Gazette's MIN_SOUFFRE = 2
 * (apps/web/src/lib/gazette/facts.ts): that threshold exists to keep a
 * HEADLINE from being noise, while this one settles a BET, and a quiet game
 * would otherwise make the point unwinnable. Invented by plan 040 — pending
 * owner review. If one of the two definitions ever changes, decide consciously
 * whether the other should follow.
 */
export const ORACLE_SOUFFRE_MIN_HITS = 1

/** What a game actually produced; both fields may be null. */
export interface OracleOutcome {
  readonly winnerId: string | null
  readonly souffreDouleurId: string | null
}

/** One player's prediction. The winner is required, the souffre-douleur is not. */
export interface OraclePick {
  readonly userId: string
  readonly predictedWinnerId: string
  readonly predictedSouffreDouleurId: string | null
}

export interface OracleScore extends OraclePick {
  readonly winnerHit: boolean
  readonly souffreDouleurHit: boolean
  readonly points: number
}

/**
 * Non-undone dégommages taken per player; self-hits excluded.
 *
 * The self-hit filter mirrors `aggregateTakenByGame`
 * (apps/web/src/lib/rivalries.ts) rather than its in-game twin
 * `takenByTarget`, because the server-side path aggregates from game_events
 * rows through the former: the two surfaces must not disagree on a self-hit
 * game.
 */
export function takenCounts(
  state: Pick<GameState, 'degommageLog' | 'undoneSeqs'>
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of state.degommageLog) {
    if (state.undoneSeqs.has(entry.seq)) continue
    if (entry.actorId === entry.targetId) continue
    counts[entry.targetId] = (counts[entry.targetId] ?? 0) + 1
  }
  return counts
}

/**
 * The player strictly ahead on hits taken, or null. A tie is NOT a
 * souffre-douleur and neither is an untouched table: in both cases nobody wins
 * that point. Accepts a plain count record so the server-side path
 * (aggregated from game_events rows) and the client-side path (aggregated from
 * a live GameState) resolve identically.
 */
export function resolveSouffreDouleurId(taken: Readonly<Record<string, number>>): string | null {
  let best: string | null = null
  let bestCount = 0
  let tied = false
  for (const userId of Object.keys(taken).sort()) {
    const count = taken[userId] ?? 0
    if (best === null || count > bestCount) {
      best = userId
      bestCount = count
      tied = false
    } else if (count === bestCount) {
      tied = true
    }
  }
  if (best === null || tied) return null
  if (bestCount < ORACLE_SOUFFRE_MIN_HITS) return null
  return best
}

/** Outcome of a finished game. Returns nulls for an unfinished state. */
export function resolveOracleOutcome(state: GameState): OracleOutcome {
  if (state.status !== 'finished') return { winnerId: null, souffreDouleurId: null }
  return {
    winnerId: state.winnerId,
    souffreDouleurId: resolveSouffreDouleurId(takenCounts(state)),
  }
}

/** Scores one pick. Never throws; a null side of the outcome simply never hits. */
export function scoreOraclePick(pick: OraclePick, outcome: OracleOutcome): OracleScore {
  const winnerHit = outcome.winnerId !== null && pick.predictedWinnerId === outcome.winnerId
  const souffreDouleurHit =
    outcome.souffreDouleurId !== null &&
    pick.predictedSouffreDouleurId === outcome.souffreDouleurId
  return {
    ...pick,
    winnerHit,
    souffreDouleurHit,
    points:
      (winnerHit ? ORACLE_WINNER_POINTS : 0) +
      (souffreDouleurHit ? ORACLE_SOUFFRE_DOULEUR_POINTS : 0),
  }
}

/** Scores every pick, sorted points desc then userId asc (stable across engines). */
export function scoreOraclePicks(
  picks: readonly OraclePick[],
  outcome: OracleOutcome
): OracleScore[] {
  return picks
    .map((pick) => scoreOraclePick(pick, outcome))
    .sort(
      (a, b) =>
        b.points - a.points || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
    )
}
