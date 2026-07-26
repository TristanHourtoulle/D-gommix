import type { GameOutcome } from '@degommix/game-core'
import type { GameAbortReason, RawEvent } from '@/lib/queries/game-detail-journal'

/**
 * Everything the « Gazette du Village » is allowed to say about a finished
 * game, derived from the persisted event log and nothing else. Kept db-free so
 * it is unit-testable (apps/web/vitest.config.ts runs with no database and no
 * env vars), exactly like ../queries/game-detail-journal.ts.
 *
 * The single rule of this module: a fact is either PROVEN by the log (present)
 * or ABSENT (null / empty). It is never guessed, never rounded up, never
 * inferred from a plausible-looking shape. The renderer skips every template
 * whose facts are absent — see ./render.ts.
 */

/** A named participant, as the gazette refers to them. */
export interface GazettePerson {
  readonly userId: string
  readonly username: string
}

/** A participant plus the count the fact is about. */
export interface GazetteCount extends GazettePerson {
  readonly count: number
}

/**
 * Which story this game is. Chosen by a FIXED priority (see pickFamily), never
 * drawn: the family is a fact about the game, only the wording is drawn.
 */
export const GAZETTE_FAMILIES = [
  'remontada',
  'eclair',
  'marathon',
  'village',
  'abandon_total',
  'abandon_individual',
  'zombie',
  'inconnu',
] as const
export type GazetteFamily = (typeof GAZETTE_FAMILIES)[number]

/** A moment stamp fed in by plan 030, when that module exists. */
export interface GazetteStamp {
  readonly id: string
  readonly label: string
  readonly userId: string | null
}

/**
 * Everything the gazette is allowed to say about a game. Every field is either
 * present (the log proves it) or null/empty (the log does not) — and a template
 * that needs an absent field is skipped, never filled with a guess.
 */
export interface GazetteFacts {
  readonly family: GazetteFamily
  readonly gameCode: string
  readonly endedAt: Date | null
  readonly durationSeconds: number | null
  readonly playerCount: number
  readonly totalDegommages: number
  readonly undoTotal: number
  /**
   * Net dégommages dealt / taken per participant, most first. Not slot-backed:
   * no template reads these, they feed the parchment's stats box, which needs
   * a real number per player rather than the leaders alone. `biggestHitter`
   * and `souffreDouleur` are simply the strictly-ahead top of each.
   */
  readonly dealtCounts: readonly GazetteCount[]
  readonly takenCounts: readonly GazetteCount[]
  readonly winner: GazettePerson | null
  /** Most dégommages dealt in THIS game — only when strictly ahead. */
  readonly biggestHitter: GazetteCount | null
  /** Most dégommages taken in THIS game — only when strictly ahead, count >= 2. */
  readonly souffreDouleur: GazetteCount | null
  /** Longest run of consecutive dégommages by one striker — only when >= 3. */
  readonly bestRun: GazetteCount | null
  /** Actors who annulled at least one dégommage, most first. */
  readonly undoers: readonly GazetteCount[]
  /** The chef de camp who validated the end (END_VALIDATED.actorId). */
  readonly validatedBy: GazettePerson | null
  /** Players who left mid-game. */
  readonly quitters: readonly GazettePerson[]
  /** A player who took zero dégommages — only in a village game with >= 4 hits. */
  readonly cleanSheet: GazettePerson | null
  /**
   * Highest all-time dégommage total among THIS game's participants, counted
   * over games that ended strictly BEFORE this one — viewer-independent, and
   * frozen once the game is over. Null on a tie or with no prior history.
   */
  readonly titleHolder: GazetteCount | null
  /** Plan 030 stamps; empty when that module does not exist. */
  readonly stamps: readonly GazetteStamp[]
}

/** Input of `deriveGazetteFacts` — everything getGameDetail already has. */
export interface GazetteInput {
  readonly gameCode: string
  readonly outcome: GameOutcome | null
  readonly abortReason: GameAbortReason | null
  readonly startedAt: Date | null
  readonly endedAt: Date | null
  readonly winnerId: string | null
  readonly players: readonly { userId: string; username: string; hasLeft: boolean }[]
  readonly events: readonly RawEvent[]
  readonly titleHolder?: GazetteCount | null
  readonly stamps?: readonly GazetteStamp[]
}

