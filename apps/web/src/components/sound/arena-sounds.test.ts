import { describe, expect, it } from 'vitest'
import {
  ARENA_SOUNDS,
  ARENA_SOUND_IDS,
  MASTER_GAIN,
  PAF_DELAY_MS,
  soundCue,
  shouldPlay,
  type ArenaSnapshot,
} from './arena-sounds'

function snapshot(hitCount: number, finished: boolean, winnerId: string | null): ArenaSnapshot {
  return { hitCount, finished, winnerId }
}

describe('ARENA_SOUNDS', () => {
  it('ships exactly three sounds', () => {
    expect(ARENA_SOUND_IDS).toEqual(['carnyx', 'paf', 'fanfare'])
  })

  it('points every sound at a public /sounds/*.m4a file', () => {
    for (const id of ARENA_SOUND_IDS) {
      expect(ARENA_SOUNDS[id].url).toBe(`/sounds/${id}.m4a`)
    }
  })

  it('keeps the master gain modest', () => {
    expect(MASTER_GAIN).toBeGreaterThan(0)
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.4)
  })

  it('lines the paf up with the hit stamp (globals.css starts it at 40ms)', () => {
    expect(PAF_DELAY_MS).toBe(40)
  })

  it('gives every sound a minimum interval', () => {
    for (const id of ARENA_SOUND_IDS) expect(ARENA_SOUNDS[id].minIntervalMs).toBeGreaterThan(0)
  })
})

describe('shouldPlay', () => {
  it('plays when the sound was never played', () => {
    expect(shouldPlay('paf', 1_000, null)).toBe(true)
  })

  it('drops a repeat inside the minimum interval', () => {
    expect(shouldPlay('paf', 1_100, 1_000)).toBe(false)
  })

  it('plays again once the interval has passed', () => {
    expect(shouldPlay('paf', 1_000 + ARENA_SOUNDS.paf.minIntervalMs, 1_000)).toBe(true)
  })

  it('holds the carnyx longer than the paf', () => {
    expect(ARENA_SOUNDS.carnyx.minIntervalMs).toBeGreaterThan(ARENA_SOUNDS.paf.minIntervalMs)
  })
})

describe('soundCue', () => {
  it('is silent on the first snapshot — a backlog is history, not an event', () => {
    expect(soundCue(null, snapshot(7, false, null))).toBe('none')
  })

  it('fires the hit cue when the append-only log grows', () => {
    expect(soundCue(snapshot(2, false, null), snapshot(3, false, null))).toBe('hit')
  })

  it('is silent on an undo — the log never shrinks, so nothing changes', () => {
    expect(soundCue(snapshot(3, false, null), snapshot(3, false, null))).toBe('none')
  })

  it('fires once per batch, however many entries arrived', () => {
    expect(soundCue(snapshot(1, false, null), snapshot(4, false, null))).toBe('hit')
  })

  it('fires the endgame cue on the finish transition with a winner', () => {
    expect(soundCue(snapshot(5, false, null), snapshot(5, true, 'u1'))).toBe('endgame')
  })

  it('stays silent when the game ends without a winner', () => {
    expect(soundCue(snapshot(5, false, null), snapshot(5, true, null))).toBe('none')
  })

  it('is silent when mounting straight into a finished game', () => {
    expect(soundCue(null, snapshot(9, true, 'u1'))).toBe('none')
  })

  it('is silent on every later render of an already finished game', () => {
    expect(soundCue(snapshot(5, true, 'u1'), snapshot(5, true, 'u1'))).toBe('none')
  })

  it('prefers the endgame cue when both changed in one batch', () => {
    expect(soundCue(snapshot(5, false, null), snapshot(6, true, 'u1'))).toBe('endgame')
  })
})
