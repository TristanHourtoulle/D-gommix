import type { CharacterId } from '@degommix/game-core'
import { buildPerCharacter, type CharacterStatRow } from './character-stats'
import { aggregateTakenCounts, type RivalryEventRow } from './rivalries'

/**
 * « L'Almanach » — the absurd-unit statistics of the village. Pure and db-free
 * on purpose: `apps/web/vitest.config.ts` runs unit tests with no database and
 * no env vars, and every conversion and guard below has to be unit-testable.
 *
 * House rule: the comedy is in the UNIT and the REGISTER, never in the
 * arithmetic. Every figure here is arithmetic on real persisted rows, and the
 * page prints each derivation next to its figure.
 */

/* ---------- Conversion constants (« calculs homologués par le druide ») ---------- */

/**
 * Owner-validated: a dégommage sends the pion back 38 pas gaulois. Not
 * negotiable, not derived from anything — the druid measured it once.
 */
export const PAS_PER_DEGOMMAGE = 38

/**
 * A « pas gaulois » in metres. The Roman *gradus* is ~0.74 m; a Gaul walks a
 * little wider, so 0.75 m — and it keeps the arithmetic honest to two digits.
 */
export const METERS_PER_PAS = 0.75

/**
 * A menhir laid on its side, in metres. The Carnac alignments run from 1 m to
 * over 6 m; 4 m is Obélix's delivery standard and the figure this app quotes.
 */
export const METERS_PER_MENHIR = 4

/**
 * Minimum game duration for the « Rythme du carnage » record, in seconds. Two
 * minutes: below that the divisor is so small that a single tap in a
 * mis-started game (3 s, 1 dégommage) would score 20 dégommages/min and hold
 * the record forever. The guard makes the record about a real table.
 */
export const CARNAGE_MIN_DURATION_SEC = 120

/**
 * Minimum seated games before a player appears in « Fidélité au camp ».
 * Below 3, everyone who played twice with Astérix is « 100 % fidèle ».
 */
export const FIDELITY_MIN_SEATS = 3

/**
 * Minimum dégommages suffered before a player appears in « Indice de mauvaise
 * foi ». Below 5, one undo over one lost pion reads as 100 % bad faith.
 */
export const BAD_FAITH_MIN_TAKEN = 5

/* ---------- Formatting ---------- */

const frenchNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const frenchDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** "1 247" — French grouping (the separator is a narrow no-break space). */
export function formatFrenchNumber(value: number): string {
  return frenchNumber.format(value)
}

/** "3,3" — one decimal, French comma. Used for dégommages per minute. */
export function formatFrenchDecimal(value: number): string {
  return frenchDecimal.format(value)
}

/**
 * Long-form duration for a figure that can run into days of table time:
 * "2 h 15 min", "30 min", "moins d'une minute". `formatDurationProse`
 * (components/stats/format.ts) is per-game and would print "2 400 min" here.
 */