/** A village win under this many seconds is an « éclair ». */
const ECLAIR_MAX_SECONDS = 300
/** A village win at or over this many seconds is a « marathon ». */
const MARATHON_MIN_SECONDS = 1500
/** Below this, a streak of hits by one striker is not worth a headline. */
const MIN_RUN = 3
/** Below this, being the most-hit player is noise rather than a beating. */
const MIN_SOUFFRE = 2
/** A clean sheet only means something once the table has actually been busy. */
const MIN_HITS_FOR_CLEAN_SHEET = 4

/**
 * Local copy of game-detail-journal's payload guard: that one is private, and
 * this module deliberately imports nothing new from it beyond the two types.
 */
function payloadNumber(payload: unknown, key: string): number | null {
  if (payload !== null && typeof payload === 'object' && key in payload) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'number') return value
  }
  return null
}

/**
 * Total, engine-independent order: count desc, then username asc, then userId
 * asc — plain code-unit comparison rather than `localeCompare`, whose collation
 * can differ between JS engines. Two phones must sort identically or they would
 * draw different briefs.
 */
function compareCounts(a: GazetteCount, b: GazetteCount): number {
  if (a.count !== b.count) return b.count - a.count
  if (a.username !== b.username) return a.username < b.username ? -1 : 1
  if (a.userId !== b.userId) return a.userId < b.userId ? -1 : 1
  return 0
}

/** Tallies ids into sorted counts, dropping any id that is not a participant. */
function tally(ids: readonly string[], nameOf: ReadonlyMap<string, string>): GazetteCount[] {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const rows: GazetteCount[] = []
  for (const [userId, count] of counts) {
    const username = nameOf.get(userId)
    // An id absent from `players` is skipped, never rendered as a placeholder.
    if (username === undefined) continue
    rows.push({ userId, username, count })
  }
  return rows.sort(compareCounts)
}

/**
 * The leader, but only when strictly ahead of the runner-up. A tie is not a
 * story the gazette is allowed to tell, so it yields no fact at all.
 */
function topStrict(rows: readonly GazetteCount[]): GazetteCount | null {
  const first = rows[0]
  if (!first) return null
  const second = rows[1]
  if (second && second.count >= first.count) return null
  return first
}

/**
 * Longest run of consecutive dégommages by the same striker over the NET list
 * (undone hits are removed before the walk, so an annulled hit neither breaks
 * nor extends a run — it simply never happened). Ties keep the earliest run,
 * which makes the result order-deterministic.
 */
function longestRun(
  strikers: readonly string[],
  nameOf: ReadonlyMap<string, string>
): GazetteCount | null {
  let bestId: string | null = null
  let bestLength = 0
  let currentId: string | null = null
  let currentLength = 0
  for (const id of strikers) {
    if (id === currentId) currentLength += 1
    else {
      currentId = id
      currentLength = 1
    }
    if (currentLength > bestLength) {
      bestLength = currentLength
      bestId = currentId
    }
  }
  if (bestId === null || bestLength < MIN_RUN) return null
  const username = nameOf.get(bestId)
  if (username === undefined) return null
  return { userId: bestId, username, count: bestLength }
}

/**
 * The story this game is. Fixed priority, no hashing: « remontada » (the winner
 * was also the punching bag) outranks the duration families, which outrank the
 * plain village win; an aborted game takes its abort reason; anything the log
 * does not explain is « inconnu ».
 */
function pickFamily(
  outcome: GameOutcome | null,
  abortReason: GameAbortReason | null,
  durationSeconds: number | null,
  winner: GazettePerson | null,
  souffreDouleur: GazetteCount | null
): GazetteFamily {
  if (outcome === 'village_reached') {
    if (winner && souffreDouleur && souffreDouleur.userId === winner.userId) return 'remontada'
    if (durationSeconds !== null && durationSeconds < ECLAIR_MAX_SECONDS) return 'eclair'
    if (durationSeconds !== null && durationSeconds >= MARATHON_MIN_SECONDS) return 'marathon'
    return 'village'
  }
  if (outcome === 'aborted') return abortReason ?? 'inconnu'
  return 'inconnu'
}

