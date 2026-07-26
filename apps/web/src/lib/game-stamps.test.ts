import { describe, expect, it } from 'vitest'
import {
  CARNAGE_THRESHOLD,
  SANS_PITIE_WINDOW_MS,
  STAMP_IDS,
  STAMP_META,
  TRIPLE_RUN,
  detectLineStamps,
  detectSummaryStamp,
  takenFromEvents,
  type StampEvent,
} from './game-stamps'

const T0 = Date.parse('2026-07-26T20:00:00Z')

/** A DEGOMMAGE row; `second` is the offset from the start of the game. */
function hit(seq: number, actorId: string, targetId: string, second = seq): StampEvent {
  return { seq, type: 'DEGOMMAGE', actorId, targetId, payload: null, at: T0 + second * 1000 }
}

/** The UNDO row that cancels `targetSeq`. */
function undo(seq: number, targetSeq: number): StampEvent {
  return {
    seq,
    type: 'UNDO',
    actorId: 'a',
    targetId: null,
    payload: { targetSeq },
    at: T0 + seq * 1000,
  }
}

const START: StampEvent = {
  seq: 1,
  type: 'GAME_STARTED',
  actorId: 'a',
  targetId: null,
  payload: null,
  at: T0,
}

describe('detectLineStamps', () => {
  it('stamps « Premier sang » on the first dégommage of the game', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b'), hit(3, 'c', 'd')])
    expect(stamps.get(2)).toBe('premier_sang')
    expect(stamps.get(3)).toBeUndefined()
  })

  it('stamps nothing on a log without dégommages', () => {
    expect(detectLineStamps([START, undo(2, 999)]).size).toBe(0)
  })

  it('moves « Premier sang » to the first dégommage that survives an undo', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b'), undo(3, 2), hit(4, 'c', 'd')])
    expect(stamps.get(2)).toBeUndefined()
    expect(stamps.get(4)).toBe('premier_sang')
  })

  it('stamps « Vengeance ! » when the previous dégommage was the mirror pair', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b'), hit(3, 'b', 'a')])
    expect(stamps.get(3)).toBe('vengeance')
  })

  it('does not stamp « Vengeance ! » when the dégommage it answers was undone', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'c', 'b'),
      undo(4, 3),
      hit(5, 'b', 'c'),
    ])
    expect(stamps.get(5)).toBeUndefined()
  })

  it('stamps « Triplé ! » on the third dégommage in a row by the same player', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b'), hit(3, 'a', 'c'), hit(4, 'a', 'd')])
    expect(stamps.get(2)).toBe('premier_sang')
    expect(stamps.get(3)).toBeUndefined()
    expect(stamps.get(4)).toBe('triple')
  })

  it('stamps « Triplé ! » again on the sixth of a six-long run', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      hit(4, 'a', 'd'),
      hit(5, 'a', 'b'),
      hit(6, 'a', 'c'),
      hit(7, 'a', 'd'),
    ])
    expect(stamps.get(4)).toBe('triple')
    expect(stamps.get(5)).toBe('carnage')
    expect(stamps.get(6)).toBe('sans_pitie')
    expect(stamps.get(7)).toBe('triple')
  })

  it('does not stamp « Triplé ! » when an undo breaks the run', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      undo(4, 3),
      hit(5, 'a', 'd'),
    ])
    expect(stamps.get(5)).toBeUndefined()
  })

  it('stamps « Carnage » on a player’s fourth dégommage, exactly once', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'c', 'b'),
      hit(4, 'a', 'd'),
      hit(5, 'c', 'd'),
      hit(6, 'a', 'e'),
      hit(7, 'c', 'e'),
      hit(8, 'a', 'f'),
      hit(9, 'a', 'g'),
    ])
    expect(stamps.get(8)).toBe('carnage')
    expect(stamps.get(9)).toBeUndefined()
    expect([...stamps.values()].filter((id) => id === 'carnage')).toHaveLength(1)
  })

  it('does not stamp « Carnage » when an undo keeps the player at three', () => {
    const events = [
      START,
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      undo(4, 3),
      hit(5, 'a', 'd'),
      hit(6, 'a', 'e'),
    ]
    const stamps = detectLineStamps(events)
    expect([...stamps.values()]).not.toContain('carnage')
    // The run is unbroken (same actor throughout), so the triplé lands one
    // line later than it would have without the undo.
    expect(stamps.get(6)).toBe('triple')
  })

  it('stamps « Sans pitié » on a second hit of the same target inside the window', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b', 0), hit(3, 'c', 'b', 119)])
    expect(stamps.get(3)).toBe('sans_pitie')
  })

  it('does not stamp « Sans pitié » when the two hits are more than two minutes apart', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b', 0), hit(3, 'c', 'b', 121)])
    expect(stamps.get(3)).toBeUndefined()
  })

  it('does not stamp « Sans pitié » when the earlier hit on that target was undone', () => {
    const stamps = detectLineStamps([START, hit(2, 'a', 'b', 0), undo(3, 2), hit(4, 'c', 'b', 10)])
    expect(stamps.get(4)).toBe('premier_sang')
  })

  it('prints one stamp per line: a Vengeance that is also a « Sans pitié »', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b', 0),
      hit(3, 'b', 'a', 5),
      hit(4, 'a', 'b', 10),
    ])
    expect(stamps.get(4)).toBe('vengeance')
  })

  it('prints one stamp per line: a Carnage that also closes a Triplé', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'c', 'd'),
      hit(4, 'a', 'e'),
      hit(5, 'a', 'f'),
      hit(6, 'a', 'g'),
    ])
    expect(stamps.get(6)).toBe('carnage')
  })

  it('prints one stamp per line: a Carnage that is also a Vengeance', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'b'),
      hit(3, 'a', 'c'),
      hit(4, 'a', 'd'),
      hit(5, 'b', 'a'),
      hit(6, 'a', 'b'),
    ])
    expect(stamps.get(6)).toBe('carnage')
  })

  it('never gives the first surviving dégommage anything but « Premier sang »', () => {
    // It has no predecessor, no run, no earlier hit on its target and a total
    // of one, so no other trigger can physically fire on that line.
    const logs: StampEvent[][] = [
      [START, hit(2, 'a', 'b')],
      [START, hit(2, 'a', 'b'), hit(3, 'b', 'a')],
      [START, hit(2, 'a', 'b'), undo(3, 2), hit(4, 'b', 'a'), hit(5, 'a', 'b')],
    ]
    for (const events of logs) {
      const stamps = detectLineStamps(events)
      expect(stamps.get(Math.min(...stamps.keys()))).toBe('premier_sang')
    }
  })

  it('ignores self-dégommages and rows with a null actor or target', () => {
    const stamps = detectLineStamps([
      START,
      hit(2, 'a', 'a'),
      { seq: 3, type: 'DEGOMMAGE', actorId: null, targetId: 'b', payload: null, at: T0 },
      { seq: 4, type: 'DEGOMMAGE', actorId: 'a', targetId: null, payload: null, at: T0 },
      hit(5, 'a', 'b'),
    ])
    expect(stamps.get(2)).toBeUndefined()
    expect(stamps.get(3)).toBeUndefined()
    expect(stamps.get(4)).toBeUndefined()
    expect(stamps.get(5)).toBe('premier_sang')
  })

  it('reads the log in seq order whatever order the rows arrive in', () => {
    const ordered = [START, hit(2, 'a', 'b'), hit(3, 'b', 'a')]
    expect([...detectLineStamps([...ordered].reverse())]).toEqual([...detectLineStamps(ordered)])
  })

  it('never mutates its input and returns the same result twice', () => {
    const events = [START, hit(2, 'a', 'b'), hit(3, 'b', 'a')]
    const snapshot = JSON.stringify(events)
    const first = detectLineStamps(events)
    const second = detectLineStamps(events)
    expect(JSON.stringify(events)).toBe(snapshot)
    expect([...second]).toEqual([...first])
  })

  it('exposes the thresholds the stamps are tuned on', () => {
    expect(TRIPLE_RUN).toBe(3)
    expect(CARNAGE_THRESHOLD).toBe(4)
    expect(SANS_PITIE_WINDOW_MS).toBe(120_000)
  })
})

