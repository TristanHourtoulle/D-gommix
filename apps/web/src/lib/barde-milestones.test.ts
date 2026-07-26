import { describe, expect, it } from 'vitest'
import {
  BARDE_DEGOMMAGE_THRESHOLD,
  BARDE_FIVE_MINUTES_MS,
  BARDE_MILESTONES,
  BARDE_MILESTONE_IDS,
  BARDE_PILE_ON_MIN_TOTAL,
  BARDE_REMONTADA_MIN,
  bardeTimeReached,
  bardeTimeRemainingMs,
  detectBardeRows,
  pickBardeLine,
  type BardeMilestoneId,
} from './barde-milestones'
import type { StampEvent } from './game-stamps'

const GAME = 'sim-menhir-4-village'
const T0 = Date.parse('2026-07-26T20:00:00Z')

/** The GAME_STARTED row carrying the seats, in the shape `game-core` emits. */
function gameStarted(seats: readonly string[], seq = 1, atMs = T0): StampEvent {
  return {
    seq,
    type: 'GAME_STARTED',
    actorId: seats[0] ?? null,
    targetId: null,
    payload: {
      players: seats.map((userId) => ({ userId, character: 'asterix' })),
      format: 'village',
    },
    at: atMs,
  }
}

/** A DEGOMMAGE row; `atMs` defaults to one second per `seq`. */
function degommage(
  seq: number,
  actorId: string,
  targetId: string,
  atMs = T0 + seq * 1000
): StampEvent {
  return { seq, type: 'DEGOMMAGE', actorId, targetId, payload: null, at: atMs }
}

/** The UNDO row that cancels `targetSeq`. */
function undo(seq: number, targetSeq: number, atMs = T0 + seq * 1000): StampEvent {
  return { seq, type: 'UNDO', actorId: 'a', targetId: null, payload: { targetSeq }, at: atMs }
}

/** Every row the barde emits for `id`, in anchor order. */
function rowsFor(rows: readonly { id: BardeMilestoneId; anchorSeq: number }[], id: BardeMilestoneId) {
  return rows.filter((row) => row.id === id)
}

describe('the catalog', () => {
  it('holds five unique ids, one non-empty meta each', () => {
    expect(BARDE_MILESTONE_IDS).toHaveLength(5)
    expect(new Set(BARDE_MILESTONE_IDS).size).toBe(5)
    for (const id of BARDE_MILESTONE_IDS) {
      const meta = BARDE_MILESTONES[id]
      expect(meta.id).toBe(id)
      expect(meta.hint.length).toBeGreaterThan(0)
      expect(meta.lines.length).toBeGreaterThan(0)
    }
  })

  it('writes every line with the typographic apostrophe', () => {
    for (const id of BARDE_MILESTONE_IDS) {
      for (const line of BARDE_MILESTONES[id].lines) {
        expect(line).not.toContain("'")
      }
    }
  })
})

describe('pickBardeLine', () => {
  it('is stable per game and varies across games', () => {
    for (const id of BARDE_MILESTONE_IDS) {
      expect(pickBardeLine(GAME, id)).toBe(pickBardeLine(GAME, id))
    }
    const drawn = new Set(
      Array.from({ length: 24 }, (_, i) => pickBardeLine(`game-${i}`, 'dix_degommages'))
    )
    expect(drawn.size).toBeGreaterThan(1)

    // Determinism guard for the detector itself: same log in, same rows out —
    // every phone folds the same events and must land on the same lines.
    const log = [
      gameStarted(['a', 'b', 'c']),
      degommage(2, 'b', 'a'),
      degommage(3, 'c', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'a', 'b'),
      degommage(6, 'a', 'c'),
      degommage(7, 'a', 'b'),
    ]
    expect(detectBardeRows(GAME, log, T0, true)).toEqual(detectBardeRows(GAME, log, T0, true))
    for (const row of detectBardeRows(GAME, log, T0, true)) {
      expect(BARDE_MILESTONES[row.id].lines).toContain(row.text)
    }
    expect(BARDE_DEGOMMAGE_THRESHOLD).toBe(10)
  })

  it('always draws a line of that milestone', () => {
    for (const id of BARDE_MILESTONE_IDS) {
      expect(BARDE_MILESTONES[id].lines).toContain(pickBardeLine(GAME, id))
    }
  })
})

