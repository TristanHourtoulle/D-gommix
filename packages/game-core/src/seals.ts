import type { GameState } from './types'

/**
 * The six one-time hauts faits. Ids are English and are the storage key of
 * `seals.seal_id` (packages/db/src/schema/seals.ts); the French names live in
 * apps/web/src/lib/seals.ts, next to the artwork, exactly like the avatar
 * catalog splits ids (allowlist) from labels (UI).
 *
 * Order is the display order of the profile board.
 */
export const SEAL_IDS = [
  'imperator',
  'village_tour',
  'first_win',
  'decurion',
  'rising_tide',
  'arvern_shield',
] as const

export type SealId = (typeof SEAL_IDS)[number]

const SEAL_ID_SET: ReadonlySet<string> = new Set(SEAL_IDS)

export function isSealId(value: unknown): value is SealId {
  return typeof value === 'string' && SEAL_ID_SET.has(value)
}

/** Wins required by « Décurion ». */
export const DECURION_WINS = 10

/** Consecutive wins required by « Marée montante ». */
export const RISING_TIDE_STREAK = 3

/**
 * Seats required by « Tour du village ». In a 1v1 the "every opponent" set has
 * one member, so the seal would fire on the player's first ever tap. Guard
 * invented by plan 033 — pending owner review.
 */
export const VILLAGE_TOUR_MIN_SEATS = 3

/**
 * Total non-undone degommages a game must contain before « Bouclier arverne »
 * can be earned in it. Without it a quiet game hands the seal to three players
 * at once. 4 ≈ « at least one degommage per seat in a 4-player game ». Guard
 * invented by plan 033 — pending owner review.
 */
export const ARVERN_SHIELD_MIN_GAME_DEGOMMAGES = 4

export interface SealDetectionInput {
  readonly userId: string
  /** MUST be a finished state (status === 'finished'). */
  readonly state: GameState
  /**
   * All-time village_reached wins for this user, INCLUDING the game in
   * `state`. Supplied by the caller because it is cross-game.
   */
  readonly careerWins: number
  /**
   * Consecutive village_reached wins ending with the game in `state`, newest
   * first. Aborted games are neutral (same rule as
   * apps/web/src/lib/queries/streaks.ts). Capped by the caller is fine.
   */
  readonly currentStreak: number
}

/**
 * Seals whose condition holds for `userId` after this game. Threshold
 * semantics, not transition semantics: `first_win` is emitted on EVERY win, not
 * only the first. The one-time-ness is enforced by the storage layer's
 * (user_id, seal_id) primary key + ON CONFLICT DO NOTHING, which makes the
 * whole pipeline idempotent and replay-order-tolerant — see
 * apps/ws-server/src/seals.ts.
 *
 * Returns ids in SEAL_IDS order. Never throws; an unfinished or unknown-user
 * state yields [].
 */
export function detectSeals(input: SealDetectionInput): SealId[] {
  const { userId, state, careerWins, currentStreak } = input
  const player = state.players[userId]
  if (state.status !== 'finished' || player === undefined) return []

  // Mirror of apps/web/src/lib/rivalries.ts:takenByTarget — a DEGOMMAGE counts
  // unless an UNDO in the same game cancelled its seq. Self-degommages are
  // ignored, exactly like aggregatePairCounts does.
  const live = state.degommageLog.filter(
    (entry) => !state.undoneSeqs.has(entry.seq) && entry.actorId !== entry.targetId
  )
  const takenCount = live.filter((entry) => entry.targetId === userId).length
  const isWinner = state.winnerId === userId
  const isVillage = state.outcome === 'village_reached'

  const hitByThisPlayer = new Set(
    live.filter((entry) => entry.actorId === userId).map((entry) => entry.targetId)
  )
  const opponents = state.seats.filter((seatId) => seatId !== userId)
  const hitEveryOpponent =
    state.seats.length >= VILLAGE_TOUR_MIN_SEATS &&
    opponents.length > 0 &&
    opponents.every((opponentId) => hitByThisPlayer.has(opponentId))

  const earned: SealId[] = []
  for (const sealId of SEAL_IDS) {
    switch (sealId) {
      case 'imperator':
        if (isVillage && isWinner && takenCount === 0) earned.push(sealId)
        break
      case 'village_tour':
        if (hitEveryOpponent) earned.push(sealId)
        break
      case 'first_win':
        if (isWinner && careerWins >= 1) earned.push(sealId)
        break
      case 'decurion':
        if (isWinner && careerWins >= DECURION_WINS) earned.push(sealId)
        break
      case 'rising_tide':
        if (isWinner && currentStreak >= RISING_TIDE_STREAK) earned.push(sealId)
        break
      case 'arvern_shield':
        if (
          isVillage &&
          !isWinner &&
          player.inGame &&
          takenCount === 0 &&
          live.length >= ARVERN_SHIELD_MIN_GAME_DEGOMMAGES
        ) {
          earned.push(sealId)
        }
        break
    }
  }
  return earned
}
