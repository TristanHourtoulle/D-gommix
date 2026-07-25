import { beforeEach, describe, expect, it } from 'vitest'
import { buildGameState, resolveUndoTarget } from './reducer'
import {
  autoClosed,
  degommage,
  endRejected,
  endRequested,
  endValidated,
  quit,
  resetSeq,
  started,
  undo,
  SEATS_2,
  SEATS_4,
} from './test-helpers'

beforeEach(resetSeq)

describe('GAME_STARTED', () => {
  it('initializes seats, counters at 0, status active', () => {
    const s = buildGameState([started(SEATS_4)])
    expect(s.status).toBe('active')
    expect(s.format).toBe(4)
    expect(s.seats).toEqual(['u1', 'u2', 'u3', 'u4'])
    expect(s.players['u1']).toEqual({
      userId: 'u1',
      character: 'asterix',
      degommages: 0,
      inGame: true,
    })
    expect(s.lastSeq).toBe(1)
  })
  it('throws if the log does not start with GAME_STARTED', () => {
    expect(() => buildGameState([degommage('u1', 'u2')])).toThrow()
  })
})

describe('DEGOMMAGE', () => {
  it('one tap = one pawn: increments the actor counter', () => {
    const s = buildGameState([started(SEATS_2), degommage('u1', 'u2'), degommage('u1', 'u2')])
    expect(s.players['u1']?.degommages).toBe(2)
    expect(s.players['u2']?.degommages).toBe(0)
    expect(s.degommageLog).toHaveLength(2)
  })
  it('counters depend only on seq order', () => {
    const a = buildGameState([started(SEATS_2), degommage('u1', 'u2'), degommage('u2', 'u1')])
    resetSeq()
    const b = buildGameState([started(SEATS_2), degommage('u2', 'u1'), degommage('u1', 'u2')])
    expect(a.players['u1']?.degommages).toBe(1)
    expect(b.players['u1']?.degommages).toBe(1)
  })
  it('two identical events with distinct seq count twice (idempotency is a server contract)', () => {
    const s = buildGameState([started(SEATS_2), degommage('u1', 'u2'), degommage('u1', 'u2')])
    expect(s.players['u1']?.degommages).toBe(2)
  })
})

describe('UNDO', () => {
  it('cancels the most recent non-undone DEGOMMAGE (stack)', () => {
    const s = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      degommage('u2', 'u1'),
      undo('u1', 3),
    ])
    expect(s.players['u2']?.degommages).toBe(0)
    expect(s.players['u1']?.degommages).toBe(1)
  })
  it('any player can undo, not only the author', () => {
    const s = buildGameState([started(SEATS_2), degommage('u1', 'u2'), undo('u2', 2)])
    expect(s.players['u1']?.degommages).toBe(0)
  })
  it('successive undos empty the whole stack', () => {
    const s = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      degommage('u1', 'u2'),
      undo('u2', 3),
      undo('u1', 2),
    ])
    expect(s.players['u1']?.degommages).toBe(0)
    expect(resolveUndoTarget(s)).toBeNull()
  })
  it('resolveUndoTarget skips already-undone seqs', () => {
    const s = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      degommage('u2', 'u1'),
      undo('u1', 3),
    ])
    expect(resolveUndoTarget(s)).toBe(2)
  })
  it('counting stays correct when rebuilding a log with an undo in the middle', () => {
    const events = [started(SEATS_2), degommage('u1', 'u2'), undo('u2', 2), degommage('u1', 'u2')]
    expect(buildGameState(events).players['u1']?.degommages).toBe(1)
  })
})

describe('PLAYER_QUIT', () => {
  it('player leaves but his degommages remain', () => {
    const s = buildGameState([started(SEATS_4), degommage('u3', 'u1'), quit('u3')])
    expect(s.players['u3']?.inGame).toBe(false)
    expect(s.players['u3']?.degommages).toBe(1)
    expect(s.status).toBe('active')
  })
})

describe('end of game', () => {
  it('village: END_REQUESTED sets pendingEndRequest with designated winner', () => {
    const s = buildGameState([started(SEATS_2), endRequested('u2', 'village', 'u2')])
    expect(s.pendingEndRequest).toEqual({
      requestSeq: 2,
      requesterId: 'u2',
      kind: 'village',
      designatedWinnerId: 'u2',
    })
    expect(s.status).toBe('active')
  })
  it('village validated: winner frozen, game finished', () => {
    const s = buildGameState([
      started(SEATS_2),
      endRequested('u2', 'village', 'u2'),
      endValidated('u1', 2),
    ])
    expect(s.status).toBe('finished')
    expect(s.outcome).toBe('village_reached')
    expect(s.winnerId).toBe('u2')
    expect(s.pendingEndRequest).toBeNull()
  })
  it('rejected: pending cleared, game continues', () => {
    const s = buildGameState([
      started(SEATS_2),
      endRequested('u2', 'village', 'u2'),
      endRejected('u1', 2),
    ])
    expect(s.pendingEndRequest).toBeNull()
    expect(s.status).toBe('active')
  })
  it('abandon_individual validated with >= 2 remaining: requester quits, game continues', () => {
    const s = buildGameState([
      started(SEATS_4),
      endRequested('u3', 'abandon_individual'),
      endValidated('u1', 2),
      quit('u3'),
    ])
    expect(s.status).toBe('active')
    expect(s.players['u3']?.inGame).toBe(false)
  })
  it('abandon_individual validated with < 2 remaining: game aborted', () => {
    const s = buildGameState([
      started(SEATS_2),
      endRequested('u2', 'abandon_individual'),
      endValidated('u1', 2),
      quit('u2'),
    ])
    expect(s.status).toBe('finished')
    expect(s.outcome).toBe('aborted')
    expect(s.winnerId).toBeNull()
  })
  it('abandon_total validated: aborted, no winner', () => {
    const s = buildGameState([
      started(SEATS_4),
      endRequested('u1', 'abandon_total'),
      endValidated('u1', 2),
    ])
    expect(s.outcome).toBe('aborted')
    expect(s.winnerId).toBeNull()
    expect(s.status).toBe('finished')
  })
  it('GAME_AUTO_CLOSED: aborted', () => {
    const s = buildGameState([started(SEATS_2), autoClosed()])
    expect(s.status).toBe('finished')
    expect(s.outcome).toBe('aborted')
  })
  it('no event has any effect after closure', () => {
    const s = buildGameState([
      started(SEATS_2),
      endRequested('u1', 'abandon_total'),
      endValidated('u1', 2),
      degommage('u1', 'u2'),
    ])
    expect(s.players['u1']?.degommages).toBe(0)
    expect(s.status).toBe('finished')
  })
})
