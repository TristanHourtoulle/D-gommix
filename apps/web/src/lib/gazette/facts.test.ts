import { describe, expect, it } from 'vitest'
import type { RawEvent } from '@/lib/queries/game-detail-journal'
import { deriveGazetteFacts, type GazetteInput } from './facts'

const AT = new Date('2026-07-26T20:00:00Z')
const STARTED = new Date('2026-07-26T20:00:00Z')

function ev(partial: Partial<RawEvent> & { seq: number; type: string }): RawEvent {
  return { actorId: null, targetId: null, payload: null, createdAt: AT, ...partial }
}

/** `startedAt + seconds`, so a fixture states its duration rather than dates. */
function endedAfter(seconds: number): Date {
  return new Date(STARTED.getTime() + seconds * 1000)
}

const PLAYERS = [
  { userId: 'a', username: 'Asterix', hasLeft: false },
  { userId: 'o', username: 'Obelix', hasLeft: false },
  { userId: 'b', username: 'Bonemine', hasLeft: false },
]

function input(partial: Partial<GazetteInput> = {}): GazetteInput {
  return {
    gameCode: '4F2K9B',
    outcome: 'village_reached',
    abortReason: null,
    startedAt: STARTED,
    endedAt: endedAfter(600),
    winnerId: 'o',
    players: PLAYERS,
    events: [],
    ...partial,
  }
}

/** `n` dégommages by `actor` on `target`, starting at `seq`. */
function hits(seq: number, actor: string, target: string, n = 1): RawEvent[] {
  return Array.from({ length: n }, (_unused, i) =>
    ev({ seq: seq + i, type: 'DEGOMMAGE', actorId: actor, targetId: target })
  )
}

describe('deriveGazetteFacts — family selection', () => {
  it('calls a short village win an eclair', () => {
    const facts = deriveGazetteFacts(input({ endedAt: endedAfter(120) }))
    expect(facts.family).toBe('eclair')
  })

  it('calls a long village win a marathon', () => {
    const facts = deriveGazetteFacts(input({ endedAt: endedAfter(1800) }))
    expect(facts.family).toBe('marathon')
  })

  it('prefers remontada over eclair when the winner is also the souffre-douleur', () => {
    const facts = deriveGazetteFacts(
      input({
        endedAt: endedAfter(120),
        winnerId: 'o',
        events: [...hits(1, 'a', 'o', 3), ...hits(4, 'o', 'a', 1)],
      })
    )
    expect(facts.souffreDouleur).toMatchObject({ userId: 'o', count: 3 })
    expect(facts.family).toBe('remontada')
  })

  it('calls a mid-length village win where the winner was spared a plain village', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 3), ...hits(4, 'o', 'b', 1)] })
    )
    expect(facts.family).toBe('village')
  })

  it('falls back to village when the game has no duration', () => {
    const facts = deriveGazetteFacts(input({ startedAt: null, endedAt: null }))
    expect(facts.durationSeconds).toBeNull()
    expect(facts.family).toBe('village')
  })

  it('takes the abort reason as the family of an aborted game', () => {
    for (const reason of ['abandon_total', 'abandon_individual', 'zombie'] as const) {
      const facts = deriveGazetteFacts(
        input({ outcome: 'aborted', abortReason: reason, winnerId: null })
      )
      expect(facts.family).toBe(reason)
    }
  })

  it('falls back to inconnu for an aborted game with no derivable reason', () => {
    const facts = deriveGazetteFacts(
      input({ outcome: 'aborted', abortReason: null, winnerId: null })
    )
    expect(facts.family).toBe('inconnu')
  })

  it('falls back to inconnu when the game has no outcome at all', () => {
    const facts = deriveGazetteFacts(input({ outcome: null, winnerId: null }))
    expect(facts.family).toBe('inconnu')
  })
})

