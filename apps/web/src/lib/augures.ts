/**
 * « Tableau des augures » — the live reading of a game in progress.
 *
 * Pure and db-free on purpose, like `./rivalries.ts` and `./game-stamps.ts`:
 * everything here is derived from the replicated `GameState` plus the
 * server-anchored chrono. No request, no realtime message, no stored row — the
 * panel must open instantly on a phone with a flaky connection in the middle of
 * a game, and must never add load to the ws-server while four people are
 * tapping (`plans/041-tableau-des-augures.md`).
 */

import type { CharacterId, GameState } from '@degommix/game-core'
import { CARNAGE_MIN_DURATION_SEC } from './almanach'
import { actorRuns } from './game-stamps'
import { takenByTarget } from './rivalries'

/**
 * Dégommages the druid considers a « partie type ». NOT a rule of the game —
 * Dégommix has no score threshold, a game ends when a human declares the
 * village reached — but the panel has to extrapolate against something, so it
 * extrapolates against a number it prints in full next to the figure (see
 * `plans/041-tableau-des-augures.md` § Decision 3). Retune freely: nothing
 * else in the app reads it.
 */
export const AUGURES_TARGET_DEGOMMAGES = 20

/**
 * Elapsed seconds before a rate is worth stating. Deliberately the Almanach's
 * own guard (`CARNAGE_MIN_DURATION_SEC`, 120 s) so the live figure and the
 * all-time « Rythme du carnage » record can never disagree about what counts.
 */
export const AUGURES_MIN_ELAPSED_SEC = CARNAGE_MIN_DURATION_SEC

/** The slice of `GameState` the panel is allowed to read. */
export type AuguresState = Pick<GameState, 'players' | 'seats' | 'degommageLog' | 'undoneSeqs'>

/** Dégommages dealt and suffered by one seated player. */
export interface AuguresTally {
  readonly userId: string
  readonly character: CharacterId
  /** Non-undone dégommages dealt — straight from the reducer. */
  readonly dealt: number
  /** Non-undone dégommages suffered. */
  readonly taken: number
}

/** The current streak leader. `isOngoing` when the streak is still the last one. */
export interface AuguresRun {
  readonly actorId: string
  readonly length: number
  readonly isOngoing: boolean
}

/** Naive extrapolation of what is left, against `AUGURES_TARGET_DEGOMMAGES`. */
export interface AuguresProjection {
  readonly remainingDegommages: number
  readonly remainingSec: number
  readonly totalSec: number
}

export interface Augures {
  /** Non-undone dégommages of the whole table. */
  readonly totalDegommages: number
  readonly elapsedSec: number
  /** Dégommages per minute, unrounded. `null` below the guard or with 0 hits. */
  readonly ratePerMinute: number | null
  /** Whose pions suffer the most, STRICT max. `null` on a tie or on 0 hits. */
  readonly punchingBagId: string | null
  /** Longest streak of the game, `null` below 2. */
  readonly bestRun: AuguresRun | null
  /** `null` below the guard, or once the target is already reached. */
  readonly projection: AuguresProjection | null
  /** One row per seat, dealt desc → taken desc → userId asc. */
  readonly tallies: readonly AuguresTally[]
}

/**
 * The player whose pions suffer the most, on a STRICT maximum. A tie returns
 * `null` because the claim « souffre-douleur » would be false about either of
 * them — the same discipline `detectSummaryStamp` applies to « Remontada ».
 */
function strictWorstSufferer(taken: Readonly<Record<string, number>>): string | null {
  let worstId: string | null = null
  let worstCount = 0
  let isTied = false
  for (const [userId, count] of Object.entries(taken)) {
    if (count > worstCount) {
      worstId = userId
      worstCount = count
      isTied = false
      continue
    }
    if (count === worstCount) isTied = true
  }
  if (worstId === null || worstCount === 0 || isTied) return null
  return worstId
}

/** The longest streak of the game; ties go to the LATER run. */
function readBestRun(state: AuguresState): AuguresRun | null {
  // GameState twin of `survivingHits` in ./game-stamps.ts. It cannot call that
  // one: `StampEvent` requires a timestamp per hit (« Sans pitié » is
  // time-windowed) and `DegommageEntry` has none. The run logic itself IS
  // shared — see `actorRuns`. `augures.test.ts` pins the two paths together.
  const surviving = state.degommageLog.filter(
    (entry) => !state.undoneSeqs.has(entry.seq) && entry.actorId !== entry.targetId
  )
  const runs = actorRuns(surviving)
  let bestIndex = -1
  let bestLength = 0
  runs.forEach((run, index) => {
    // `>=`, not `>`: on a tie the later run wins, so the reading favors what is
    // happening now rather than what happened ten minutes ago.
    if (run.seqs.length >= bestLength) {
      bestIndex = index
      bestLength = run.seqs.length
    }
  })
  if (bestIndex === -1 || bestLength < 2) return null
  const best = runs[bestIndex]
  if (best === undefined) return null
  return { actorId: best.actorId, length: bestLength, isOngoing: bestIndex === runs.length - 1 }
}

/** One row per seat the reducer actually knows, sorted for the panel. */
function readTallies(state: AuguresState, taken: Readonly<Record<string, number>>): AuguresTally[] {
  const tallies: AuguresTally[] = []
  for (const userId of state.seats) {
    const player = state.players[userId]
    // A seat with no player state is skipped, never faked with zeros.
    if (player === undefined) continue
    tallies.push({
      userId,
      character: player.character,
      dealt: player.degommages,
      taken: taken[userId] ?? 0,
    })
  }
  return tallies.sort(
    (left, right) =>
      right.dealt - left.dealt ||
      right.taken - left.taken ||
      left.userId.localeCompare(right.userId)
  )
}

/**
 * The live reading of a game in progress. Pure: same state + same elapsed time
 * → same result, forever, on every device. Derives EVERYTHING from the
 * replicated `GameState` plus the server-anchored chrono — no request, no
 * storage, no side effect (`plans/041-tableau-des-augures.md`).
 */
export function readAugures(state: AuguresState, elapsedSec: number): Augures {
  // A skewed or still-warming clock must not leak a negative or fractional
  // second into a printed figure.
  const elapsed = Math.max(0, Math.floor(elapsedSec))
  // Straight from the reducer, which already excludes undone dégommages. The
  // panel never recounts the log.
  const totalDegommages = Object.values(state.players).reduce(
    (sum, player) => sum + player.degommages,
    0
  )
  const taken = takenByTarget(state)

  const ratePerMinute =
    elapsed < AUGURES_MIN_ELAPSED_SEC || totalDegommages === 0
      ? null
      : totalDegommages / (elapsed / 60)

  let projection: AuguresProjection | null = null
  if (ratePerMinute !== null && totalDegommages < AUGURES_TARGET_DEGOMMAGES) {
    const remainingDegommages = AUGURES_TARGET_DEGOMMAGES - totalDegommages
    const remainingSec = Math.round((remainingDegommages / ratePerMinute) * 60)
    projection = { remainingDegommages, remainingSec, totalSec: elapsed + remainingSec }
  }

  return {
    totalDegommages,
    elapsedSec: elapsed,
    ratePerMinute,
    punchingBagId: strictWorstSufferer(taken),
    bestRun: readBestRun(state),
    projection,
    tallies: readTallies(state, taken),
  }
}
