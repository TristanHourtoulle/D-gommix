import {
  buildGameState,
  reduce,
  resolveUndoTarget,
  type CharacterId,
  type GameEvent,
  type GameFormat,
  type GameState,
  type SeatSnapshot,
} from '@degommix/game-core'
import type { LivePlayer } from '@/components/live/types'
import { hashGameSeq } from '@/lib/seq-hash'

/** Album pseudos for the fake table — never a real friend's pseudo. */
export const SIM_PSEUDOS = ['Panoramix', 'Abraracourcix', 'Assurancetourix', 'Idéfix'] as const

/** Seat order → character, mirroring the four camps of the real game. */
export const SIM_CHARACTERS: readonly CharacterId[] = [
  'asterix',
  'obelix',
  'caius_bonus',
  'caligula_minus',
]

/** How the fake game ends. « remontada » is a village won by a player who was behind. */
export type SimScenario = 'village' | 'abandon_total' | 'remontada'

/** Playback speed. `'instant'` applies every remaining event in one tick. */
export type SimSpeed = 1 | 4 | 'instant'

export interface SimOptions {
  readonly seed: string
  readonly playerCount: GameFormat
  readonly scenario: SimScenario
}

export interface SimTimeline {
  /** `sim-<seed>-<playerCount>-<scenario>`. Seeds every presentation choice; never leaves the browser. */
  readonly gameId: string
  readonly seed: string
  readonly scenario: SimScenario
  readonly hostId: string
  readonly players: readonly LivePlayer[]
  readonly events: readonly GameEvent[]
  /** Wall-clock ms to wait BEFORE applying `events[i]`; `delaysMs[0]` and `delaysMs[1]` are 0. */
  readonly delaysMs: readonly number[]
  /** ISO `createdAt` of GAME_STARTED — the chrono anchor. */
  readonly startedAt: string
}

/** Anchor of every simulated timestamp: a fixed date, so a seed replays identically. */
const SIM_BASE_AT = '2026-07-26T20:00:00.000Z'

/** Shortest gap between two simulated actions, in ms. */
const MIN_STEP_MS = 1200
/** Width of the drawn gap on top of {@link MIN_STEP_MS}: 1.2 s – 4.0 s, a table's rhythm. */
const STEP_SPREAD_MS = 2800
/** The validation of an end request follows its demand almost immediately. */
const END_VALIDATED_DELAY_MS = 900
/** Share of the dégommage stream that forms the « before » of a remontada. */
const REMONTADA_MARK_RATIO = 0.6
/** In the remontada's second act, 4 dégommages out of 5 belong to the comeback seat. */
const REMONTADA_CATCHUP_PERIOD = 5
/** Safety bound on the reshaping loop; the shape converges in a handful of steps. */
const MAX_SHAPE_ATTEMPTS = 64

/**
 * Deterministic draw #`index` for this simulation, in `[0, modulo)`. Reuses
 * `hashGameSeq` — the app's only random-looking primitive (`lib/seq-hash.ts`)
 * — so a seed replays byte-identically on any device, like a real game's
 * journal does. `Math.random()` is banned here for exactly that reason.
 */
function draw(gameId: string, index: number, modulo: number): number {
  return hashGameSeq(gameId, index) % modulo
}

/** Seat with the most non-undone dégommages; ties go to the earliest seat. */
function leaderOf(state: GameState): string | null {
  let leader: string | null = null
  let best = -1
  for (const userId of state.seats) {
    const player = state.players[userId]
    if (!player) continue
    if (player.degommages > best) {
      best = player.degommages
      leader = userId
    }
  }
  return leader
}

/** True when `userId` has strictly more dégommages than every other seat. */
function leadsStrictly(state: GameState, userId: string): boolean {
  const player = state.players[userId]
  if (!player) return false
  return state.seats.every((other) => {
    if (other === userId) return true
    return (state.players[other]?.degommages ?? 0) < player.degommages
  })
}

interface Attempt {
  readonly events: GameEvent[]
  readonly delaysMs: number[]
  /** False when a « remontada » did not produce a comeback — the caller retries longer. */
  readonly shaped: boolean
}

