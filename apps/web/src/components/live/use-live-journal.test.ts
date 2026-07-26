import { describe, expect, it } from 'vitest'
import type { GameEvent, GameState } from '@degommix/game-core'
import { foldJournal } from './use-live-journal'
import type { NameMap } from './types'

const GAME = 'sim-menhir-2-village'
const OTHER_GAME = 'sim-sanglier-2-village'

const NAMES: NameMap = { 'p-1': 'Panoramix', 'p-2': 'Abraracourcix' }

function degommage(seq: number, actorId: string, targetId: string): GameEvent {
  return {
    type: 'DEGOMMAGE',
    seq,
    createdAt: `2026-07-26T20:00:${String(seq).padStart(2, '0')}.000Z`,
    actorId,
    targetId,
    payload: null,
  }
}

function undo(seq: number, actorId: string, targetSeq: number): GameEvent {
  return {
    type: 'UNDO',
    seq,
    createdAt: `2026-07-26T20:00:${String(seq).padStart(2, '0')}.000Z`,
    actorId,
    targetId: null,
    payload: { targetSeq },
  }
}

function endRequested(seq: number, actorId: string, targetId: string): GameEvent {
  return {
    type: 'END_REQUESTED',
    seq,
    createdAt: `2026-07-26T20:00:${String(seq).padStart(2, '0')}.000Z`,
    actorId,
    targetId,
    payload: { kind: 'village' },
  }
}

describe('foldJournal', () => {
  it('returns an empty journal for no events and no state', () => {
    expect(foldJournal(GAME, [], null, NAMES)).toEqual({ entries: [], lastEventAt: null })
  })

  it('renders two degommages most recent first with catalog sentences', () => {
    const events = [degommage(2, 'p-1', 'p-2'), degommage(3, 'p-2', 'p-1')]
    const journal = foldJournal(GAME, events, null, NAMES)

    expect(journal.entries.map((e) => e.seq)).toEqual([3, 2])
    for (const entry of journal.entries) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.label).not.toContain('a dégommé un pion')
    }
  })

  it('keeps only the two most recent entries', () => {
    const events = [
      degommage(2, 'p-1', 'p-2'),
      degommage(3, 'p-2', 'p-1'),
      degommage(4, 'p-1', 'p-2'),
      degommage(5, 'p-2', 'p-1'),
    ]
    const journal = foldJournal(GAME, events, null, NAMES)

    expect(journal.entries).toHaveLength(2)
    expect(journal.entries.map((e) => e.seq)).toEqual([5, 4])
  })

  it('describes an undo that references a known degommage', () => {
    const events = [degommage(2, 'p-1', 'p-2'), undo(3, 'p-1', 2)]
    const journal = foldJournal(GAME, events, null, NAMES)

    expect(journal.entries[0]?.label).toContain('a annulé')
  })

  it('describes a village end request with the designated winner', () => {
    const events = [degommage(2, 'p-1', 'p-2'), endRequested(3, 'p-1', 'p-2')]
    const journal = foldJournal(GAME, events, null, NAMES)

    expect(journal.entries[0]?.label).toContain('village')
    expect(journal.entries[0]?.label).toContain('Abraracourcix')
  })

  it('reports the createdAt of the highest-seq event', () => {
    const events = [degommage(2, 'p-1', 'p-2'), degommage(7, 'p-2', 'p-1')]

    expect(foldJournal(GAME, events, null, NAMES).lastEventAt).toBe('2026-07-26T20:00:07.000Z')
  })

  it('falls back to the state degommage log when no raw event is available', () => {
    const state: GameState = {
      status: 'active',
      format: 2,
      seats: ['p-1', 'p-2'],
      players: {
        'p-1': { userId: 'p-1', character: 'asterix', degommages: 1, inGame: true },
        'p-2': { userId: 'p-2', character: 'obelix', degommages: 0, inGame: true },
      },
      degommageLog: [{ seq: 2, actorId: 'p-1', targetId: 'p-2' }],
      undoneSeqs: new Set(),
      pendingEndRequest: null,
      outcome: null,
      winnerId: null,
      lastSeq: 2,
    }
    const journal = foldJournal(GAME, [], state, NAMES)

    expect(journal.entries).toHaveLength(1)
    expect(journal.entries[0]?.seq).toBe(2)
    expect(journal.lastEventAt).toBeNull()
  })

  it('is deterministic per gameId and varies across games', () => {
    const events = [degommage(2, 'p-1', 'p-2'), degommage(3, 'p-2', 'p-1')]
    const first = foldJournal(GAME, events, null, NAMES)
    const again = foldJournal(GAME, events, null, NAMES)
    const other = foldJournal(OTHER_GAME, events, null, NAMES)

    expect(again).toEqual(first)
    expect(other.entries.map((e) => e.label)).not.toEqual(first.entries.map((e) => e.label))
  })
})