describe('the chrono predicates', () => {
  it('flips at five minutes of server-anchored play', () => {
    expect(bardeTimeReached(T0, 0, T0 + 299_000)).toBe(false)
    expect(bardeTimeRemainingMs(T0, 0, T0 + 299_000)).toBe(1_000)
    expect(bardeTimeReached(T0, 0, T0 + BARDE_FIVE_MINUTES_MS)).toBe(true)
    expect(bardeTimeRemainingMs(T0, 0, T0 + BARDE_FIVE_MINUTES_MS)).toBe(0)
    expect(bardeTimeRemainingMs(T0, 0, T0 + 900_000)).toBe(0)
  })

  it('treats an unknown start as not started', () => {
    expect(bardeTimeReached(null, 0, T0 + 900_000)).toBe(false)
    expect(bardeTimeRemainingMs(null, 0, T0 + 900_000)).toBe(BARDE_FIVE_MINUTES_MS)
    expect(bardeTimeReached(Number.NaN, 0, T0 + 900_000)).toBe(false)
    expect(bardeTimeRemainingMs(Number.NaN, 0, T0 + 900_000)).toBe(BARDE_FIVE_MINUTES_MS)
  })

  it('honours the server clock offset', () => {
    // Phone 30 s behind the server: it still fires at the server's five minutes.
    expect(bardeTimeReached(T0, 30_000, T0 + 270_000)).toBe(true)
    expect(bardeTimeReached(T0, 30_000, T0 + 269_000)).toBe(false)
    expect(bardeTimeRemainingMs(T0, 30_000, T0 + 269_000)).toBe(1_000)
  })
})