/**
 * Builds one candidate log of exactly `degommageCount` dégommages. Every draw
 * consumes the next index of the attempt's own counter, so an attempt is a pure
 * function of `(gameId, format, scenario, degommageCount)`.
 */
function buildAttempt(
  gameId: string,
  seats: readonly SeatSnapshot[],
  format: GameFormat,
  scenario: SimScenario,
  degommageCount: number,
  startDrawIndex: number
): Attempt {
  let drawIndex = startDrawIndex
  const pick = (modulo: number): number => draw(gameId, drawIndex++, modulo)

  const seatIds = seats.map((seat) => seat.userId)
  const hostId = seatIds[0] ?? 'sim-1'
  /** The seat that storms back in a « remontada »; it also hosts the table. */
  const comebackId = hostId
  /** The seat that leads the first act of a « remontada ». */
  const earlyId = seatIds[1] ?? hostId

  const events: GameEvent[] = []
  const delaysMs: number[] = []
  const baseMs = Date.parse(SIM_BASE_AT)
  let elapsed = 0
  let seq = 1

  const emit = (delay: number, make: (seq: number, createdAt: string) => GameEvent): GameEvent => {
    delaysMs.push(delay)
    elapsed += delay
    const event = make(seq, new Date(baseMs + elapsed).toISOString())
    events.push(event)
    seq += 1
    return event
  }
  // The opening whistle and the first action land immediately; the rest breathes.
  const nextDelay = (): number => (events.length <= 1 ? 0 : MIN_STEP_MS + pick(STEP_SPREAD_MS))

  emit(0, (eventSeq, createdAt) => ({
    type: 'GAME_STARTED',
    seq: eventSeq,
    createdAt,
    actorId: hostId,
    targetId: null,
    payload: { players: seats.map((seat) => ({ ...seat })), format },
  }))
  let state = buildGameState([...events])

  const markIndex = Math.floor(degommageCount * REMONTADA_MARK_RATIO)

  // Per-seat bias for the ordinary scenarios: a weighted pool of seat ids.
  const pool: string[] = []
  for (const userId of seatIds) {
    const weight = 1 + pick(4)
    for (let k = 0; k < weight; k++) pool.push(userId)
  }

  // Undos live in the last 40 % of the stream, so the « before » of a remontada
  // is never rewritten under the mark.
  const undoCount = 1 + pick(2)
  const undoRegion = Math.max(1, degommageCount - markIndex)
  const undoAt: number[] = []
  for (let u = 0; u < undoCount; u++) undoAt.push(markIndex + pick(undoRegion))

  const actorAt = (index: number): string => {
    if (scenario !== 'remontada') return pool[pick(pool.length)] ?? hostId
    if (index < markIndex) {
      // First act: one dégommage out of two for the early leader, the rest
      // rotates over the other seats. With an odd `markIndex` the early leader
      // is strictly ahead at the mark, by construction.
      if (index % 2 === 0) return earlyId
      const others = seatIds.filter((userId) => userId !== earlyId)
      return others[((index - 1) / 2) % others.length] ?? hostId
    }
    // Second act: the comeback seat takes 4 dégommages out of 5.
    const offset = index - markIndex
    if (offset % REMONTADA_CATCHUP_PERIOD !== REMONTADA_CATCHUP_PERIOD - 1) return comebackId
    const others = seatIds.filter((userId) => userId !== comebackId)
    return others[pick(Math.max(1, others.length))] ?? hostId
  }

  for (let index = 0; index < degommageCount; index++) {
    const actorId = actorAt(index)
    const candidates = state.seats.filter(
      (userId) => userId !== actorId && (state.players[userId]?.inGame ?? false)
    )
    const targetId = candidates[pick(Math.max(1, candidates.length))]
    if (targetId === undefined) continue
    const degommage = emit(nextDelay(), (eventSeq, createdAt) => ({
      type: 'DEGOMMAGE',
      seq: eventSeq,
      createdAt,
      actorId,
      targetId,
      payload: null,
    }))
    state = reduce(state, degommage)

    for (const position of undoAt) {
      if (position !== index) continue
      const targetSeq = resolveUndoTarget(state)
      if (targetSeq === null) continue
      const undone = state.degommageLog.find((entry) => entry.seq === targetSeq)
      if (!undone) continue
      // At a real table, the author of the dégommage is the one who presses « Annuler ».
      const undoActorId = undone.actorId
      const undo = emit(nextDelay(), (eventSeq, createdAt) => ({
        type: 'UNDO',
        seq: eventSeq,
        createdAt,
        actorId: undoActorId,
        targetId: null,
        payload: { targetSeq },
      }))
      state = reduce(state, undo)
    }
  }

  const winnerId = leaderOf(state) ?? hostId
  const isAbandon = scenario === 'abandon_total'
  const requesterId = isAbandon ? (seatIds[1] ?? hostId) : hostId
  const validatorId = seatIds[1] ?? hostId

  const request = emit(nextDelay(), (eventSeq, createdAt) => ({
    type: 'END_REQUESTED',
    seq: eventSeq,
    createdAt,
    actorId: requesterId,
    targetId: isAbandon ? null : winnerId,
    payload: { kind: isAbandon ? 'abandon_total' : 'village' },
  }))
  state = reduce(state, request)
  const requestSeq = request.seq

  const validation = emit(END_VALIDATED_DELAY_MS, (eventSeq, createdAt) => ({
    type: 'END_VALIDATED',
    seq: eventSeq,
    createdAt,
    actorId: isAbandon ? hostId : validatorId,
    targetId: null,
    payload: { requestSeq },
  }))
  state = reduce(state, validation)

  let shaped = true
  if (scenario === 'remontada') {
    const marked = buildGameState(
      events.filter((event) => event.type === 'GAME_STARTED' || event.type === 'DEGOMMAGE').slice(0, markIndex + 1)
    )
    shaped =
      markIndex % 2 === 1 &&
      leaderOf(marked) !== comebackId &&
      state.winnerId === comebackId &&
      leadsStrictly(state, comebackId)
  }

  return { events, delaysMs, shaped }
}

