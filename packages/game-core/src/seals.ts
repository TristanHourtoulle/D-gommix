import { CHARACTERS, type GameState } from './types'

/**
 * The sixteen one-time hauts faits. Ids are English and are the storage key of
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
  // Plan 039 — second wave. Appended, never inserted: SEAL_IDS order is the
  // profile board's reading order and the shipped six keep their places.
  'menhir',
  'toutatis_bolt',
  'marathon',
  'champion_slayer',
  'collector',
  'centurion',
  'avenger',
  'camp_chief',
  'unbeaten',
  'golden_boar',
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

/** Dégommages a player must absorb in one game for « Le Menhir ». */
export const MENHIR_MIN_TAKEN = 10

/** Upper bound of « L’Éclair de Toutatis », in milliseconds. */
export const TOUTATIS_BOLT_MAX_MS = 5 * 60_000

/** Lower bound of « Le Marathonien », in milliseconds. */
export const MARATHON_MIN_MS = 45 * 60_000

/** Distinct characters a player must have won with for « Le Collectionneur ». */
export const COLLECTOR_CHARACTERS = CHARACTERS.length

/** Career dégommages dealt, net of undos, required by « Centurion ». */
export const CENTURION_DEGOMMAGES = 100

/** Printed « Vengeance ! » stamps in one game required by « Le Vengeur ». */
export const AVENGER_VENGEANCES = 3

/** Games hosted to their village end required by « Chef de camp émérite ». */
export const CAMP_CHIEF_HOSTED_GAMES = 10

/** Village games a month must contain before « L’Invaincu » can be claimed. */
export const UNBEATEN_MIN_VILLAGE_GAMES = 3

/**
 * Ranked players a month must have before « Le Sanglier d’or » is awarded. A
 * player with no friends is a circle of one and would top every month for free.
 * Guard invented by plan 039 — pending owner review.
 */
export const GOLDEN_BOAR_MIN_RANKED = 2

/**
 * Copy of CARNAGE_THRESHOLD from apps/web/src/lib/game-stamps.ts. A hit that is
 * both a vengeance and the actor's fourth surviving dégommage prints as
 * « Carnage » (LINE_STAMP_PRIORITY puts carnage first), so the table never sees
 * a « Vengeance ! » there and « Le Vengeur » must not count it. Pinned by the
 * parity test in apps/web/src/lib/game-stamps.test.ts — if that test goes red,
 * the two rules have drifted and BOTH must be fixed.
 */
export const CARNAGE_MASK_THRESHOLD = 4

/**
 * Printed « Vengeance ! » stamps per actor in one game — the count « Le
 * Vengeur » is about. Reimplements the rule of
 * apps/web/src/lib/game-stamps.ts (game-core cannot import from apps/web, and
 * moving that module would drag a raw-row event shape and six consumers with
 * it; see plan 039 § Architecture decision 1). Two halves, both load-bearing:
 *
 * 1. a hit avenges its predecessor when the two swap actor and target;
 * 2. a hit that is the actor's CARNAGE_MASK_THRESHOLD-th surviving dégommage
 *    prints as « Carnage » instead and does NOT count.
 */
export function countVengeancesByActor(
  state: Pick<GameState, 'degommageLog' | 'undoneSeqs'>
): Map<string, number> {
  const hits = state.degommageLog
    .filter((entry) => !state.undoneSeqs.has(entry.seq) && entry.actorId !== entry.targetId)
    .slice()
    .sort((a, b) => a.seq - b.seq)

  const dealt = new Map<string, number>()
  const vengeances = new Map<string, number>()
  for (const [index, hit] of hits.entries()) {
    const total = (dealt.get(hit.actorId) ?? 0) + 1
    dealt.set(hit.actorId, total)
    const previous = index > 0 ? hits[index - 1] : undefined
    if (previous === undefined) continue
    if (total === CARNAGE_MASK_THRESHOLD) continue
    if (previous.actorId === hit.targetId && previous.targetId === hit.actorId) {
      vengeances.set(hit.actorId, (vengeances.get(hit.actorId) ?? 0) + 1)
    }
  }
  return vengeances
}

