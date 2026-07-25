import { beforeEach, describe, expect, it } from 'vitest'
import { buildGameState } from './reducer'
import { validateCommand } from './validate'
import {
  degommage,
  endRequested,
  endValidated,
  quit,
  resetSeq,
  started,
  SEATS_2,
  SEATS_4,
} from './test-helpers'

beforeEach(resetSeq)
const host = { isHost: true }
const guest = { isHost: false }

describe('validateCommand', () => {
  it('rejects self-degommage (INVALID_TARGET)', () => {
    const s = buildGameState([started(SEATS_2)])
    expect(validateCommand(s, 'u1', { type: 'degommage', targetId: 'u1' }, host)).toEqual({
      ok: false,
      code: 'INVALID_TARGET',
    })
  })
  it('rejects degommage on a player outside the game (INVALID_TARGET)', () => {
    const s = buildGameState([started(SEATS_2)])
    expect(validateCommand(s, 'u1', { type: 'degommage', targetId: 'ghost' }, host)).toEqual({
      ok: false,
      code: 'INVALID_TARGET',
    })
  })
  it('rejects degommage on a player who left (INVALID_TARGET)', () => {
    const s = buildGameState([started(SEATS_4), quit('u3')])
    expect(validateCommand(s, 'u1', { type: 'degommage', targetId: 'u3' }, host)).toEqual({
      ok: false,
      code: 'INVALID_TARGET',
    })
  })
  it('a player who left can no longer act (PLAYER_LEFT)', () => {
    const s = buildGameState([started(SEATS_4), quit('u3')])
    expect(validateCommand(s, 'u3', { type: 'degommage', targetId: 'u1' }, guest)).toEqual({
      ok: false,
      code: 'PLAYER_LEFT',
    })
  })
  it('a non-member cannot act (NOT_MEMBER)', () => {
    const s = buildGameState([started(SEATS_2)])
    expect(validateCommand(s, 'stranger', { type: 'undo' }, guest)).toEqual({
      ok: false,
      code: 'NOT_MEMBER',
    })
  })
  it('undo with empty stack (NOTHING_TO_UNDO)', () => {
    const s = buildGameState([started(SEATS_2)])
    expect(validateCommand(s, 'u1', { type: 'undo' }, host)).toEqual({
      ok: false,
      code: 'NOTHING_TO_UNDO',
    })
  })
  it('second end request while one is pending (END_REQUEST_PENDING)', () => {
    const s = buildGameState([started(SEATS_2), endRequested('u2', 'village', 'u2')])
    expect(validateCommand(s, 'u1', { type: 'request_end', kind: 'abandon_total' }, host)).toEqual({
      ok: false,
      code: 'END_REQUEST_PENDING',
    })
  })
  it('non-host cannot validate an end request (NOT_HOST)', () => {
    const s = buildGameState([started(SEATS_2), endRequested('u1', 'village', 'u1')])
    expect(validateCommand(s, 'u2', { type: 'respond_end', accept: true }, guest)).toEqual({
      ok: false,
      code: 'NOT_HOST',
    })
  })
  it('respond_end with no pending request (NO_PENDING_REQUEST)', () => {
    const s = buildGameState([started(SEATS_2)])
    expect(validateCommand(s, 'u1', { type: 'respond_end', accept: true }, host)).toEqual({
      ok: false,
      code: 'NO_PENDING_REQUEST',
    })
  })
  it('withdraw_end only by the requester (NO_PENDING_REQUEST otherwise)', () => {
    const s = buildGameState([started(SEATS_2), endRequested('u2', 'abandon_total')])
    expect(validateCommand(s, 'u1', { type: 'withdraw_end' }, host)).toEqual({
      ok: false,
      code: 'NO_PENDING_REQUEST',
    })
    expect(validateCommand(s, 'u2', { type: 'withdraw_end' }, guest)).toEqual({ ok: true })
  })
  it('village request must designate a player still in game (INVALID_TARGET)', () => {
    const s = buildGameState([started(SEATS_4), quit('u3')])
    expect(
      validateCommand(s, 'u1', { type: 'request_end', kind: 'village', winnerId: 'u3' }, host)
    ).toEqual({ ok: false, code: 'INVALID_TARGET' })
    expect(validateCommand(s, 'u1', { type: 'request_end', kind: 'village' }, host)).toEqual({
      ok: false,
      code: 'INVALID_TARGET',
    })
  })
  it('everything is rejected once finished (GAME_FINISHED)', () => {
    const s = buildGameState([
      started(SEATS_2),
      endRequested('u1', 'abandon_total'),
      endValidated('u1', 2),
    ])
    expect(validateCommand(s, 'u1', { type: 'degommage', targetId: 'u2' }, host)).toEqual({
      ok: false,
      code: 'GAME_FINISHED',
    })
  })
  it('happy paths are accepted', () => {
    const s = buildGameState([started(SEATS_2), degommage('u1', 'u2')])
    expect(validateCommand(s, 'u1', { type: 'degommage', targetId: 'u2' }, host)).toEqual({
      ok: true,
    })
    expect(validateCommand(s, 'u2', { type: 'undo' }, guest)).toEqual({ ok: true })
    expect(
      validateCommand(s, 'u2', { type: 'request_end', kind: 'village', winnerId: 'u2' }, guest)
    ).toEqual({ ok: true })
  })
})
