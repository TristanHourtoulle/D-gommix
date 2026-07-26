import { describe, expect, it } from 'vitest'
import {
  buildGameState,
  type CharacterId,
  type GameEvent,
  type GameFormat,
  type GameState,
} from '@degommix/game-core'
import { AUGURES_MIN_ELAPSED_SEC, AUGURES_TARGET_DEGOMMAGES, readAugures } from './augures'
import { TRIPLE_RUN, detectLineStamps, takenFromEvents, type StampEvent } from './game-stamps'

const T0 = Date.parse('2026-07-26T20:00:00Z')
const CHARACTERS: readonly CharacterId[] = ['asterix', 'obelix', 'caius_bonus', 'caligula_minus']

function isoAt(seq: number): string {
  return new Date(T0 + seq * 1000).toISOString()
}

function toFormat(count: number): GameFormat {
  if (count === 2 || count === 3 || count === 4) return count
  throw new Error(`Unsupported player count: ${count}`)
}

/** GAME_STARTED seating `userIds`, in order, one character each. */
function start(userIds: readonly string[]): GameEvent {
  return {
    seq: 1,
    type: 'GAME_STARTED',
    actorId: userIds[0] ?? 'a',
    targetId: null,
    payload: {
      players: userIds.map((userId, index) => ({
        userId,
        character: CHARACTERS[index % CHARACTERS.length] ?? 'asterix',
      })),
      format: toFormat(userIds.length),
    },
    createdAt: isoAt(1),
  }
}

function hit(seq: number, actorId: string, targetId: string): GameEvent {
  return { seq, type: 'DEGOMMAGE', actorId, targetId, payload: null, createdAt: isoAt(seq) }
}

function undo(seq: number, targetSeq: number, actorId = 'a'): GameEvent {
  return {
    seq,
    type: 'UNDO',
    actorId,
    targetId: null,
    payload: { targetSeq },
    createdAt: isoAt(seq),
  }
}

/** `count` dégommages from seq 2 on, two players trading blows. */
function trade(count: number): GameEvent[] {
  const events: GameEvent[] = [start(['a', 'b'])]
  for (let index = 0; index < count; index += 1) {
    const seq = index + 2
    events.push(index % 2 === 0 ? hit(seq, 'a', 'b') : hit(seq, 'b', 'a'))
  }
  return events
}

/** Fold a real log through the real reducer — no hand-built GameState. */
function stateOf(events: readonly GameEvent[]): GameState {
  return buildGameState([...events])
}

/** The same log, in the shape `game-stamps.ts` consumes. */
function asStampEvents(events: readonly GameEvent[]): StampEvent[] {
  return events.map((event) => ({
    seq: event.seq,
    type: event.type,
    actorId: event.actorId,
    targetId: event.targetId,
    payload: event.payload,
    at: Date.parse(event.createdAt),
  }))
}