/** Builds the whole fake game. Pure: same options → deeply equal result, forever. */
export function generateTimeline(options: SimOptions): SimTimeline {
  const { seed, playerCount, scenario } = options
  const gameId = `sim-${seed}-${playerCount}-${scenario}`

  const players: LivePlayer[] = []
  const seats: SeatSnapshot[] = []
  for (let i = 0; i < playerCount; i++) {
    const userId = `sim-${i + 1}`
    players.push({ userId, username: SIM_PSEUDOS[i] ?? `Gaulois ${i + 1}`, avatarId: null })
    seats.push({ userId, character: SIM_CHARACTERS[i] ?? 'asterix' })
  }

  const baseCount = 8 + playerCount * 3 + draw(gameId, 0, 7)
  let attempt = buildAttempt(gameId, seats, playerCount, scenario, baseCount, 1)
  for (let extra = 1; extra <= MAX_SHAPE_ATTEMPTS && !attempt.shaped; extra++) {
    // A longer stream gives the comeback seat the room it needs. Each attempt
    // restarts the draw counter, so only the returned one is observable.
    attempt = buildAttempt(gameId, seats, playerCount, scenario, baseCount + extra, 1)
  }
  if (!attempt.shaped) {
    throw new Error(`unshaped ${scenario} timeline for ${gameId}`)
  }

  return {
    gameId,
    seed,
    scenario,
    hostId: seats[0]?.userId ?? 'sim-1',
    players,
    events: attempt.events,
    delaysMs: attempt.delaysMs,
    startedAt: attempt.events[0]?.createdAt ?? SIM_BASE_AT,
  }
}

/** Delay before applying `events[index]` at `speed`. `'instant'` → 0. */
export function stepDelayMs(timeline: SimTimeline, index: number, speed: SimSpeed): number {
  if (speed === 'instant') return 0
  return Math.round((timeline.delaysMs[index] ?? 0) / speed)
}
