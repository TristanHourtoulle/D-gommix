import { describe, expect, it } from 'vitest'
import { renderDegommageJournal } from '@/lib/degommage-messages'
import {
  buildGameJournal,
  buildSummaryStamp,
  deriveAbortReason,
  type RawEvent,
} from './game-detail-journal'

const AT = new Date('2026-07-26T20:00:00Z')
const GAME = '9f1b7c2e-0000-4000-8000-000000000001'
const OTHER_GAME = '9f1b7c2e-0000-4000-8000-000000000002'

function ev(partial: Partial<RawEvent> & { seq: number; type: string }): RawEvent {
  return { actorId: null, targetId: null, payload: null, createdAt: AT, ...partial }
}

const NAME = (id: string | null): string =>
  id === 'a' ? 'Asterix' : id === 'o' ? 'Obelix' : 'Quelqu’un'

describe('deriveAbortReason', () => {
  it('returns zombie when a GAME_AUTO_CLOSED event exists', () => {
    const events = [
      ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
      ev({ seq: 2, type: 'GAME_AUTO_CLOSED', payload: { reason: 'zombie' } }),
    ]
    expect(deriveAbortReason(events)).toBe('zombie')
  })

  it('returns abandon_total when the last END_VALIDATED matches an abandon_total request', () => {
    const events = [
      ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
      ev({ seq: 2, type: 'END_REQUESTED', actorId: 'a', payload: { kind: 'abandon_total' } }),
      ev({ seq: 3, type: 'END_VALIDATED', actorId: 'o', payload: { requestSeq: 2 } }),
    ]
    expect(deriveAbortReason(events)).toBe('abandon_total')
  })

  it('returns abandon_individual when the last END_VALIDATED matches an abandon_individual request', () => {
    const events = [
      ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
      ev({ seq: 2, type: 'END_REQUESTED', actorId: 'a', payload: { kind: 'abandon_individual' } }),
      ev({ seq: 3, type: 'END_VALIDATED', actorId: 'o', payload: { requestSeq: 2 } }),
      ev({ seq: 4, type: 'PLAYER_QUIT', actorId: 'a' }),
    ]
    expect(deriveAbortReason(events)).toBe('abandon_individual')
  })

  it('falls back to abandon_individual when only quits emptied the table', () => {
    const events = [
      ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
      ev({ seq: 2, type: 'PLAYER_QUIT', actorId: 'a' }),
    ]
    expect(deriveAbortReason(events)).toBe('abandon_individual')
  })

  it('returns null for a village-validated log', () => {
    const events = [
      ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
      ev({ seq: 2, type: 'END_REQUESTED', actorId: 'o', targetId: 'o', payload: { kind: 'village' } }),
      ev({ seq: 3, type: 'END_VALIDATED', actorId: 'a', payload: { requestSeq: 2 } }),
    ]
    expect(deriveAbortReason(events)).toBeNull()
  })

  it('returns null for an empty log', () => {
    expect(deriveAbortReason([])).toBeNull()
  })
})

