import { describe, expect, it } from 'vitest'
import { buildGameState, type GameEvent, type GameFormat, type GameState } from '@degommix/game-core'
import { generateTimeline, stepDelayMs, type SimOptions, type SimScenario } from './timeline'

const SEEDS = ['menhir', 'sanglier', 'potion', 'carnyx', 'bouclier'] as const
const COUNTS: readonly GameFormat[] = [2, 3, 4] as const
const SCENARIOS: readonly SimScenario[] = ['village', 'abandon_total', 'remontada'] as const

function everyCombination(): SimOptions[] {
  const all: SimOptions[] = []
  for (const seed of SEEDS) {
    for (const playerCount of COUNTS) {
      for (const scenario of SCENARIOS) all.push({ seed, playerCount, scenario })
    }
  }
  return all
}

function degommagesOf(events: readonly GameEvent[]): Extract<GameEvent, { type: 'DEGOMMAGE' }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: 'DEGOMMAGE' }> => {
    return event.type === 'DEGOMMAGE'
  })
}

/** Raw dégommage tally over the first `count` dégommages, ignoring undos. */
function leaderAt(events: readonly GameEvent[], count: number): string | null {
  const tally = new Map<string, number>()
  for (const event of degommagesOf(events).slice(0, count)) {
    tally.set(event.actorId, (tally.get(event.actorId) ?? 0) + 1)
  }
  let leader: string | null = null
  let best = -1
  for (const [actorId, total] of tally) {
    if (total > best) {
      best = total
      leader = actorId
    }
  }
  return leader
}

function finalState(events: readonly GameEvent[]): GameState {
  return buildGameState([...events])
}

