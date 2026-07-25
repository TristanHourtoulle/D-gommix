import type { Command, GameState } from './types'
import type { ErrorCode } from './protocol'
import { resolveUndoTarget } from './reducer'

export type ValidationResult = { ok: true } | { ok: false; code: ErrorCode }
const fail = (code: ErrorCode): ValidationResult => ({ ok: false, code })
const OK: ValidationResult = { ok: true }

export function validateCommand(
  state: GameState,
  actorId: string,
  cmd: Command,
  ctx: { isHost: boolean }
): ValidationResult {
  if (state.status === 'finished') return fail('GAME_FINISHED')
  const actor = state.players[actorId]
  if (!actor) return fail('NOT_MEMBER')
  if (!actor.inGame) return fail('PLAYER_LEFT')

  switch (cmd.type) {
    case 'degommage': {
      const target = state.players[cmd.targetId]
      if (cmd.targetId === actorId || !target || !target.inGame) return fail('INVALID_TARGET')
      return OK
    }
    case 'undo':
      return resolveUndoTarget(state) === null ? fail('NOTHING_TO_UNDO') : OK
    case 'request_end': {
      if (state.pendingEndRequest) return fail('END_REQUEST_PENDING')
      if (cmd.kind === 'village') {
        const winner = cmd.winnerId ? state.players[cmd.winnerId] : undefined
        if (!winner || !winner.inGame) return fail('INVALID_TARGET')
      }
      return OK
    }
    case 'respond_end':
      if (!state.pendingEndRequest) return fail('NO_PENDING_REQUEST')
      return ctx.isHost ? OK : fail('NOT_HOST')
    case 'withdraw_end':
      if (!state.pendingEndRequest || state.pendingEndRequest.requesterId !== actorId) {
        return fail('NO_PENDING_REQUEST')
      }
      return OK
  }
}
