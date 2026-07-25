import type { GameEvent, GameState, PlayerState } from './types'

export function buildGameState(events: GameEvent[]): GameState {
  const first = events[0]
  if (!first || first.type !== 'GAME_STARTED') throw new Error('log must start with GAME_STARTED')
  let state = initialState(first)
  for (const event of events.slice(1)) state = reduce(state, event)
  return state
}

function initialState(event: Extract<GameEvent, { type: 'GAME_STARTED' }>): GameState {
  const players: Record<string, PlayerState> = {}
  for (const seat of event.payload.players) {
    players[seat.userId] = {
      userId: seat.userId,
      character: seat.character,
      degommages: 0,
      inGame: true,
    }
  }
  return {
    status: 'active',
    format: event.payload.format,
    seats: event.payload.players.map((p) => p.userId),
    players,
    degommageLog: [],
    undoneSeqs: new Set(),
    pendingEndRequest: null,
    outcome: null,
    winnerId: null,
    lastSeq: event.seq,
  }
}

export function reduce(state: GameState, event: GameEvent): GameState {
  if (event.type === 'GAME_STARTED') throw new Error('GAME_STARTED must be the first event')
  const base = { ...state, lastSeq: event.seq }
  if (state.status === 'finished') return base
  switch (event.type) {
    case 'DEGOMMAGE': {
      const actor = state.players[event.actorId]
      if (!actor) return base
      return {
        ...base,
        players: {
          ...state.players,
          [event.actorId]: { ...actor, degommages: actor.degommages + 1 },
        },
        degommageLog: [
          ...state.degommageLog,
          { seq: event.seq, actorId: event.actorId, targetId: event.targetId },
        ],
      }
    }
    case 'UNDO': {
      const targetSeq = event.payload.targetSeq
      const entry = state.degommageLog.find((d) => d.seq === targetSeq)
      if (!entry || state.undoneSeqs.has(targetSeq)) return base
      const actor = state.players[entry.actorId]
      if (!actor) return base
      return {
        ...base,
        undoneSeqs: new Set([...state.undoneSeqs, targetSeq]),
        players: {
          ...state.players,
          [entry.actorId]: { ...actor, degommages: actor.degommages - 1 },
        },
      }
    }
    case 'PLAYER_QUIT': {
      const actor = state.players[event.actorId]
      if (!actor || !actor.inGame) return base
      const players = { ...state.players, [event.actorId]: { ...actor, inGame: false } }
      const remaining = Object.values(players).filter((p) => p.inGame).length
      if (remaining < 2) {
        return { ...base, players, status: 'finished', outcome: 'aborted', pendingEndRequest: null }
      }
      return { ...base, players }
    }
    case 'END_REQUESTED': {
      if (state.pendingEndRequest) return base
      return {
        ...base,
        pendingEndRequest: {
          requestSeq: event.seq,
          requesterId: event.actorId,
          kind: event.payload.kind,
          designatedWinnerId: event.payload.kind === 'village' ? event.targetId : null,
        },
      }
    }
    case 'END_REJECTED': {
      if (state.pendingEndRequest?.requestSeq !== event.payload.requestSeq) return base
      return { ...base, pendingEndRequest: null }
    }
    case 'END_VALIDATED': {
      const pending = state.pendingEndRequest
      if (pending?.requestSeq !== event.payload.requestSeq) return base
      if (pending.kind === 'village') {
        return {
          ...base,
          pendingEndRequest: null,
          status: 'finished',
          outcome: 'village_reached',
          winnerId: pending.designatedWinnerId,
        }
      }
      if (pending.kind === 'abandon_total') {
        return {
          ...base,
          pendingEndRequest: null,
          status: 'finished',
          outcome: 'aborted',
          winnerId: null,
        }
      }
      // abandon_individual: the server appends PLAYER_QUIT right after (same transaction)
      return { ...base, pendingEndRequest: null }
    }
    case 'GAME_AUTO_CLOSED':
      return {
        ...base,
        pendingEndRequest: null,
        status: 'finished',
        outcome: 'aborted',
        winnerId: null,
      }
  }
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.seats
    .map((id) => state.players[id])
    .filter((p): p is PlayerState => p !== undefined && p.inGame)
}

export function resolveUndoTarget(state: GameState): number | null {
  for (let i = state.degommageLog.length - 1; i >= 0; i--) {
    const entry = state.degommageLog[i]
    if (entry && !state.undoneSeqs.has(entry.seq)) return entry.seq
  }
  return null
}