/**
 * One Paris month of a player's record, aggregated inside their own circle.
 * Supplied by the caller (apps/ws-server/src/month-standings.ts) because no
 * single game's state can know it.
 */
export interface MonthRecord {
  /** village_reached games the player took part in that month. */
  readonly villageGames: number
  /** Of those, the ones they won. */
  readonly wins: number
  /** Dégommages dealt that month (aborted games included, design §5.3). */
  readonly degommages: number
  /** True when the player is the strict, unique top dégommeur of that month. */
  readonly isTopDegommeur: boolean
  /** Players ranked that month — the GOLDEN_BOAR_MIN_RANKED denominator. */
  readonly rankedPlayers: number
}

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
  /**
   * `ended_at - started_at` of this game, in milliseconds. Null when either
   * timestamp is missing — the state carries no clock, so the caller reads it
   * from `games`.
   */
  readonly durationMs: number | null
  /** Career dégommages dealt, net of undos, INCLUDING this game. */
  readonly careerDegommages: number
  /** Distinct characters this player has ever won a village game with. */
  readonly careerCharacterWins: number
  /** Village games this player hosted to their end, INCLUDING this one. */
  readonly hostedFinishedGames: number
  /** Whether this player is `games.host_id` of the game being processed. */
  readonly isHost: boolean
  /**
   * The reigning « champion du mois » of this player's circle at the time of
   * this game, or null when no completed month has a champion yet.
   */
  readonly reigningChampionId: string | null
  /**
   * This player's most recent COMPLETED Paris month with activity, aggregated
   * in their circle; null when they have none. See plan 039 § Architecture
   * decision 3 for why it is "their last active month" and not "last month".
   */
  readonly lastCompletedMonth: MonthRecord | null
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

  const dealtCount = live.filter((entry) => entry.actorId === userId).length
  const vengeances = countVengeancesByActor(state).get(userId) ?? 0
  const month = input.lastCompletedMonth

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
      case 'menhir':
        // village_reached guard invented by plan 039: « la finir » is reaching
        // the village, not abandoning right after the tenth hit.
        if (isVillage && player.inGame && takenCount >= MENHIR_MIN_TAKEN) earned.push(sealId)
        break
      case 'toutatis_bolt':
        if (
          isVillage &&
          isWinner &&
          input.durationMs !== null &&
          input.durationMs < TOUTATIS_BOLT_MAX_MS
        ) {
          earned.push(sealId)
        }
        break
      case 'marathon':
        if (
          isVillage &&
          isWinner &&
          input.durationMs !== null &&
          input.durationMs > MARATHON_MIN_MS
        ) {
          earned.push(sealId)
        }
        break
      case 'champion_slayer':
        if (
          isVillage &&
          isWinner &&
          input.reigningChampionId !== null &&
          input.reigningChampionId !== userId &&
          state.seats.includes(input.reigningChampionId)
        ) {
          earned.push(sealId)
        }
        break
      case 'collector':
        if (isWinner && input.careerCharacterWins >= COLLECTOR_CHARACTERS) earned.push(sealId)
        break
      case 'centurion':
        // dealtCount >= 1 keeps the row pointing at a game this player actually
        // played a part in — same provenance rule as `decurion` (plan 033).
        if (dealtCount >= 1 && input.careerDegommages >= CENTURION_DEGOMMAGES) earned.push(sealId)
        break
      case 'avenger':
        if (vengeances >= AVENGER_VENGEANCES) earned.push(sealId)
        break
      case 'camp_chief':
        if (input.isHost && input.hostedFinishedGames >= CAMP_CHIEF_HOSTED_GAMES) {
          earned.push(sealId)
        }
        break
      case 'unbeaten':
        if (
          month !== null &&
          month.villageGames >= UNBEATEN_MIN_VILLAGE_GAMES &&
          month.wins === month.villageGames
        ) {
          earned.push(sealId)
        }
        break
      case 'golden_boar':
        if (
          month !== null &&
          month.isTopDegommeur &&
          month.degommages > 0 &&
          month.rankedPlayers >= GOLDEN_BOAR_MIN_RANKED
        ) {
          earned.push(sealId)
        }
        break
    }
  }
  return earned
}
