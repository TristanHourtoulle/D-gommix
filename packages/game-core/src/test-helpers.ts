import type { EndKind, GameEvent, GameFormat, SeatSnapshot } from './types'

let seqCounter = 0
export const resetSeq = () => {
  seqCounter = 0
}
const next = () => ++seqCounter
const at = () => new Date(2026, 6, 25, 12, 0, seqCounter).toISOString()

export const started = (players: SeatSnapshot[], format?: GameFormat): GameEvent => {
  const first = players[0]
  if (!first) throw new Error('players required')
  return {
    seq: next(),
    createdAt: at(),
    type: 'GAME_STARTED',
    actorId: first.userId,
    targetId: null,
    payload: { players, format: format ?? (players.length as GameFormat) },
  }
}
export const degommage = (actorId: string, targetId: string): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'DEGOMMAGE',
  actorId,
  targetId,
  payload: null,
})
export const undo = (actorId: string, targetSeq: number): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'UNDO',
  actorId,
  targetId: null,
  payload: { targetSeq },
})
export const quit = (actorId: string): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'PLAYER_QUIT',
  actorId,
  targetId: null,
  payload: null,
})
export const endRequested = (
  actorId: string,
  kind: EndKind,
  winnerId: string | null = null
): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'END_REQUESTED',
  actorId,
  targetId: winnerId,
  payload: { kind },
})
export const endRejected = (actorId: string, requestSeq: number): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'END_REJECTED',
  actorId,
  targetId: null,
  payload: { requestSeq },
})
export const endValidated = (actorId: string, requestSeq: number): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'END_VALIDATED',
  actorId,
  targetId: null,
  payload: { requestSeq },
})
export const autoClosed = (): GameEvent => ({
  seq: next(),
  createdAt: at(),
  type: 'GAME_AUTO_CLOSED',
  actorId: null,
  targetId: null,
  payload: { reason: 'zombie' },
})

export const SEATS_2: SeatSnapshot[] = [
  { userId: 'u1', character: 'asterix' },
  { userId: 'u2', character: 'obelix' },
]
export const SEATS_4: SeatSnapshot[] = [
  ...SEATS_2,
  { userId: 'u3', character: 'caius_bonus' },
  { userId: 'u4', character: 'caligula_minus' },
]