describe('buildGameJournal', () => {
  const degommages = [
    ev({ seq: 2, type: 'DEGOMMAGE', actorId: 'a', targetId: 'o' }),
    ev({ seq: 3, type: 'DEGOMMAGE', actorId: 'a', targetId: 'o' }),
  ]
  const full = [
    ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
    ...degommages,
    ev({ seq: 4, type: 'UNDO', actorId: 'o', payload: { targetSeq: 3 } }),
    ev({ seq: 5, type: 'END_REQUESTED', actorId: 'o', targetId: 'o', payload: { kind: 'village' } }),
    ev({ seq: 6, type: 'END_VALIDATED', actorId: 'a', payload: { requestSeq: 5 } }),
  ]

  it('returns one entry per event, in seq order, with the event timestamp', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    expect(journal.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(journal[0]?.at).toBe(AT)
  })

  it('renders DEGOMMAGE lines identically to the live renderer', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    const labels = renderDegommageJournal(
      GAME,
      degommages.map((event) => ({ seq: event.seq, actorId: 'a', targetId: 'o' })),
      NAME
    )
    expect(journal[1]?.text).toBe(labels.get(2))
    expect(journal[2]?.text).toBe(labels.get(3))
  })

  it('renders the exact sentences of THIS game for seqs 2 and 3 (golden)', () => {
    // Re-pinned for the vague-2 catalog (2026-07-26): 44 → 80 sentences moves
    // the weighted walk, so this game draws two other lines. Owner-approved
    // retune — see apps/web/src/lib/degommage-messages.ts.
    // Was: « Le sanglier pour Asterix, l’écurie pour Obelix » (seq 2) and
    //      « Un pion d’Obelix décolle. Signé Asterix » (seq 3).
    const journal = buildGameJournal(GAME, full, NAME)
    expect(journal[1]?.text).toBe('Asterix invoque Taranis : la foudre tombe sur un pion d’Obelix')
    expect(journal[2]?.text).toBe('Asterix tamponne un pion d’Obelix — retour à l’expéditeur')
  })

  it('tells the very same log with other sentences in another game', () => {
    // Seeding on the game id (see lib/seq-hash.ts) is what stops every table
    // from replaying the same two opening sentences forever.
    const here = buildGameJournal(GAME, full, NAME)
    const there = buildGameJournal(OTHER_GAME, full, NAME)
    expect(there[1]?.text).not.toBe(here[1]?.text)
    expect(there[2]?.text).not.toBe(here[2]?.text)
    // Only the dégommage lines move — the factual copy is not drawn.
    expect(there[0]?.text).toBe(here[0]?.text)
    expect(there[3]?.text).toBe(here[3]?.text)
  })

  it('keeps the factual copy for every non-DEGOMMAGE event', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    expect(journal[0]?.text).toBe('Asterix a lancé la partie')
    expect(journal[3]?.text).toBe('Obelix a annulé le dégommage d’Asterix sur Obelix')
    expect(journal[4]?.text).toBe(
      'Obelix demande la fin de partie — village atteint par Obelix'
    )
    expect(journal[5]?.text).toBe('Asterix a validé la fin de partie')
  })

  it('keeps the sentence of an undone dégommage (UNDO never rewrites history)', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    // seq 3 was undone by seq 4; its own line is still the seq-3 sentence.
    // Re-pinned with the vague-2 catalog (was « Un pion d’Obelix décolle.
    // Signé Asterix » on the 44-sentence catalog).
    expect(journal[2]?.text).toBe('Asterix tamponne un pion d’Obelix — retour à l’expéditeur')
  })

  it('falls back to the elided factual sentence when a DEGOMMAGE has no ids', () => {
    const broken = [ev({ seq: 2, type: 'DEGOMMAGE', actorId: null, targetId: 'o' })]
    const journal = buildGameJournal(GAME, broken, NAME)
    expect(journal[0]?.text).toBe('Quelqu’un a dégommé un pion d’Obelix')
  })
})

describe('moment stamps', () => {
  const full = [
    ev({ seq: 1, type: 'GAME_STARTED', actorId: 'a' }),
    ev({ seq: 2, type: 'DEGOMMAGE', actorId: 'a', targetId: 'o' }),
    ev({ seq: 3, type: 'DEGOMMAGE', actorId: 'a', targetId: 'o' }),
    ev({ seq: 4, type: 'UNDO', actorId: 'o', payload: { targetSeq: 3 } }),
  ]

  it('exposes the actor of every journal line', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    expect(journal.map((entry) => entry.actorId)).toEqual(['a', 'a', 'a', 'o'])
  })

  it('stamps « Premier sang » on the first dégommage line', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    expect(journal[0]?.stamp).toBeNull()
    expect(journal[1]?.stamp).toBe('premier_sang')
  })

  it('drops the stamp of an undone dégommage while keeping its sentence', () => {
    const journal = buildGameJournal(GAME, full, NAME)
    const withoutUndo = buildGameJournal(GAME, full.slice(0, 3), NAME)
    expect(withoutUndo[2]?.stamp).toBe('sans_pitie')
    expect(journal[2]?.stamp).toBeNull()
    expect(journal[2]?.text).toBe(withoutUndo[2]?.text)
  })

  it('returns « Remontada » when the winner suffered the most dégommages', () => {
    expect(buildSummaryStamp(full, 'o')).toBe('remontada')
  })

  it('returns null when the winner is unknown', () => {
    expect(buildSummaryStamp(full, null)).toBeNull()
  })
})
