import { beforeEach, describe, expect, it } from 'vitest'
import { buildGameState } from './reducer'
import {
  ARVERN_SHIELD_MIN_GAME_DEGOMMAGES,
  AVENGER_VENGEANCES,
  CAMP_CHIEF_HOSTED_GAMES,
  CARNAGE_MASK_THRESHOLD,
  CENTURION_DEGOMMAGES,
  COLLECTOR_CHARACTERS,
  countVengeancesByActor,
  detectSeals,
  GOLDEN_BOAR_MIN_RANKED,
  MARATHON_MIN_MS,
  MENHIR_MIN_TAKEN,
  SEAL_IDS,
  TOUTATIS_BOLT_MAX_MS,
  UNBEATEN_MIN_VILLAGE_GAMES,
  isSealId,
  type MonthRecord,
  type SealDetectionInput,
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

/**
 * Everything `detectSeals` takes beyond the game itself. Defaulted to the
 * NEUTRAL values the ws-server passes for a seal it skips (plan 039
 * § Architecture decision 4), so an omitted field can never award anything.
 */
type DetectExtras = Partial<Omit<SealDetectionInput, 'userId' | 'state'>>

const detect = (state: GameState, userId: string, extras: DetectExtras = {}): SealId[] =>
  detectSeals({
    userId,
    state,
    careerWins: extras.careerWins ?? 1,
    currentStreak: extras.currentStreak ?? 1,
    durationMs: extras.durationMs ?? null,
    careerDegommages: extras.careerDegommages ?? 0,
    careerCharacterWins: extras.careerCharacterWins ?? 0,
    hostedFinishedGames: extras.hostedFinishedGames ?? 0,
    isHost: extras.isHost ?? false,
    reigningChampionId: extras.reigningChampionId ?? null,
    lastCompletedMonth: extras.lastCompletedMonth ?? null,
  })

/** A perfect month: `wins` of `villageGames`, top dégommeur, two players ranked. */
const month = (record: Partial<MonthRecord> = {}): MonthRecord => ({
  villageGames: record.villageGames ?? UNBEATEN_MIN_VILLAGE_GAMES,
  wins: record.wins ?? UNBEATEN_MIN_VILLAGE_GAMES,
  degommages: record.degommages ?? 12,
  isTopDegommeur: record.isTopDegommeur ?? true,
  rankedPlayers: record.rankedPlayers ?? GOLDEN_BOAR_MIN_RANKED,
})

describe('isSealId', () => {
  it('accepts every catalog id and rejects anything else', () => {
    for (const id of SEAL_IDS) expect(isSealId(id)).toBe(true)
    expect(isSealId('nope')).toBe(false)
    expect(isSealId(undefined)).toBe(false)
    expect(isSealId(42)).toBe(false)
  })

  it('carries the sixteen seals of plans 033 and 039, in board order', () => {
    expect(SEAL_IDS).toHaveLength(16)
    expect(new Set(SEAL_IDS).size).toBe(SEAL_IDS.length)
    expect(SEAL_IDS.slice(0, 6)).toEqual([
      'imperator',
      'village_tour',
      'first_win',
      'decurion',
      'rising_tide',
      'arvern_shield',
    ])
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

// ---------------------------------------------------------------------------
// Plan 039 — second wave
// ---------------------------------------------------------------------------

/** A 4-seat village win by `u2` in which `u1` absorbs `count` dégommages. */
const beatenUp = (count: number, tail: GameEvent[] = []): GameState => {
  const hits = Array.from({ length: count }, (_, index) =>
    degommage(index % 2 === 0 ? 'u2' : 'u3', 'u1')
  )
  return buildGameState([started(SEATS_4), ...hits, ...tail, ...villageWin('u2', 'u2')])
}

/** A 2-seat village win by `u1`, who dealt exactly one dégommage. */
const wonGame = (): GameState =>
  buildGameState([started(SEATS_2), degommage('u1', 'u2'), ...villageWin('u1', 'u1')])

/**
 * `count` alternating hits (u1→u2, u2→u1, …) after `lead`, in a 4-seat game
 * closed by a village win for u3.
 */
const pingPong = (count: number, lead: GameEvent[] = []): GameState => {
  const hits = Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? degommage('u1', 'u2') : degommage('u2', 'u1')
  )
  return buildGameState([started(SEATS_4), ...lead, ...hits, ...villageWin('u3', 'u3')])
}

describe('menhir', () => {
  it('is earned by a player who absorbed ten dégommages and reached the village', () => {
    const state = beatenUp(MENHIR_MIN_TAKEN)
    expect(state.players['u1']?.inGame).toBe(true)
    expect(detect(state, 'u1')).toContain('menhir')
  })

  it('is not earned when one of the ten was undone', () => {
    const nine = Array.from({ length: MENHIR_MIN_TAKEN - 1 }, (_, index) =>
      degommage(index % 2 === 0 ? 'u2' : 'u3', 'u1')
    )
    const cancelled = degommage('u2', 'u1')
    const state = buildGameState([
      started(SEATS_4),
      ...nine,
      cancelled,
      undo('u2', cancelled.seq),
      ...villageWin('u2', 'u2'),
    ])
    expect(detect(state, 'u1')).not.toContain('menhir')
  })

  it('is not earned when the game was aborted rather than finished', () => {
    const hits = Array.from({ length: MENHIR_MIN_TAKEN }, (_, index) =>
      degommage(index % 2 === 0 ? 'u2' : 'u3', 'u1')
    )
    const state = buildGameState([started(SEATS_4), ...hits, ...totalAbandon('u2', 'u3')])
    expect(detect(state, 'u1')).not.toContain('menhir')
  })

  it('is not earned by a player who quit before the end', () => {
    const state = beatenUp(MENHIR_MIN_TAKEN, [quit('u1')])
    expect(state.players['u1']?.inGame).toBe(false)
    expect(detect(state, 'u1')).not.toContain('menhir')
  })

  it('is not earned one dégommage short of the threshold', () => {
    expect(detect(beatenUp(MENHIR_MIN_TAKEN - 1), 'u1')).not.toContain('menhir')
  })
})

describe('tempo seals', () => {
  it('awards toutatis_bolt strictly under the bound and not on it', () => {
    expect(detect(wonGame(), 'u1', { durationMs: TOUTATIS_BOLT_MAX_MS - 1 })).toContain(
      'toutatis_bolt'
    )
    resetSeq()
    expect(detect(wonGame(), 'u1', { durationMs: TOUTATIS_BOLT_MAX_MS })).not.toContain(
      'toutatis_bolt'
    )
  })

  it('awards marathon strictly over the bound and not on it', () => {
    expect(detect(wonGame(), 'u1', { durationMs: MARATHON_MIN_MS + 1 })).toContain('marathon')
    resetSeq()
    expect(detect(wonGame(), 'u1', { durationMs: MARATHON_MIN_MS })).not.toContain('marathon')
  })

  it('awards neither when the caller has no clock for the game', () => {
    const detected = detect(wonGame(), 'u1', { durationMs: null })
    expect(detected).not.toContain('toutatis_bolt')
    expect(detected).not.toContain('marathon')
  })

  it('gives the tempo seals to the winner only', () => {
    const detected = detect(wonGame(), 'u2', { durationMs: 60_000 })
    expect(detected).not.toContain('toutatis_bolt')
  })

  it('is not earned in an aborted game, however fast', () => {
    const state = buildGameState([started(SEATS_2), ...totalAbandon('u1', 'u2')])
    expect(detect(state, 'u1', { durationMs: 1_000 })).not.toContain('toutatis_bolt')
  })
})

describe('champion_slayer', () => {
  const won4 = (): GameState => buildGameState([started(SEATS_4), ...villageWin('u1', 'u1')])

  it('is earned when the reigning champion sat at this table and lost', () => {
    expect(detect(won4(), 'u1', { reigningChampionId: 'u2' })).toContain('champion_slayer')
  })

  it('is not earned by the reigning champion themselves', () => {
    expect(detect(won4(), 'u1', { reigningChampionId: 'u1' })).not.toContain('champion_slayer')
  })

  it('is not earned when the champion did not play this game', () => {
    expect(detect(won4(), 'u1', { reigningChampionId: 'outsider' })).not.toContain(
      'champion_slayer'
    )
  })

  it('is not earned when no month has crowned anyone yet', () => {
    expect(detect(won4(), 'u1', { reigningChampionId: null })).not.toContain('champion_slayer')
  })
})

describe('collector', () => {
  it('needs a win with each of the four characters', () => {
    expect(
      detect(wonGame(), 'u1', { careerCharacterWins: COLLECTOR_CHARACTERS - 1 })
    ).not.toContain('collector')
    resetSeq()
    expect(detect(wonGame(), 'u1', { careerCharacterWins: COLLECTOR_CHARACTERS })).toContain(
      'collector'
    )
  })

  it('is engraved on a game the player won, never on one they lost', () => {
    expect(detect(wonGame(), 'u2', { careerCharacterWins: COLLECTOR_CHARACTERS })).not.toContain(
      'collector'
    )
  })
})

describe('centurion', () => {
  it('needs the hundredth dégommage and a hit in this very game', () => {
    expect(detect(wonGame(), 'u1', { careerDegommages: CENTURION_DEGOMMAGES - 1 })).not.toContain(
      'centurion'
    )
    resetSeq()
    expect(detect(wonGame(), 'u1', { careerDegommages: CENTURION_DEGOMMAGES })).toContain(
      'centurion'
    )
  })

  it('is not engraved on a game the player merely sat in (provenance rule)', () => {
    expect(detect(wonGame(), 'u2', { careerDegommages: CENTURION_DEGOMMAGES })).not.toContain(
      'centurion'
    )
  })

  it('ignores a dégommage that was undone', () => {
    const hit = degommage('u1', 'u2')
    const state = buildGameState([
      started(SEATS_2),
      hit,
      undo('u1', hit.seq),
      ...villageWin('u1', 'u1'),
    ])
    expect(detect(state, 'u1', { careerDegommages: CENTURION_DEGOMMAGES })).not.toContain(
      'centurion'
    )
  })
})

describe('avenger', () => {
  it('is earned on the third printed vengeance and not on the second', () => {
    expect(detect(pingPong(2 * AVENGER_VENGEANCES), 'u2')).toContain('avenger')
    resetSeq()
    expect(detect(pingPong(2 * (AVENGER_VENGEANCES - 1)), 'u2')).not.toContain('avenger')
  })

  it('does not count the hit that prints « Carnage » instead of « Vengeance ! »', () => {
    // u2 opens on u3, so u2's third vengeance is also their fourth surviving
    // dégommage: the journal prints « Carnage » on that line (carnage outranks
    // vengeance in LINE_STAMP_PRIORITY), so « Le Vengeur » must not count it.
    const state = pingPong(2 * AVENGER_VENGEANCES, [degommage('u2', 'u3')])
    expect(countVengeancesByActor(state).get('u2')).toBe(AVENGER_VENGEANCES - 1)
    expect(detect(state, 'u2')).not.toContain('avenger')
  })

  it('stops counting a vengeance whose answered hit was undone', () => {
    const first = degommage('u1', 'u2')
    const second = degommage('u2', 'u1')
    const third = degommage('u1', 'u2')
    const fourth = degommage('u2', 'u1')
    const fifth = degommage('u1', 'u2')
    const sixth = degommage('u2', 'u1')
    const state = buildGameState([
      started(SEATS_4),
      first,
      second,
      third,
      fourth,
      fifth,
      sixth,
      undo('u2', fourth.seq),
      ...villageWin('u3', 'u3'),
    ])
    expect(countVengeancesByActor(state).get('u2')).toBe(2)
    expect(detect(state, 'u2')).not.toContain('avenger')
  })

  it('reports nothing on an empty log', () => {
    const state = buildGameState([started(SEATS_2), ...villageWin('u1', 'u1')])
    expect(countVengeancesByActor(state).size).toBe(0)
  })

  it('never treats a third player’s hit as the answered one', () => {
    const state = buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u3', 'u2'),
      degommage('u2', 'u1'),
      ...villageWin('u3', 'u3'),
    ])
    expect(countVengeancesByActor(state).get('u2')).toBeUndefined()
  })
})

describe('camp_chief', () => {
  it('is earned by the host of the tenth game brought to the village', () => {
    expect(
      detect(wonGame(), 'u1', { isHost: true, hostedFinishedGames: CAMP_CHIEF_HOSTED_GAMES })
    ).toContain('camp_chief')
  })

  it('is not earned one game short', () => {
    expect(
      detect(wonGame(), 'u1', { isHost: true, hostedFinishedGames: CAMP_CHIEF_HOSTED_GAMES - 1 })
    ).not.toContain('camp_chief')
  })

  it('is not earned by a guest, whatever their own hosting record', () => {
    expect(
      detect(wonGame(), 'u1', { isHost: false, hostedFinishedGames: CAMP_CHIEF_HOSTED_GAMES })
    ).not.toContain('camp_chief')
  })
})

describe('month seals', () => {
  it('awards unbeaten on a month won end to end', () => {
    expect(detect(wonGame(), 'u1', { lastCompletedMonth: month() })).toContain('unbeaten')
  })

  it('is not awarded when one village game of the month was lost', () => {
    expect(
      detect(wonGame(), 'u1', {
        lastCompletedMonth: month({ wins: UNBEATEN_MIN_VILLAGE_GAMES - 1 }),
      })
    ).not.toContain('unbeaten')
  })

  it('is not awarded below the minimum number of village games', () => {
    expect(
      detect(wonGame(), 'u1', {
        lastCompletedMonth: month({
          villageGames: UNBEATEN_MIN_VILLAGE_GAMES - 1,
          wins: UNBEATEN_MIN_VILLAGE_GAMES - 1,
        }),
      })
    ).not.toContain('unbeaten')
  })

  it('awards golden_boar to a strict top dégommeur in a ranked month', () => {
    expect(detect(wonGame(), 'u1', { lastCompletedMonth: month() })).toContain('golden_boar')
  })

  it('is not awarded to a circle of one', () => {
    expect(
      detect(wonGame(), 'u1', {
        lastCompletedMonth: month({ rankedPlayers: GOLDEN_BOAR_MIN_RANKED - 1 }),
      })
    ).not.toContain('golden_boar')
  })

  it('is not awarded on a tie (the caller reports no strict top dégommeur)', () => {
    expect(
      detect(wonGame(), 'u1', { lastCompletedMonth: month({ isTopDegommeur: false }) })
    ).not.toContain('golden_boar')
  })

  it('is not awarded for a month without a single dégommage', () => {
    expect(detect(wonGame(), 'u1', { lastCompletedMonth: month({ degommages: 0 }) })).not.toContain(
      'golden_boar'
    )
  })

  it('awards neither month seal when the player has no completed month yet', () => {
    const detected = detect(wonGame(), 'u1', { lastCompletedMonth: null })
    expect(detected).not.toContain('unbeaten')
    expect(detected).not.toContain('golden_boar')
  })
})

describe('the sixteen together', () => {
  /** A 4-seat village win by u1 who dégomma every opponent and was never hit. */
  const grandSlam = (): GameState =>
    buildGameState([
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u1', 'u3'),
      degommage('u1', 'u4'),
      ...villageWin('u2', 'u1'),
    ])

  it('returns every fired seal in SEAL_IDS order, without duplicates', () => {
    const detected = detect(grandSlam(), 'u1', {
      careerWins: 10,
      currentStreak: 3,
      durationMs: 1_000,
      careerDegommages: CENTURION_DEGOMMAGES,
      careerCharacterWins: COLLECTOR_CHARACTERS,
      hostedFinishedGames: CAMP_CHIEF_HOSTED_GAMES,
      isHost: true,
      reigningChampionId: 'u2',
      lastCompletedMonth: month(),
    })
    expect(detected).toEqual([
      'imperator',
      'village_tour',
      'first_win',
      'decurion',
      'rising_tide',
      'toutatis_bolt',
      'champion_slayer',
      'collector',
      'centurion',
      'camp_chief',
      'unbeaten',
      'golden_boar',
    ])
    expect(new Set(detected).size).toBe(detected.length)
  })

  it('reproduces the plan-033 verdict exactly on neutral inputs', () => {
    // The regression that makes plan 039 § Architecture decision 4 safe: when
    // the ws-server skips a query for a seal the player already holds, it passes
    // 0 / null / false — and no threshold can be met with those.
    const detected = detectSeals({
      userId: 'u1',
      state: grandSlam(),
      careerWins: 10,
      currentStreak: 3,
      durationMs: null,
      careerDegommages: 0,
      careerCharacterWins: 0,
      hostedFinishedGames: 0,
      isHost: false,
      reigningChampionId: null,
      lastCompletedMonth: null,
    })
    expect(detected).toEqual(['imperator', 'village_tour', 'first_win', 'decurion', 'rising_tide'])
  })

  it('leaves the carnage mask threshold aligned with the printed stamp rule', () => {
    // Pinned end to end by apps/web/src/lib/game-stamps.test.ts (step 3).
    expect(CARNAGE_MASK_THRESHOLD).toBe(4)
  })
})
