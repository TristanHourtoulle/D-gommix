import { describe, expect, it } from 'vitest'
import {
  aggregatePairCounts,
  pickFavoriteVictim,
  pickNemesis,
  type PairCount,
  type RivalryEventRow,
} from './rivalries'

const ME = 'me'

function degommage(
  gameId: string,
  seq: number,
  actorId: string | null,
  targetId: string | null
): RivalryEventRow {
  return { gameId, seq, type: 'DEGOMMAGE', actorId, targetId, payload: {} }
}

function undo(gameId: string, seq: number, payload: unknown): RivalryEventRow {
  return { gameId, seq, type: 'UNDO', actorId: ME, targetId: null, payload }
}

function pair(opponentId: string, dealt: number, taken: number): PairCount {
  return { opponentId, dealt, taken }
}

describe('aggregatePairCounts', () => {
  it('counts dealt and taken separately for one game', () => {
    const rows = [
      degommage('g1', 1, ME, 'obelix'),
      degommage('g1', 2, ME, 'obelix'),
      degommage('g1', 3, 'obelix', ME),
      degommage('g1', 4, ME, 'asterix'),
    ]

    expect(aggregatePairCounts(rows, ME)).toEqual([pair('asterix', 1, 0), pair('obelix', 2, 1)])
  })

  it('excludes a degommage cancelled by an UNDO targeting its seq', () => {
    const rows = [
      degommage('g1', 1, ME, 'obelix'),
      degommage('g1', 2, ME, 'obelix'),
      undo('g1', 3, { targetSeq: 2 }),
    ]

    expect(aggregatePairCounts(rows, ME)).toEqual([pair('obelix', 1, 0)])
  })

  it('scopes undo exclusion to its own game', () => {
    const rows = [
      degommage('g1', 1, ME, 'obelix'),
      undo('g1', 2, { targetSeq: 1 }),
      degommage('g2', 1, ME, 'obelix'),
    ]

    expect(aggregatePairCounts(rows, ME)).toEqual([pair('obelix', 1, 0)])
  })

  it('ignores degommages between two other players', () => {
    const rows = [degommage('g1', 1, 'obelix', 'asterix'), degommage('g1', 2, 'asterix', 'obelix')]

    expect(aggregatePairCounts(rows, ME)).toEqual([])
  })

  it('ignores self-degommages', () => {
    expect(aggregatePairCounts([degommage('g1', 1, ME, ME)], ME)).toEqual([])
  })

  it('ignores degommage rows with a null actor or target', () => {
    const rows = [degommage('g1', 1, null, ME), degommage('g1', 2, ME, null)]

    expect(aggregatePairCounts(rows, ME)).toEqual([])
  })

  it('ignores UNDO rows with a malformed payload', () => {
    const rows = [
      degommage('g1', 1, ME, 'obelix'),
      undo('g1', 2, null),
      undo('g1', 3, {}),
      undo('g1', 4, { targetSeq: 'x' }),
      undo('g1', 5, 'nonsense'),
    ]

    expect(() => aggregatePairCounts(rows, ME)).not.toThrow()
    expect(aggregatePairCounts(rows, ME)).toEqual([pair('obelix', 1, 0)])
  })

  it('returns an empty array when there are no degommages', () => {
    expect(aggregatePairCounts([], ME)).toEqual([])
    expect(aggregatePairCounts([undo('g1', 1, { targetSeq: 0 })], ME)).toEqual([])
  })
})

describe('pickNemesis', () => {
  it('returns null when nobody dégommed the viewer', () => {
    expect(pickNemesis([])).toBeNull()
    expect(pickNemesis([pair('obelix', 5, 0)])).toBeNull()
  })

  it('picks the highest taken count', () => {
    const pairs = [pair('asterix', 9, 2), pair('obelix', 0, 4)]

    expect(pickNemesis(pairs)).toEqual(pair('obelix', 0, 4))
  })

  it('breaks ties on the dealt counter descending, then on opponentId', () => {
    expect(pickNemesis([pair('asterix', 1, 3), pair('obelix', 7, 3)])).toEqual(pair('obelix', 7, 3))
    expect(pickNemesis([pair('obelix', 2, 3), pair('asterix', 2, 3)])).toEqual(pair('asterix', 2, 3))
  })
})

describe('pickFavoriteVictim', () => {
  it('returns null when the viewer never dégommed anybody', () => {
    expect(pickFavoriteVictim([])).toBeNull()
    expect(pickFavoriteVictim([pair('obelix', 0, 6)])).toBeNull()
  })

  it('picks the highest dealt count', () => {
    const pairs = [pair('asterix', 2, 9), pair('obelix', 5, 0)]

    expect(pickFavoriteVictim(pairs)).toEqual(pair('obelix', 5, 0))
  })

  it('breaks ties on the taken counter descending, then on opponentId', () => {
    expect(pickFavoriteVictim([pair('asterix', 3, 1), pair('obelix', 3, 7)])).toEqual(
      pair('obelix', 3, 7)
    )
    expect(pickFavoriteVictim([pair('obelix', 3, 2), pair('asterix', 3, 2)])).toEqual(
      pair('asterix', 3, 2)
    )
  })
})