export function formatTableTime(seconds: number): string {
  if (seconds <= 0) return '0 min'
  if (seconds < 60) return 'moins d’une minute'
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${formatFrenchNumber(minutes)} min`
  return minutes === 0
    ? `${formatFrenchNumber(hours)} h`
    : `${formatFrenchNumber(hours)} h ${minutes} min`
}

/* ---------- 1. Distance de pions renvoyés ---------- */

export interface DistanceStat {
  degommages: number
  pas: number
  meters: number
  /** Rounded to the nearest whole menhir — half a menhir is just a rock. */
  menhirs: number
}

/**
 * Total distance the village's pions travelled backwards, in menhirs.
 * `degommages × 38 pas × 0,75 m ÷ 4 m` — i.e. 7,125 menhirs per dégommage.
 * Null below one dégommage: an Almanach entry needs something to homologate.
 */
export function computeDistance(degommages: number): DistanceStat | null {
  if (degommages <= 0) return null
  const pas = degommages * PAS_PER_DEGOMMAGE
  const meters = pas * METERS_PER_PAS
  return { degommages, pas, meters, menhirs: Math.round(meters / METERS_PER_MENHIR) }
}

/* ---------- 3. Rythme du carnage ---------- */

/** One finished, non-zombie circle game with its table-wide dégommage total. */
export interface CarnageRow {
  gameId: string
  durationSec: number
  degommages: number
}

export interface CarnageRecord extends CarnageRow {
  /** Dégommages per minute, unrounded — format at render. */
  perMinute: number
}

/**
 * Peak dégommages-per-minute over one game. Games shorter than
 * `minDurationSec` and games with no dégommage are ineligible (see the
 * constant's comment). Ties go to the bigger carton, then to the smaller
 * gameId, so the record is stable whatever order the rows arrived in.
 */
export function pickCarnageRecord(
  rows: readonly CarnageRow[],
  minDurationSec: number = CARNAGE_MIN_DURATION_SEC
): CarnageRecord | null {
  let best: CarnageRecord | null = null
  for (const row of rows) {
    if (row.durationSec < minDurationSec || row.degommages <= 0) continue
    const perMinute = row.degommages / (row.durationSec / 60)
    const beats =
      best === null ||
      perMinute > best.perMinute ||
      (perMinute === best.perMinute &&
        (row.degommages > best.degommages ||
          (row.degommages === best.degommages && row.gameId < best.gameId)))
    if (beats) best = { ...row, perMinute }
  }
  return best
}

/* ---------- 4. Fidélité au camp ---------- */

export interface FidelityRow {
  userId: string
  username: string
  character: CharacterId
  /** Games seated with the fetish character. */
  played: number
  /** Games seated with any character. */
  totalPlayed: number
  /** Percentage 0-100, rounded. */
  share: number
}

/**
 * Each circle member's attachment to their « personnage fétiche »: the share
 * of their seated games spent in that camp. The fetish character is
 * `buildPerCharacter`'s first entry (most played, ties by most recently
 * played) — the same definition the Lauriers use, so the two can never
 * disagree. Players under `minSeats` seated games are left out (small-sample
 * guard). Sorted by share desc, then games played desc, then username (fr).
 */
export function computeFidelity(
  rows: readonly CharacterStatRow[],
  usernames: ReadonlyMap<string, string>,
  minSeats: number = FIDELITY_MIN_SEATS
): FidelityRow[] {
  const result: FidelityRow[] = []
  for (const [userId, stats] of buildPerCharacter(rows)) {
    const favorite = stats[0]
    if (favorite === undefined) continue
    const totalPlayed = stats.reduce((sum, stat) => sum + stat.played, 0)
    if (totalPlayed < minSeats) continue
    result.push({
      userId,
      username: usernames.get(userId) ?? 'Inconnu',
      character: favorite.character,
      played: favorite.played,
      totalPlayed,
      share: Math.round((favorite.played / totalPlayed) * 100),
    })
  }
  result.sort(
    (a, b) =>
      b.share - a.share ||
      b.totalPlayed - a.totalPlayed ||
      a.username.localeCompare(b.username, 'fr')
  )
  return result
}

/* ---------- 5. Indice de mauvaise foi ---------- */

export interface BadFaithRow {
  userId: string
  username: string
  /** UNDO events this player requested. */
  undos: number
  /** Non-undone dégommages this player suffered. */
  taken: number
  /** Percentage, rounded: undos ÷ taken × 100. Can exceed 100. */
  index: number
}

/**
 * « Indice de mauvaise foi »: undos requested per pion actually lost. Any
 * player at the table may undo the last dégommage (game-core validate.ts —
 * the undo is not restricted to whoever dealt the hit), so an UNDO's `actorId`
 * is the requester, which is exactly the numerator we want. « Dégommages
 * subis » goes through `aggregateTakenCounts` so undone hits are cancelled the
 * same way the reducer cancels them. Players under `minTaken` suffered hits
 * are left out; so is anyone outside the circle. Sorted by index desc, then
 * undos desc, then username (fr).
 */
export function computeBadFaith(
  events: readonly RivalryEventRow[],
  memberIds: readonly string[],
  usernames: ReadonlyMap<string, string>,
  minTaken: number = BAD_FAITH_MIN_TAKEN
): BadFaithRow[] {
  const circle = new Set(memberIds)
  const undos = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'UNDO') continue
    const { actorId } = event
    if (actorId === null || !circle.has(actorId)) continue
    undos.set(actorId, (undos.get(actorId) ?? 0) + 1)
  }

  const taken = aggregateTakenCounts(events)
  const result: BadFaithRow[] = []
  for (const [userId, takenCount] of taken) {
    if (!circle.has(userId) || takenCount < minTaken) continue
    const undoCount = undos.get(userId) ?? 0
    result.push({
      userId,
      username: usernames.get(userId) ?? 'Inconnu',
      undos: undoCount,
      taken: takenCount,
      index: Math.round((undoCount / takenCount) * 100),
    })
  }
  result.sort(
    (a, b) => b.index - a.index || b.undos - a.undos || a.username.localeCompare(b.username, 'fr')
  )
  return result
}
