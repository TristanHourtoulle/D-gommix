export const CHARACTERS = ['asterix', 'obelix', 'caius_bonus', 'caligula_minus'] as const
export type CharacterId = (typeof CHARACTERS)[number]

export type GameFormat = 2 | 3 | 4
export type EndKind = 'village' | 'abandon_individual' | 'abandon_total'
export type GameOutcome = 'village_reached' | 'aborted'

export interface SeatSnapshot {
  userId: string
  character: CharacterId
}

interface BaseEvent {
  seq: number
  createdAt: string // ISO 8601, informative only (order = seq)
}

export type GameEvent =
  | (BaseEvent & {
      type: 'GAME_STARTED'
      actorId: string
      targetId: null
      payload: { players: SeatSnapshot[]; format: GameFormat }
    })
  | (BaseEvent & { type: 'DEGOMMAGE'; actorId: string; targetId: string; payload: null })
  | (BaseEvent & { type: 'UNDO'; actorId: string; targetId: null; payload: { targetSeq: number } })
  | (BaseEvent & { type: 'PLAYER_QUIT'; actorId: string; targetId: null; payload: null })
  | (BaseEvent & {
      type: 'END_REQUESTED'
      actorId: string
      targetId: string | null
      payload: { kind: EndKind }
    })
  | (BaseEvent & {
      type: 'END_REJECTED'
      actorId: string
      targetId: null
      payload: { requestSeq: number }
    })
  | (BaseEvent & {
      type: 'END_VALIDATED'
      actorId: string
      targetId: null
      payload: { requestSeq: number }
    })
  | (BaseEvent & {
      type: 'GAME_AUTO_CLOSED'
      actorId: null
      targetId: null
      payload: { reason: 'zombie' }
    })

export type GameEventType = GameEvent['type']

export interface PlayerState {
  userId: string
  character: CharacterId
  degommages: number // non-undone count
  inGame: boolean // false after PLAYER_QUIT
}

export interface DegommageEntry {
  seq: number
  actorId: string
  targetId: string
}

export interface PendingEndRequest {
  requestSeq: number
  requesterId: string
  kind: EndKind
  designatedWinnerId: string | null // set only when kind === "village"
}

export interface GameState {
  status: 'active' | 'finished'
  format: GameFormat
  seats: string[] // userIds in GAME_STARTED order
  players: Record<string, PlayerState>
  degommageLog: DegommageEntry[] // every DEGOMMAGE, in seq order
  undoneSeqs: ReadonlySet<number>
  pendingEndRequest: PendingEndRequest | null
  outcome: GameOutcome | null
  winnerId: string | null
  lastSeq: number
}

export type Command =
  | { type: 'degommage'; targetId: string }
  | { type: 'undo' }
  | { type: 'request_end'; kind: EndKind; winnerId?: string }
  | { type: 'respond_end'; accept: boolean }
  | { type: 'withdraw_end' }