describe('detectBardeRows', () => {
  it('says nothing about an empty or silent log', () => {
    expect(detectBardeRows(GAME, [], T0, false)).toEqual([])
    expect(detectBardeRows(GAME, [], T0, true)).toEqual([])
    expect(detectBardeRows(GAME, [gameStarted(['a', 'b'])], T0, false)).toEqual([])
  })

  it('fires « dix dégommages » on the tenth surviving hit, not the ninth', () => {
    const seats = ['a', 'b', 'c', 'd']
    const pairs: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'b'],
      ['b', 'c'],
    ]
    const log = [
      gameStarted(seats),
      ...pairs.map(([actor, target], i) => degommage(i + 2, actor, target)),
    ]
    const ten = rowsFor(detectBardeRows(GAME, log, T0, false), 'dix_degommages')
    expect(ten).toHaveLength(1)
    expect(ten[0]?.anchorSeq).toBe(11)

    const nine = detectBardeRows(GAME, log.slice(0, -1), T0, false)
    expect(rowsFor(nine, 'dix_degommages')).toHaveLength(0)
  })

  it('does not count an undone dégommage towards the ten', () => {
    const seats = ['a', 'b', 'c', 'd']
    const pairs: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'b'],
      ['b', 'c'],
    ]
    const hits = pairs.map(([actor, target], i) => degommage(i + 2, actor, target))
    // seq 12 cancels seq 5, so only nine dégommages survive.
    const undone = [gameStarted(seats), ...hits, undo(12, 5)]
    expect(rowsFor(detectBardeRows(GAME, undone, T0, false), 'dix_degommages')).toHaveLength(0)

    const revived = [...undone, degommage(13, 'c', 'd')]
    const ten = rowsFor(detectBardeRows(GAME, revived, T0, false), 'dix_degommages')
    expect(ten).toHaveLength(1)
    expect(ten[0]?.anchorSeq).toBe(13)
  })

  it('fires « égalité parfaite » only when every seat has suffered as much', () => {
    const even = [gameStarted(['a', 'b']), degommage(2, 'a', 'b'), degommage(3, 'b', 'a')]
    const equal = rowsFor(detectBardeRows(GAME, even, T0, false), 'egalite_parfaite')
    expect(equal).toHaveLength(1)
    expect(equal[0]?.anchorSeq).toBe(3)

    const uneven = [gameStarted(['a', 'b']), degommage(2, 'a', 'b')]
    expect(rowsFor(detectBardeRows(GAME, uneven, T0, false), 'egalite_parfaite')).toHaveLength(0)
  })

  it('does not call a scoreless game an « égalité parfaite »', () => {
    const log = [gameStarted(['a', 'b']), degommage(2, 'a', 'b'), undo(3, 2)]
    expect(rowsFor(detectBardeRows(GAME, log, T0, false), 'egalite_parfaite')).toHaveLength(0)
  })

  it('fires « remontada » only on a player holding both strict maxima', () => {
    const seats = ['a', 'b', 'c']
    const log = [
      gameStarted(seats),
      degommage(2, 'b', 'a'),
      degommage(3, 'c', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'a', 'b'),
      degommage(6, 'a', 'c'),
      degommage(7, 'a', 'b'),
    ]
    const rows = rowsFor(detectBardeRows(GAME, log, T0, false), 'remontada_en_cours')
    expect(rows).toHaveLength(1)
    // a: taken 3 (strict max), dealt 3 (strict max) — both ≥ BARDE_REMONTADA_MIN.
    expect(BARDE_REMONTADA_MIN).toBe(2)
    expect(rows[0]?.anchorSeq).toBe(7)

    // A tie on the suffered maximum makes the sentence false.
    const tied = [
      gameStarted(['a', 'b']),
      degommage(2, 'b', 'a'),
      degommage(3, 'b', 'a'),
      degommage(4, 'a', 'b'),
      degommage(5, 'a', 'b'),
    ]
    expect(rowsFor(detectBardeRows(GAME, tied, T0, false), 'remontada_en_cours')).toHaveLength(0)

    // The top sufferer is not the top dealer.
    const oneWay = [
      gameStarted(seats),
      degommage(2, 'b', 'a'),
      degommage(3, 'b', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'a', 'b'),
    ]
    expect(rowsFor(detectBardeRows(GAME, oneWay, T0, false), 'remontada_en_cours')).toHaveLength(0)
  })

  it('fires « tous sur un » on a strict majority of at least six hits', () => {
    const seats = ['a', 'b', 'c']
    const pileOn = [
      gameStarted(seats),
      degommage(2, 'b', 'a'),
      degommage(3, 'c', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'c', 'a'),
      degommage(6, 'a', 'b'),
      degommage(7, 'a', 'c'),
    ]
    const rows = rowsFor(detectBardeRows(GAME, pileOn, T0, false), 'tous_sur_un')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchorSeq).toBe(7)

    // 3 of 6 is half, not strictly more than half.
    const half = [
      gameStarted(seats),
      degommage(2, 'b', 'a'),
      degommage(3, 'b', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'a', 'b'),
      degommage(6, 'a', 'c'),
      degommage(7, 'a', 'b'),
    ]
    expect(rowsFor(detectBardeRows(GAME, half, T0, false), 'tous_sur_un')).toHaveLength(0)

    // 3 of 5 is a majority, but below the noise floor.
    const tooEarly = [
      gameStarted(seats),
      degommage(2, 'b', 'a'),
      degommage(3, 'b', 'a'),
      degommage(4, 'b', 'a'),
      degommage(5, 'a', 'b'),
      degommage(6, 'a', 'c'),
    ]
    expect(BARDE_PILE_ON_MIN_TOTAL).toBe(6)
    expect(rowsFor(detectBardeRows(GAME, tooEarly, T0, false), 'tous_sur_un')).toHaveLength(0)
  })

  it('fires each milestone at most once, however long its predicate holds', () => {
    const seats = ['a', 'b']
    const hits = Array.from({ length: 20 }, (_, i) =>
      degommage(i + 2, i % 2 === 0 ? 'a' : 'b', i % 2 === 0 ? 'b' : 'a')
    )
    const rows = detectBardeRows(GAME, [gameStarted(seats), ...hits], T0, true)
    for (const id of BARDE_MILESTONE_IDS) {
      expect(rowsFor(rows, id).length).toBeLessThanOrEqual(1)
    }
    expect(new Set(rows.map((row) => row.anchorSeq)).size).toBe(rows.length)
  })

  it('emits one row per hit and re-tests the displaced milestone later', () => {
    const seats = ['a', 'b']
    const log = [
      gameStarted(seats),
      // Five on b, then five on a: the counts only level out on the tenth hit,
      // where « dix dégommages » and « égalité parfaite » both start to hold.
      degommage(2, 'a', 'b'),
      degommage(3, 'a', 'b'),
      degommage(4, 'a', 'b'),
      degommage(5, 'a', 'b'),
      degommage(6, 'a', 'b'),
      degommage(7, 'b', 'a'),
      degommage(8, 'b', 'a'),
      degommage(9, 'b', 'a'),
      degommage(10, 'b', 'a'),
      degommage(11, 'b', 'a'),
      degommage(12, 'a', 'b'),
      degommage(13, 'b', 'a'),
    ]
    const rows = detectBardeRows(GAME, log, T0, false)
    const byAnchor = new Map(rows.map((row) => [row.anchorSeq, row.id]))
    expect(byAnchor.get(11)).toBe('dix_degommages')
    // Displaced at seq 11 by priority, it fires at the next hit where it holds.
    expect(byAnchor.get(13)).toBe('egalite_parfaite')
    expect(new Set(rows.map((row) => row.anchorSeq)).size).toBe(rows.length)
  })

  it('skips the seat-dependent milestones when the log has no GAME_STARTED', () => {
    const hits = Array.from({ length: 10 }, (_, i) => degommage(i + 2, 'b', 'a'))
    const rows = detectBardeRows(GAME, hits, T0, false)
    expect(rows.map((row) => row.id)).toEqual(['dix_degommages'])
    expect(rows[0]?.anchorSeq).toBe(11)
  })

  it('anchors « cinq minutes » on the last event inside the window', () => {
    const inWindow = [
      gameStarted(['a', 'b', 'c'], 1, T0),
      degommage(2, 'a', 'b', T0 + 60_000),
      degommage(3, 'a', 'c', T0 + 120_000),
      degommage(4, 'a', 'b', T0 + 301_000),
    ]
    const rows = rowsFor(detectBardeRows(GAME, inWindow, T0, true), 'cinq_minutes')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchorSeq).toBe(3)
    expect(rowsFor(detectBardeRows(GAME, inWindow, T0, false), 'cinq_minutes')).toHaveLength(0)

    // The window's last seq is already claimed by an event-anchored milestone,
    // so the clock line yields and takes the next unclaimed seq.
    const claimed = [
      gameStarted(['a', 'b'], 1, T0),
      degommage(2, 'a', 'b', T0 + 60_000),
      degommage(3, 'b', 'a', T0 + 120_000),
      degommage(4, 'a', 'b', T0 + 400_000),
    ]
    const claimedRows = detectBardeRows(GAME, claimed, T0, true)
    expect(claimedRows.find((row) => row.id === 'egalite_parfaite')?.anchorSeq).toBe(3)
    expect(claimedRows.find((row) => row.id === 'cinq_minutes')?.anchorSeq).toBe(4)

    // Same collision, but the log runs out: it anchors past the last seq.
    const exhausted = claimed.slice(0, 3)
    const exhaustedRows = detectBardeRows(GAME, exhausted, T0, true)
    expect(exhaustedRows.find((row) => row.id === 'cinq_minutes')?.anchorSeq).toBe(4)

    // Every event is past the window: it anchors on the lowest seq of the log.
    const late = [degommage(5, 'a', 'b', T0 + 400_000), degommage(6, 'a', 'b', T0 + 410_000)]
    expect(rowsFor(detectBardeRows(GAME, late, T0, true), 'cinq_minutes')[0]?.anchorSeq).toBe(5)
  })
})
