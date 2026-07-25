import { describe, expect, it } from 'vitest'
import {
  ENDGAME_TEASES,
  ENDGAME_TIMINGS,
  confettiPieces,
  endgameVariant,
  pickTease,
} from './endgame'

describe('endgameVariant', () => {
  it('is « winner » for the winner', () => {
    expect(endgameVariant('u1', 'u1')).toBe('winner')
  })

  it('is « loser » for everybody else while there is a winner', () => {
    expect(endgameVariant('u1', 'u2')).toBe('loser')
  })

  it('is « none » when the game was abandoned', () => {
    expect(endgameVariant(null, 'u1')).toBe('none')
  })
})

describe('ENDGAME_TIMINGS', () => {
  it('matches the validated clocks', () => {
    expect(ENDGAME_TIMINGS.winner.total).toBe(3300)
    expect(ENDGAME_TIMINGS.loser.total).toBe(3050)
    expect(ENDGAME_TIMINGS.winner.counterAt).toBe(2280)
    expect(ENDGAME_TIMINGS.loser.counterAt).toBe(2480)
  })

  it('starts the counter before the sequence ends', () => {
    for (const timing of [ENDGAME_TIMINGS.winner, ENDGAME_TIMINGS.loser]) {
      expect(timing.counterAt).toBeLessThan(timing.total)
    }
  })
})

describe('pickTease', () => {
  it('offers four short lines', () => {
    expect(ENDGAME_TEASES).toHaveLength(4)
    for (const line of ENDGAME_TEASES) expect(line.length).toBeLessThanOrEqual(48)
  })

  it('uses the typographic apostrophe only', () => {
    for (const line of ENDGAME_TEASES) expect(line).not.toContain("'")
  })

  it('is deterministic for a given gameId', () => {
    expect(pickTease('abc-123')).toBe(pickTease('abc-123'))
  })

  it('always returns a line from the list', () => {
    for (let i = 0; i < 200; i++) expect(ENDGAME_TEASES).toContain(pickTease(`game-${i}`))
  })

  it('uses all four lines across 200 games', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickTease(`game-${i}`))
    expect(seen.size).toBe(4)
  })
})

describe('confettiPieces', () => {
  it('produces 24 pieces', () => {
    expect(confettiPieces('g1')).toHaveLength(24)
  })

  it('is deterministic for a given gameId — no hydration mismatch', () => {
    expect(confettiPieces('g1')).toEqual(confettiPieces('g1'))
  })

  it('differs between games', () => {
    expect(confettiPieces('g1')).not.toEqual(confettiPieces('g2'))
  })

  it('cycles the four camp colours', () => {
    const colours = new Set(confettiPieces('g1').map((p) => p.color))
    expect(colours).toEqual(
      new Set(['var(--asterix)', 'var(--obelix)', 'var(--caius)', 'var(--caligula)'])
    )
  })

  it('keeps every piece inside the viewport and on a sane clock', () => {
    for (const piece of confettiPieces('g1')) {
      expect(piece.leftPct).toBeGreaterThanOrEqual(4)
      expect(piece.leftPct).toBeLessThanOrEqual(96)
      expect(piece.durationMs).toBeGreaterThanOrEqual(1000)
      expect(piece.durationMs).toBeLessThanOrEqual(1420)
      expect(piece.delayMs).toBeGreaterThanOrEqual(1450)
      expect(piece.delayMs).toBeLessThanOrEqual(1830)
    }
  })
})
