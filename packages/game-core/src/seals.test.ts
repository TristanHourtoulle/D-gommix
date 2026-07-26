import { beforeEach, describe, expect, it } from 'vitest'
import { buildGameState } from './reducer'
import {
  ARVERN_SHIELD_MIN_GAME_DEGOMMAGES,
  detectSeals,
  SEAL_IDS,
  isSealId,
  type SealId,
} from './seals'
import {
  degommage,
  endRequested,
  endValidated,
  quit,
  resetSeq,
  started,
  undo,
  SEATS_2,
  SEATS_4,
} from './test-helpers'
import type { GameEvent, GameState } from './types'

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

const detect = (
  state: GameState,
  userId: string,
  career: { careerWins?: number; currentStreak?: number } = {}
): SealId[] =>
  detectSeals({
    userId,
    state,
    careerWins: career.careerWins ?? 1,
    currentStreak: career.currentStreak ?? 1,
  })

describe('isSealId', () => {
  it('accepts every catalog id and rejects anything else', () => {
    for (const id of SEAL_IDS) expect(isSealId(id)).toBe(true)
    expect(isSealId('nope')).toBe(false)
    expect(isSealId(undefined)).toBe(false)
    expect(isSealId(42)).toBe(false)
  })
})

describe('imperator', () => {
  it('an untouched winner earns imperator and, on a first career win, first_win', () => {
    const state = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      ...villageWin('u1', 'u1'),
    ])
    expect(detect(state, 'u1', { careerWins: 1 })).toEqual(['imperator', 'first_win'])
  })

  it('a winner who was degommed once does not earn imperator', () => {
    const state = buildGameState([
      started(SEATS_2),
      degommage('u2', 'u1'),
      ...villageWin('u1', 'u1'),
    ])
    expect(detect(state, 'u1')).not.toContain('imperator')
  })

  it('a winner whose only degommage was undone still earns imperator', () => {
    const hit = degommage('u2', 'u1')
    const state = buildGameState([
      started(SEATS_2),
      hit,
      undo('u2', hit.seq),
      ...villageWin('u1', 'u1'),
    ])
    expect(detect(state, 'u1')).toContain('imperator')
  })

  it('is not awarded when the game was aborted rather than won', () => {
    const state = buildGameState([started(SEATS_2), ...totalAbandon('u1', 'u2')])
    expect(detect(state, 'u1')).toEqual([])
  })
})

describe('village_tour', () => {
  it('is earned when the player degommed all three opponents at least once', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      degommage('u1', 'u4'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).toContain('village_tour')
  })

  it('is not earned when one opponent was never degommed', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('village_tour')
  })

  it('does not count a degommage that was undone', () => {
    const hit = degommage('u1', 'u4')
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      hit,
      undo('u1', hit.seq),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('village_tour')
  })

  it('is kept by a player who degommed everyone and then quit', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      degommage('u1', 'u4'),
      quit('u1'),
      ...villageWin('u2', 'u2'),
    ])
    expect(state.players['u1']?.inGame).toBe(false)
    expect(detect(state, 'u1')).toContain('village_tour')
  })

  it('is never earned in a 1v1 (VILLAGE_TOUR_MIN_SEATS guard)', () => {
    const state = buildGameState([
      started(SEATS_2),
      degommage('u1', 'u2'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('village_tour')
  })
})

describe('career seals', () => {
  const wonGame = () =>
    buildGameState([started(SEATS_2), degommage('u1', 'u2'), ...villageWin('u1', 'u1')])

  it('emits first_win on every win, not only the first (threshold semantics)', () => {
    expect(detect(wonGame(), 'u1', { careerWins: 1 })).toContain('first_win')
    resetSeq()
    expect(detect(wonGame(), 'u1', { careerWins: 7 })).toContain('first_win')
  })

  it('awards decurion at ten career wins and not at nine', () => {
    expect(detect(wonGame(), 'u1', { careerWins: 9 })).not.toContain('decurion')
    resetSeq()
    expect(detect(wonGame(), 'u1', { careerWins: 10 })).toContain('decurion')
  })

  it('awards rising_tide at a three-win streak and not at two', () => {
    expect(detect(wonGame(), 'u1', { currentStreak: 2 })).not.toContain('rising_tide')
    resetSeq()
    expect(detect(wonGame(), 'u1', { currentStreak: 3 })).toContain('rising_tide')
  })

  it('gives career seals to the winner only', () => {
    expect(detect(wonGame(), 'u2', { careerWins: 10, currentStreak: 3 })).not.toContain('first_win')
  })
})

describe('arvern_shield', () => {
  /** 4-player village win by `u2` with `count` degommages, none of them on `u1`. */
  const quietGame = (count: number): GameState => {
    const hits: GameEvent[] = []
    const targets = ['u3', 'u4', 'u3', 'u4', 'u3']
    for (let i = 0; i < count; i++) hits.push(degommage('u2', targets[i] ?? 'u3'))
    return buildGameState([started(SEATS_4), ...hits, ...villageWin('u2', 'u2')])
  }

  it('is earned by an untouched non-winner in a busy village game', () => {
    const state = quietGame(ARVERN_SHIELD_MIN_GAME_DEGOMMAGES)
    expect(detect(state, 'u1')).toContain('arvern_shield')
  })

  it('is not earned below the minimum game activity guard', () => {
    const state = quietGame(ARVERN_SHIELD_MIN_GAME_DEGOMMAGES - 1)
    expect(detect(state, 'u1')).not.toContain('arvern_shield')
  })

  it('is not earned in an aborted game', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      ...totalAbandon('u2', 'u3'),
    ])
    expect(detect(state, 'u1')).not.toContain('arvern_shield')
  })

  it('is disjoint from imperator: the untouched winner gets imperator only', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      ...villageWin('u2', 'u2'),
    ])
    const detected = detect(state, 'u2')
    expect(detected).toContain('imperator')
    expect(detected).not.toContain('arvern_shield')
  })

  it('is not earned by a player who quit before the end', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      quit('u1'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('arvern_shield')
  })

  it('counts a degommage suffered even when the player survived everything else', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      degommage('u2', 'u3'),
      degommage('u2', 'u1'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('arvern_shield')
  })
})

describe('guards and shape', () => {
  it('never counts a self-degommage as a degommage suffered', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u1'),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      degommage('u2', 'u3'),
      degommage('u2', 'u4'),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).toContain('arvern_shield')
  })

  it('returns nothing for an unfinished game', () => {
    const state = buildGameState([started(SEATS_2), degommage('u1', 'u2')])
    expect(state.status).toBe('active')
    expect(detect(state, 'u1', { careerWins: 10, currentStreak: 3 })).toEqual([])
  })

  it('returns nothing for a user who never sat at the table', () => {
    const state = buildGameState([started(SEATS_2), ...villageWin('u1', 'u1')])
    expect(detect(state, 'ghost', { careerWins: 10, currentStreak: 3 })).toEqual([])
  })

  it('returns ids in SEAL_IDS order, without duplicates', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      degommage('u1', 'u4'),
      ...villageWin('u2', 'u1'),
    ])
    const detected = detect(state, 'u1', { careerWins: 10, currentStreak: 3 })
    expect(detected).toEqual(['imperator', 'village_tour', 'first_win', 'decurion', 'rising_tide'])
    expect(new Set(detected).size).toBe(detected.length)
  })
})