describe('generateTimeline', () => {
  it('is deterministic for every seed, player count and scenario', () => {
    for (const options of everyCombination()) {
      expect(generateTimeline(options)).toEqual(generateTimeline(options))
    }
  })

  it('produces a different game for a different seed', () => {
    for (const playerCount of COUNTS) {
      for (const scenario of SCENARIOS) {
        const first = generateTimeline({ seed: 'menhir', playerCount, scenario })
        const other = generateTimeline({ seed: 'sanglier', playerCount, scenario })
        expect(other.events).not.toEqual(first.events)
      }
    }
  })

  it('produces a different game id and seat count per player count', () => {
    const duo = generateTimeline({ seed: 'menhir', playerCount: 2, scenario: 'village' })
    const quatuor = generateTimeline({ seed: 'menhir', playerCount: 4, scenario: 'village' })

    expect(duo.gameId).not.toBe(quatuor.gameId)
    expect(duo.gameId).toBe('sim-menhir-2-village')
    expect(duo.players).toHaveLength(2)
    expect(quatuor.players).toHaveLength(4)
    expect(finalState(duo.events).seats).toHaveLength(2)
    expect(finalState(quatuor.events).seats).toHaveLength(4)
  })

  it('emits a log the reducer accepts whole', () => {
    for (const options of everyCombination()) {
      const timeline = generateTimeline(options)
      expect(() => finalState(timeline.events)).not.toThrow()
    }
  })

  it('emits a log the reducer accepts at every prefix', () => {
    for (const options of everyCombination()) {
      const { events } = generateTimeline(options)
      for (let i = 1; i <= events.length; i++) {
        expect(() => buildGameState(events.slice(0, i))).not.toThrow()
      }
    }
  })

  it('never emits an event the reducer silently ignores', () => {
    for (const options of everyCombination()) {
      const { events } = generateTimeline(options)
      let previous = buildGameState(events.slice(0, 1))

      for (let i = 1; i < events.length; i++) {
        const event = events[i]
        expect(event).toBeDefined()
        if (!event) continue
        const next = buildGameState(events.slice(0, i + 1))
        expect(next.lastSeq).toBe(event.seq)

        if (event.type === 'DEGOMMAGE') {
          expect(next.degommageLog.length).toBe(previous.degommageLog.length + 1)
          expect(next.players[event.actorId]?.degommages).toBe(
            (previous.players[event.actorId]?.degommages ?? 0) + 1
          )
        }
        if (event.type === 'UNDO') {
          expect(next.undoneSeqs.size).toBe(previous.undoneSeqs.size + 1)
        }
        if (event.type === 'END_REQUESTED') {
          expect(previous.pendingEndRequest).toBeNull()
          expect(next.pendingEndRequest?.requestSeq).toBe(event.seq)
        }
        if (event.type === 'END_VALIDATED') {
          expect(previous.status).toBe('active')
          expect(next.status).toBe('finished')
        }
        previous = next
      }
    }
  })

  it('starts with GAME_STARTED and keeps seq strictly increasing', () => {
    for (const options of everyCombination()) {
      const { events } = generateTimeline(options)

      expect(events[0]?.type).toBe('GAME_STARTED')
      expect(events.filter((event) => event.type === 'GAME_STARTED')).toHaveLength(1)
      for (let i = 1; i < events.length; i++) {
        expect(events[i]?.seq).toBeGreaterThan(events[i - 1]?.seq ?? 0)
      }
    }
  })

  it('never makes a player dégommer themselves', () => {
    for (const options of everyCombination()) {
      const timeline = generateTimeline(options)
      const seats = finalState(timeline.events).seats

      for (const event of degommagesOf(timeline.events)) {
        expect(event.actorId).not.toBe(event.targetId)
        expect(seats).toContain(event.actorId)
        expect(seats).toContain(event.targetId)
      }
    }
  })

  it('undoes one or two real, distinct dégommages', () => {
    for (const options of everyCombination()) {
      const { events } = generateTimeline(options)
      const undos = events.filter((event) => event.type === 'UNDO')

      expect(undos.length).toBeGreaterThanOrEqual(1)
      expect(undos.length).toBeLessThanOrEqual(2)

      const alreadyUndone = new Set<number>()
      for (const undo of undos) {
        if (undo.type !== 'UNDO') continue
        const targetSeq = undo.payload.targetSeq
        const undone = events.find(
          (event) => event.seq === targetSeq && event.type === 'DEGOMMAGE'
        )
        expect(undone).toBeDefined()
        expect(targetSeq).toBeLessThan(undo.seq)
        expect(alreadyUndone.has(targetSeq)).toBe(false)
        alreadyUndone.add(targetSeq)
      }
      expect(finalState(events).undoneSeqs.size).toBe(undos.length)
    }
  })

  it('ends a village scenario on a designated winner', () => {
    for (const seed of SEEDS) {
      for (const playerCount of COUNTS) {
        const timeline = generateTimeline({ seed, playerCount, scenario: 'village' })
        const state = finalState(timeline.events)

        expect(state.status).toBe('finished')
        expect(state.outcome).toBe('village_reached')
        expect(state.winnerId).not.toBeNull()
        expect(state.seats).toContain(state.winnerId)
      }
    }
  })

  it('ends an abandon scenario without a winner', () => {
    for (const seed of SEEDS) {
      for (const playerCount of COUNTS) {
        const timeline = generateTimeline({ seed, playerCount, scenario: 'abandon_total' })
        const state = finalState(timeline.events)

        expect(state.status).toBe('finished')
        expect(state.outcome).toBe('aborted')
        expect(state.winnerId).toBeNull()
      }
    }
  })

  it('makes the remontada winner someone who was behind at the 60 % mark', () => {
    for (const seed of SEEDS) {
      for (const playerCount of COUNTS) {
        const timeline = generateTimeline({ seed, playerCount, scenario: 'remontada' })
        const state = finalState(timeline.events)
        const mark = Math.floor(degommagesOf(timeline.events).length * 0.6)

        expect(state.outcome).toBe('village_reached')
        expect(state.winnerId).not.toBeNull()
        expect(leaderAt(timeline.events, mark)).not.toBe(state.winnerId)
      }
    }
  })

  it('keeps timestamps coherent and the duration plausible', () => {
    for (const options of everyCombination()) {
      const timeline = generateTimeline(options)
      const { events } = timeline

      expect(events[0]?.createdAt).toBe(timeline.startedAt)
      for (let i = 1; i < events.length; i++) {
        const previous = Date.parse(events[i - 1]?.createdAt ?? '')
        const current = Date.parse(events[i]?.createdAt ?? '')
        expect(current).toBeGreaterThanOrEqual(previous)
      }
      const last = events[events.length - 1]?.createdAt ?? timeline.startedAt
      const durationMs = Date.parse(last) - Date.parse(timeline.startedAt)
      expect(durationMs).toBeGreaterThan(30_000)
      expect(durationMs).toBeLessThan(20 * 60_000)
    }
  })
})

describe('stepDelayMs', () => {
  const timeline = generateTimeline({ seed: 'menhir', playerCount: 3, scenario: 'village' })

  it('opens instantly on the first two events', () => {
    expect(timeline.delaysMs[0]).toBe(0)
    expect(timeline.delaysMs[1]).toBe(0)
  })

  it('returns zero for every index at the instant speed', () => {
    for (let i = 0; i < timeline.events.length; i++) {
      expect(stepDelayMs(timeline, i, 'instant')).toBe(0)
    }
  })

  it('divides the wait by the speed', () => {
    for (let i = 0; i < timeline.events.length; i++) {
      const normal = stepDelayMs(timeline, i, 1)
      expect(stepDelayMs(timeline, i, 4)).toBeCloseTo(normal / 4, -1)
      expect(Number.isInteger(normal)).toBe(true)
    }
  })

  it('returns zero outside the timeline', () => {
    expect(stepDelayMs(timeline, timeline.events.length + 5, 1)).toBe(0)
    expect(stepDelayMs(timeline, -1, 1)).toBe(0)
  })
})