describe('readAugures', () => {
  it('reads an empty game without inventing a single figure', () => {
    const augures = readAugures(stateOf([start(['a', 'b', 'c'])]), 300)

    expect(augures.totalDegommages).toBe(0)
    expect(augures.ratePerMinute).toBeNull()
    expect(augures.punchingBagId).toBeNull()
    expect(augures.bestRun).toBeNull()
    expect(augures.projection).toBeNull()
    expect(augures.tallies).toHaveLength(3)
    expect(augures.tallies.every((tally) => tally.dealt === 0 && tally.taken === 0)).toBe(true)
  })

  it('withholds the rate below the Almanach guard and states it from 120 s on', () => {
    const state = stateOf(trade(5))

    expect(AUGURES_MIN_ELAPSED_SEC).toBe(120)
    expect(readAugures(state, 119).ratePerMinute).toBeNull()
    expect(readAugures(state, 120).ratePerMinute).toBe(2.5)
  })

  it('uses the Almanach formula: dégommages over elapsed minutes', () => {
    const augures = readAugures(stateOf(trade(12)), 240)

    expect(augures.totalDegommages).toBe(12)
    expect(augures.ratePerMinute).toBe(3)
  })

  it('clamps a negative or fractional elapsed time instead of leaking it into a figure', () => {
    const state = stateOf(trade(1))

    const negative = readAugures(state, -5)
    expect(negative.elapsedSec).toBe(0)
    expect(negative.ratePerMinute).toBeNull()
    expect(readAugures(state, 130.9)).toEqual(readAugures(state, 130))
  })

  it('never counts an undone dégommage in any figure', () => {
    const events = [
      start(['a', 'b']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'b'),
      hit(4, 'a', 'b'),
      undo(5, 4),
    ]
    const state = stateOf(events)
    const augures = readAugures(state, 120)

    expect(state.degommageLog).toHaveLength(3)
    expect(augures.totalDegommages).toBe(2)
    expect(augures.tallies.find((tally) => tally.userId === 'a')?.dealt).toBe(2)
    expect(augures.tallies.find((tally) => tally.userId === 'b')?.taken).toBe(2)
  })

  it('names the souffre-douleur on a strict maximum', () => {
    const events = [
      start(['a', 'b', 'c']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'b'),
      hit(4, 'a', 'b'),
      hit(5, 'a', 'c'),
    ]
    expect(readAugures(stateOf(events), 120).punchingBagId).toBe('b')
  })

  it('names nobody when two players share the worst count', () => {
    const events = [
      start(['a', 'b', 'c']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'b'),
      hit(4, 'a', 'c'),
      hit(5, 'a', 'c'),
    ]
    expect(readAugures(stateOf(events), 120).punchingBagId).toBeNull()
  })

  it('names nobody when no pion has been lost yet', () => {
    expect(readAugures(stateOf([start(['a', 'b'])]), 300).punchingBagId).toBeNull()
  })

  it('reads the longest closed run', () => {
    const events = [
      start(['a', 'b', 'c']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      hit(4, 'a', 'b'),
      hit(5, 'b', 'a'),
    ]
    expect(readAugures(stateOf(events), 120).bestRun).toEqual({
      actorId: 'a',
      length: 3,
      isOngoing: false,
    })
  })

  it('flags the run as ongoing when it is the last one', () => {
    const events = [
      start(['a', 'b', 'c']),
      hit(2, 'a', 'b'),
      hit(3, 'b', 'a'),
      hit(4, 'b', 'c'),
      hit(5, 'b', 'a'),
    ]
    expect(readAugures(stateOf(events), 120).bestRun).toEqual({
      actorId: 'b',
      length: 3,
      isOngoing: true,
    })
  })

  it('prefers the later run on a tie, so the reading favors what is happening now', () => {
    const events = [
      start(['a', 'b']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'b'),
      hit(4, 'b', 'a'),
      hit(5, 'b', 'a'),
    ]
    const bestRun = readAugures(stateOf(events), 120).bestRun

    expect(bestRun?.actorId).toBe('b')
    expect(bestRun?.length).toBe(2)
    expect(bestRun?.isOngoing).toBe(true)
  })

  it('calls a game of alternating blows no series at all', () => {
    expect(readAugures(stateOf(trade(4)), 120).bestRun).toBeNull()
  })

  it('lets an undone dégommage neither sustain nor break a run', () => {
    const events = [
      start(['a', 'b', 'c']),
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      hit(4, 'b', 'a'),
      undo(5, 4, 'b'),
      hit(6, 'a', 'b'),
    ]
    expect(readAugures(stateOf(events), 120).bestRun).toEqual({
      actorId: 'a',
      length: 3,
      isOngoing: true,
    })
  })

  it('extrapolates the remaining time against the printed target', () => {
    const augures = readAugures(stateOf(trade(10)), 300)

    expect(augures.totalDegommages).toBe(10)
    expect(augures.ratePerMinute).toBe(2)
    expect(augures.projection).toEqual({
      remainingDegommages: 10,
      remainingSec: 300,
      totalSec: 600,
    })
  })

  it('stops extrapolating once the target is already reached', () => {
    const augures = readAugures(stateOf(trade(AUGURES_TARGET_DEGOMMAGES)), 300)

    expect(augures.totalDegommages).toBe(AUGURES_TARGET_DEGOMMAGES)
    expect(augures.projection).toBeNull()
  })

  it('sorts the tallies by dealt desc, then taken desc, then userId', () => {
    const events = [
      start(['a', 'b', 'c', 'd']),
      hit(2, 'c', 'a'),
      hit(3, 'c', 'a'),
      hit(4, 'c', 'a'),
      hit(5, 'a', 'd'),
      hit(6, 'b', 'd'),
      hit(7, 'a', 'b'),
      hit(8, 'd', 'b'),
    ]
    const augures = readAugures(stateOf(events), 120)

    // c dealt 3, a dealt 2, then b and d dealt 1 and took 2 each → userId asc.
    expect(augures.tallies.map((tally) => tally.userId)).toEqual(['c', 'a', 'b', 'd'])
    expect(augures.tallies.map((tally) => tally.dealt)).toEqual([3, 2, 1, 1])
    expect(augures.tallies.map((tally) => tally.taken)).toEqual([0, 3, 2, 2])
  })

  it('takes « donnés » from the reducer, not from the raw log length', () => {
    const events = [start(['a', 'b']), hit(2, 'a', 'b'), hit(3, 'a', 'b'), undo(4, 3)]
    const state = stateOf(events)
    const dealt = readAugures(state, 120).tallies.find((tally) => tally.userId === 'a')?.dealt

    expect(dealt).toBe(state.players.a?.degommages)
    expect(dealt).toBe(1)
  })

  it('agrees with the moment-stamp detector on the same game', () => {
    // A clean 3-run by `b` with no mirror pair and every actor below
    // CARNAGE_THRESHOLD, so nothing masks the triplé in LINE_STAMP_PRIORITY.
    const events = [
      start(['a', 'b', 'c', 'd']),
      hit(2, 'a', 'c'),
      hit(3, 'b', 'd'),
      hit(4, 'b', 'c'),
      hit(5, 'b', 'a'),
      hit(6, 'd', 'c'),
    ]
    const augures = readAugures(stateOf(events), 600)
    const stampEvents = asStampEvents(events)
    const taken = takenFromEvents(stampEvents)
    const stamps = detectLineStamps(stampEvents)

    for (const tally of augures.tallies) {
      expect(tally.taken).toBe(taken.get(tally.userId) ?? 0)
    }

    const triplerIds = new Set(
      [...stamps]
        .filter(([, id]) => id === 'triple')
        .map(([seq]) => events.find((event) => event.seq === seq)?.actorId)
    )
    expect(augures.bestRun?.length).toBeGreaterThanOrEqual(TRIPLE_RUN)
    expect(triplerIds.size).toBe(1)
    expect(triplerIds.has(augures.bestRun?.actorId)).toBe(true)
  })

  it('is pure: the same state and elapsed time read the same twice', () => {
    const state = stateOf([start(['a', 'b']), hit(2, 'a', 'b'), hit(3, 'a', 'b'), undo(4, 3)])
    const snapshot = JSON.stringify(state.degommageLog)

    expect(readAugures(state, 200)).toEqual(readAugures(state, 200))
    expect(JSON.stringify(state.degommageLog)).toBe(snapshot)
  })

  it('skips a seat the reducer knows nothing about instead of faking a row', () => {
    const state = stateOf([start(['a', 'b'])])
    const withGhost: GameState = { ...state, seats: [...state.seats, 'ghost'] }

    expect(readAugures(withGhost, 300).tallies.map((tally) => tally.userId)).toEqual(['a', 'b'])
  })
})