describe('takenFromEvents', () => {
  it('counts the dégommages suffered by each player', () => {
    const taken = takenFromEvents([START, hit(2, 'a', 'b'), hit(3, 'c', 'b'), hit(4, 'b', 'a')])
    expect([...taken]).toEqual([
      ['b', 2],
      ['a', 1],
    ])
  })

  it('applies the same undo rule as the rivalries aggregation', () => {
    const taken = takenFromEvents([START, hit(2, 'a', 'b'), hit(3, 'a', 'b'), undo(4, 3)])
    expect(taken.get('b')).toBe(1)
  })
})

describe('detectSummaryStamp', () => {
  it('returns « Remontada » when the winner suffered strictly more than everyone else', () => {
    expect(
      detectSummaryStamp(
        new Map([
          ['a', 3],
          ['b', 1],
        ]),
        'a'
      )
    ).toBe('remontada')
  })

  it('returns null when the winner ties the most-dégommé', () => {
    expect(
      detectSummaryStamp(
        new Map([
          ['a', 2],
          ['b', 2],
        ]),
        'a'
      )
    ).toBeNull()
  })

  it('returns null when someone suffered more than the winner', () => {
    expect(
      detectSummaryStamp(
        new Map([
          ['a', 1],
          ['b', 4],
        ]),
        'a'
      )
    ).toBeNull()
  })

  it('returns null when the winner never lost a pion', () => {
    expect(detectSummaryStamp(new Map([['b', 2]]), 'a')).toBeNull()
  })

  it('returns null for a game without a winner', () => {
    expect(detectSummaryStamp(new Map([['a', 3]]), null)).toBeNull()
  })
})

describe('STAMP_META', () => {
  it('carries the owner-validated wording of every stamp', () => {
    expect(STAMP_META.premier_sang.label).toBe('Premier sang')
    expect(STAMP_META.vengeance.label).toBe('Vengeance !')
    expect(STAMP_META.triple.label).toBe('Triplé !')
    expect(STAMP_META.carnage.label).toBe('Carnage')
    expect(STAMP_META.sans_pitie.label).toBe('Sans pitié')
    expect(STAMP_META.remontada.label).toBe('Remontada')
  })

  it('describes every stamp id exactly once, with a non-empty hint', () => {
    expect(Object.keys(STAMP_META).sort()).toEqual([...STAMP_IDS].sort())
    for (const id of STAMP_IDS) {
      expect(STAMP_META[id].id).toBe(id)
      expect(STAMP_META[id].hint.length).toBeGreaterThan(0)
    }
  })
})
