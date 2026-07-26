import { describe, expect, it } from 'vitest'
import {
  ARENA_SOUNDS,
  ARENA_SOUND_IDS,
  MASTER_GAIN,
  OUCH_IDS,
  PAF_DELAY_MS,
  pickOuch,
  soundCue,
  shouldPlay,
  type ArenaSnapshot,
} from './arena-sounds'

function snapshot(hitCount: number, finished: boolean, winnerId: string | null): ArenaSnapshot {
  return { hitCount, finished, winnerId }
}

describe('ARENA_SOUNDS', () => {
  it('ships the three ouch variants plus the paf and the fanfare', () => {
    expect(ARENA_SOUND_IDS).toEqual(['ouch-1', 'ouch-2', 'ouch-3', 'paf', 'fanfare'])
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

  it('holds the ouch longer than the paf', () => {
    expect(ARENA_SOUNDS['ouch-1'].minIntervalMs).toBeGreaterThan(ARENA_SOUNDS.paf.minIntervalMs)
  })
})

describe('pickOuch', () => {
  const GAME = 'e4d0f7aa-1111-4222-8333-444455556666'

  it('only ever returns one of the three shipped variants', () => {
    for (let seq = 0; seq < 200; seq += 1) {
      expect(OUCH_IDS).toContain(pickOuch(GAME, seq))
    }
  })

  it('is deterministic — every phone picks the same yelp for the same hit', () => {
    for (let seq = 0; seq < 50; seq += 1) {
      expect(pickOuch(GAME, seq)).toBe(pickOuch(GAME, seq))
    }
  })

  it('varies from hit to hit rather than repeating one variant forever', () => {
    const drawn = new Set(Array.from({ length: 60 }, (_, seq) => pickOuch(GAME, seq)))
    expect(drawn.size).toBe(3)
  })

  it('gives two different games their own sequence of yelps', () => {
    const a = Array.from({ length: 40 }, (_, seq) => pickOuch(GAME, seq)).join()
    const b = Array.from({ length: 40 }, (_, seq) => pickOuch('99990000-2222-4333-8444-555566667777', seq)).join()
    expect(a).not.toBe(b)
  })

  it('throttles the three variants on one shared clock', () => {
    for (const id of OUCH_IDS) expect(ARENA_SOUNDS[id].throttleKey).toBe('ouch')
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