describe('deriveGazetteFacts — counts net of undos', () => {
  it('drops an undone dégommage from the total', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [
          ...hits(1, 'o', 'a', 5),
          ev({ seq: 6, type: 'UNDO', actorId: 'o', payload: { targetSeq: 3 } }),
        ],
      })
    )
    expect(facts.totalDegommages).toBe(4)
    expect(facts.undoTotal).toBe(1)
  })

  it('counts an UNDO whose target matches nothing without removing any dégommage', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [
          ...hits(1, 'o', 'a', 3),
          ev({ seq: 9, type: 'UNDO', actorId: 'o', payload: { targetSeq: 404 } }),
        ],
      })
    )
    expect(facts.totalDegommages).toBe(3)
    expect(facts.undoTotal).toBe(1)
  })

  it('yields no biggestHitter on a tie', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 2), ...hits(3, 'a', 'o', 2)] })
    )
    expect(facts.biggestHitter).toBeNull()
  })

  it('yields the biggestHitter when strictly ahead', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 3), ...hits(4, 'a', 'o', 1)] })
    )
    expect(facts.biggestHitter).toMatchObject({ userId: 'o', username: 'Obelix', count: 3 })
  })

  it('yields no souffreDouleur when the top victim took a single hit', () => {
    const facts = deriveGazetteFacts(input({ events: hits(1, 'o', 'a', 1) }))
    expect(facts.souffreDouleur).toBeNull()
  })

  it('yields no souffreDouleur on a tie', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 2), ...hits(3, 'a', 'o', 2)] })
    )
    expect(facts.souffreDouleur).toBeNull()
  })

  it('yields the souffreDouleur at 2+ hits with a strict lead', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 2), ...hits(3, 'o', 'b', 1)] })
    )
    expect(facts.souffreDouleur).toMatchObject({ userId: 'a', username: 'Asterix', count: 2 })
  })

  it('lists undoers count-desc then username-asc, and only actual undoers', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [
          ...hits(1, 'o', 'a', 4),
          ev({ seq: 5, type: 'UNDO', actorId: 'o', payload: { targetSeq: 1 } }),
          ev({ seq: 6, type: 'UNDO', actorId: 'b', payload: { targetSeq: 2 } }),
          ev({ seq: 7, type: 'UNDO', actorId: 'b', payload: { targetSeq: 3 } }),
          ev({ seq: 8, type: 'UNDO', actorId: 'a', payload: { targetSeq: 4 } }),
        ],
      })
    )
    expect(facts.undoers.map((row) => [row.username, row.count])).toEqual([
      ['Bonemine', 2],
      ['Asterix', 1],
      ['Obelix', 1],
    ])
  })
})

describe('deriveGazetteFacts — runs', () => {
  it('detects three consecutive dégommages by the same striker', () => {
    const facts = deriveGazetteFacts(input({ events: hits(1, 'a', 'o', 3) }))
    expect(facts.bestRun).toMatchObject({ username: 'Asterix', count: 3 })
  })

  it('yields no run when the striker alternates', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [...hits(1, 'a', 'o', 2), ...hits(3, 'b', 'o', 1), ...hits(4, 'a', 'o', 1)],
      })
    )
    expect(facts.bestRun).toBeNull()
  })

  it('lets an annulled hit neither break nor extend a run', () => {
    // Net list is A A A: the undone hit at seq 2 simply never happened, so the
    // surrounding hits stay adjacent. This is the subtle one — pin it.
    const facts = deriveGazetteFacts(
      input({
        events: [
          ...hits(1, 'a', 'o', 2),
          ev({ seq: 3, type: 'UNDO', actorId: 'a', payload: { targetSeq: 2 } }),
          ...hits(4, 'a', 'o', 2),
        ],
      })
    )
    expect(facts.totalDegommages).toBe(3)
    expect(facts.bestRun).toMatchObject({ username: 'Asterix', count: 3 })
  })
})