/**
 * Reads a finished game's log into the closed set of facts the gazette may
 * print. Pure: same input, same output, on every phone, forever.
 */
export function deriveGazetteFacts(input: GazetteInput): GazetteFacts {
  const nameOf = new Map(input.players.map((player) => [player.userId, player.username]))

  // An UNDO never deletes its DEGOMMAGE row, it only marks it; the NET list is
  // what must agree with the scoreboard.
  const undoneSeqs = new Set<number>()
  let undoTotal = 0
  for (const event of input.events) {
    if (event.type !== 'UNDO') continue
    undoTotal += 1
    const targetSeq = payloadNumber(event.payload, 'targetSeq')
    if (targetSeq !== null) undoneSeqs.add(targetSeq)
  }

  const strikers: string[] = []
  const victims: string[] = []
  for (const event of input.events) {
    if (event.type !== 'DEGOMMAGE') continue
    if (undoneSeqs.has(event.seq)) continue
    if (event.actorId !== null) strikers.push(event.actorId)
    if (event.targetId !== null) victims.push(event.targetId)
  }

  const hitCounts = tally(strikers, nameOf)
  const takenCounts = tally(victims, nameOf)
  const takenByUser = new Map(takenCounts.map((row) => [row.userId, row.count]))

  const souffreCandidate = topStrict(takenCounts)
  const souffreDouleur =
    souffreCandidate && souffreCandidate.count >= MIN_SOUFFRE ? souffreCandidate : null

  const undoActors: string[] = []
  for (const event of input.events) {
    if (event.type === 'UNDO' && event.actorId !== null) undoActors.push(event.actorId)
  }

  let validatedBy: GazettePerson | null = null
  for (const event of input.events) {
    if (event.type !== 'END_VALIDATED' || event.actorId === null) continue
    const username = nameOf.get(event.actorId)
    // Last validation wins: a withdrawn request may have been validated before.
    if (username !== undefined) validatedBy = { userId: event.actorId, username }
  }

  const durationSeconds =
    input.startedAt && input.endedAt
      ? Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000))
      : null

  const winnerPlayer =
    input.winnerId === null
      ? null
      : (input.players.find((player) => player.userId === input.winnerId) ?? null)
  const winner: GazettePerson | null = winnerPlayer
    ? { userId: winnerPlayer.userId, username: winnerPlayer.username }
    : null

  const totalDegommages = strikers.length
  const untouched = input.players.filter((player) => (takenByUser.get(player.userId) ?? 0) === 0)
  const onlyUntouched = untouched.length === 1 ? untouched[0] : undefined
  const cleanSheet: GazettePerson | null =
    onlyUntouched !== undefined &&
    input.outcome === 'village_reached' &&
    totalDegommages >= MIN_HITS_FOR_CLEAN_SHEET
      ? { userId: onlyUntouched.userId, username: onlyUntouched.username }
      : null

  return {
    family: pickFamily(input.outcome, input.abortReason, durationSeconds, winner, souffreDouleur),
    gameCode: input.gameCode,
    endedAt: input.endedAt,
    durationSeconds,
    playerCount: input.players.length,
    totalDegommages,
    undoTotal,
    dealtCounts: hitCounts,
    takenCounts,
    winner,
    biggestHitter: topStrict(hitCounts),
    souffreDouleur,
    bestRun: longestRun(strikers, nameOf),
    undoers: tally(undoActors, nameOf),
    validatedBy,
    quitters: input.players
      .filter((player) => player.hasLeft)
      .map((player) => ({ userId: player.userId, username: player.username })),
    cleanSheet,
    titleHolder: input.titleHolder ?? null,
    stamps: input.stamps ?? [],
  }
}
