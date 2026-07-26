import { beforeEach, describe, expect, it } from 'vitest'
import {
  ORACLE_SOUFFRE_DOULEUR_POINTS,
  ORACLE_WINNER_POINTS,
  resolveOracleOutcome,
  resolveSouffreDouleurId,
  scoreOraclePick,
  scoreOraclePicks,
  takenCounts,
  type OracleOutcome,
  type OraclePick,
} from './oracle'
import { buildGameState } from './reducer'
import {
  degommage,
  endRequested,
  endValidated,
  resetSeq,
  started,
  undo,
  SEATS_2,
} from './test-helpers'
import type { GameEvent } from './types'

beforeEach(resetSeq)

/** Closes a game on a village win for `winnerId`. */
const villageWin = (requesterId: string, winnerId: string): GameEvent[] => {
  const request = endRequested(requesterId, 'village', winnerId)
  return [request, endValidated(winnerId === requesterId ? 'u2' : winnerId, request.seq)]
}

/** Closes a game with a total abandon (outcome `aborted`, no winner). */
const totalAbandon = (requesterId: string, responderId: string): GameEvent[] => {
  const request = endRequested(requesterId, 'abandon_total')
  return [request, endValidated(responderId, request.seq)]
}

const outcomeOf = (winnerId: string | null, souffreDouleurId: string | null): OracleOutcome => ({
  winnerId,
  souffreDouleurId,
})

const pick = (
  userId: string,
  predictedWinnerId: string,
  predictedSouffreDouleurId: string | null = null
): OraclePick => ({ userId, predictedWinnerId, predictedSouffreDouleurId })

describe('resolveSouffreDouleurId', () => {
  it('returns null when nobody was hit', () => {
    expect(resolveSouffreDouleurId({})).toBeNull()
  })

  it('returns the single hit player at the ORACLE_SOUFFRE_MIN_HITS boundary', () => {
    expect(resolveSouffreDouleurId({ a: 1 })).toBe('a')
  })

  it('returns null on a tie — a tie is not a souffre-douleur', () => {
    expect(resolveSouffreDouleurId({ a: 2, b: 2 })).toBeNull()
  })

  it('returns the strictly-ahead player', () => {
    expect(resolveSouffreDouleurId({ a: 3, b: 1 })).toBe('a')
  })
})

describe('takenCounts', () => {
  it('excludes an undone dégommage', () => {
    const first = degommage('u1', 'u2')
    const state = buildGameState([
      started(SEATS_2),
      first,
      degommage('u1', 'u2'),
      undo('u1', first.seq),
    ])
    expect(takenCounts(state)).toEqual({ u2: 1 })
  })

  it('excludes a self-dégommage', () => {
    const state = {
      degommageLog: [
        { seq: 2, actorId: 'u1', targetId: 'u1' },
        { seq: 3, actorId: 'u1', targetId: 'u2' },
      ],
      undoneSeqs: new Set<number>(),
    }
    expect(takenCounts(state)).toEqual({ u2: 1 })
  })
})

describe('resolveOracleOutcome', () => {
  it('returns both fields null for an unfinished game', () => {
    const state = buildGameState([started(SEATS_2), degommage('u1', 'u2')])
    expect(state.status).toBe('active')
    expect(resolveOracleOutcome(state)).toEqual({ winnerId: null, souffreDouleurId: null })
  })

  it('resolves the souffre-douleur of an aborted game even without a winner', () => {
    const state = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      ...totalAbandon('u1', 'u2'),
    ])
    expect(resolveOracleOutcome(state)).toEqual({ winnerId: null, souffreDouleurId: 'u2' })
  })

  it('resolves both fields of a finished village win', () => {
    const state = buildGameState([
      started(SEATS_2),
      degommage('u2', 'u1'),
      ...villageWin('u2', 'u2'),
    ])
    expect(resolveOracleOutcome(state)).toEqual({ winnerId: 'u2', souffreDouleurId: 'u1' })
  })
})

describe('scoreOraclePick', () => {
  it('scores the exact winner alone', () => {
    const score = scoreOraclePick(pick('u1', 'u2', 'u9'), outcomeOf('u2', 'u1'))
    expect(score.winnerHit).toBe(true)
    expect(score.souffreDouleurHit).toBe(false)
    expect(score.points).toBe(ORACLE_WINNER_POINTS)
  })

  it('scores the souffre-douleur alone', () => {
    const score = scoreOraclePick(pick('u1', 'u9', 'u1'), outcomeOf('u2', 'u1'))
    expect(score.winnerHit).toBe(false)
    expect(score.souffreDouleurHit).toBe(true)
    expect(score.points).toBe(ORACLE_SOUFFRE_DOULEUR_POINTS)
  })

  it('scores both limbs', () => {
    const score = scoreOraclePick(pick('u1', 'u2', 'u1'), outcomeOf('u2', 'u1'))
    expect(score.points).toBe(ORACLE_WINNER_POINTS + ORACLE_SOUFFRE_DOULEUR_POINTS)
  })

  it('scores nothing when both limbs miss', () => {
    const score = scoreOraclePick(pick('u1', 'u9', 'u8'), outcomeOf('u2', 'u1'))
    expect(score.points).toBe(0)
  })

  it('never scores an omitted souffre-douleur, even against a null outcome', () => {
    const score = scoreOraclePick(pick('u1', 'u9', null), outcomeOf('u2', null))
    expect(score.souffreDouleurHit).toBe(false)
    expect(score.points).toBe(0)
  })

  it('scores 0 for a winner prediction in a game nobody won', () => {
    const score = scoreOraclePick(pick('u1', 'u2', null), outcomeOf(null, 'u1'))
    expect(score.winnerHit).toBe(false)
    expect(score.points).toBe(0)
  })
})

describe('scoreOraclePicks', () => {
  it('sorts points desc then userId asc and does not mutate its input', () => {
    const picks: OraclePick[] = [
      pick('zoe', 'u2', null),
      pick('adele', 'u9', null),
      pick('bob', 'u2', 'u1'),
      pick('alfred', 'u9', null),
    ]
    const snapshot = picks.map((p) => ({ ...p }))
    const scored = scoreOraclePicks(picks, outcomeOf('u2', 'u1'))
    expect(scored.map((s) => s.userId)).toEqual(['bob', 'zoe', 'adele', 'alfred'])
    expect(scored.map((s) => s.points)).toEqual([3, 2, 0, 0])
    expect(picks).toEqual(snapshot)
  })

  it('returns an empty array for no picks', () => {
    expect(scoreOraclePicks([], outcomeOf('u2', 'u1'))).toEqual([])
  })
})