describe('deriveGazetteFacts — people', () => {
  it('takes validatedBy from the last END_VALIDATED', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [
          ev({ seq: 1, type: 'END_VALIDATED', actorId: 'b', payload: { requestSeq: 0 } }),
          ev({ seq: 2, type: 'END_VALIDATED', actorId: 'a', payload: { requestSeq: 1 } }),
        ],
      })
    )
    expect(facts.validatedBy).toEqual({ userId: 'a', username: 'Asterix' })
  })

  it('leaves validatedBy null when nobody validated', () => {
    const facts = deriveGazetteFacts(
      input({
        outcome: 'aborted',
        abortReason: 'zombie',
        winnerId: null,
        events: [ev({ seq: 1, type: 'GAME_AUTO_CLOSED', payload: { reason: 'zombie' } })],
      })
    )
    expect(facts.validatedBy).toBeNull()
  })

  it('lists quitters in players order', () => {
    const facts = deriveGazetteFacts(
      input({
        players: [
          { userId: 'a', username: 'Asterix', hasLeft: true },
          { userId: 'o', username: 'Obelix', hasLeft: false },
          { userId: 'b', username: 'Bonemine', hasLeft: true },
        ],
      })
    )
    expect(facts.quitters.map((person) => person.username)).toEqual(['Asterix', 'Bonemine'])
  })

  it('names the single untouched player of a busy village win', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 3), ...hits(4, 'a', 'b', 1)] })
    )
    expect(facts.totalDegommages).toBe(4)
    expect(facts.cleanSheet).toEqual({ userId: 'o', username: 'Obelix' })
  })

  it('yields no cleanSheet when two players went untouched', () => {
    const facts = deriveGazetteFacts(input({ events: hits(1, 'o', 'a', 4) }))
    expect(facts.totalDegommages).toBe(4)
    expect(facts.cleanSheet).toBeNull()
  })

  it('yields no cleanSheet under the busy-table threshold', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'o', 'a', 2), ...hits(3, 'a', 'b', 1)] })
    )
    expect(facts.totalDegommages).toBe(3)
    expect(facts.cleanSheet).toBeNull()
  })

  it('yields no cleanSheet outside a village win', () => {
    const facts = deriveGazetteFacts(
      input({
        outcome: 'aborted',
        abortReason: 'abandon_total',
        winnerId: null,
        events: [...hits(1, 'o', 'a', 3), ...hits(4, 'a', 'b', 1)],
      })
    )
    expect(facts.cleanSheet).toBeNull()
  })
})

describe('deriveGazetteFacts — pass-through and shape', () => {
  it('defaults titleHolder and stamps when the caller omits them', () => {
    const facts = deriveGazetteFacts(input())
    expect(facts.titleHolder).toBeNull()
    expect(facts.stamps).toEqual([])
  })

  it('passes titleHolder and stamps through untouched', () => {
    const titleHolder = { userId: 'a', username: 'Asterix', count: 42 }
    const stamps = [{ id: 'triple', label: 'Triplé', userId: 'o' }]
    const facts = deriveGazetteFacts(input({ titleHolder, stamps }))
    expect(facts.titleHolder).toEqual(titleHolder)
    expect(facts.stamps).toEqual(stamps)
  })

  it('carries the net dealt and taken counts of every participant', () => {
    const facts = deriveGazetteFacts(
      input({
        events: [
          ...hits(1, 'o', 'a', 3),
          ...hits(4, 'a', 'b', 1),
          ev({ seq: 5, type: 'UNDO', actorId: 'o', payload: { targetSeq: 3 } }),
        ],
      })
    )
    expect(facts.dealtCounts.map((row) => [row.username, row.count])).toEqual([
      ['Obelix', 2],
      ['Asterix', 1],
    ])
    expect(facts.takenCounts.map((row) => [row.username, row.count])).toEqual([
      ['Asterix', 2],
      ['Bonemine', 1],
    ])
  })

  it('carries the code, the end date, the duration and the player count', () => {
    const facts = deriveGazetteFacts(input({ endedAt: endedAfter(760) }))
    expect(facts.gameCode).toBe('4F2K9B')
    expect(facts.endedAt).toEqual(endedAfter(760))
    expect(facts.durationSeconds).toBe(760)
    expect(facts.playerCount).toBe(3)
  })

  it('names the winner from the players list, and nobody when there is none', () => {
    expect(deriveGazetteFacts(input()).winner).toEqual({ userId: 'o', username: 'Obelix' })
    expect(deriveGazetteFacts(input({ winnerId: null })).winner).toBeNull()
    expect(deriveGazetteFacts(input({ winnerId: 'ghost' })).winner).toBeNull()
  })

  it('ignores actors and targets that are not participants', () => {
    const facts = deriveGazetteFacts(
      input({ events: [...hits(1, 'ghost', 'a', 3), ...hits(4, 'o', 'ghost', 2)] })
    )
    // The ghost is never named: it wins no count fact and no run, even though
    // its three hits are the longest streak of the log.
    expect(facts.biggestHitter).toMatchObject({ userId: 'o', username: 'Obelix', count: 2 })
    expect(facts.souffreDouleur).toMatchObject({ userId: 'a', count: 3 })
    expect(facts.bestRun).toBeNull()
  })
})
