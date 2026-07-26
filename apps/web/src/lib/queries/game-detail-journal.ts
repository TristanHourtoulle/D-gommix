import type { EndKind } from '@degommix/game-core'
import { deName } from '@/lib/elision'
import { renderDegommageJournal, type DegommageRef } from '@/lib/degommage-messages'
import {
  detectLineStamps,
  detectSummaryStamp,
  takenFromEvents,
  type StampEvent,
  type StampId,
} from '@/lib/game-stamps'

/**
 * Pure pieces of the game-detail query (`getGameDetail` in ./stats.ts), kept
 * db-free so they are unit-testable (apps/web/vitest.config.ts runs with no
 * database and no env vars).
 */

/** A `game_events` row as `getGameDetail` selects it. */
export interface RawEvent {
  seq: number
  type: string
  actorId: string | null
  targetId: string | null
  payload: unknown
  createdAt: Date
}

export interface JournalEntry {
  seq: number
  at: Date
  text: string
  /** Actor of the event, for the camp colour of its stamp. */
  actorId: string | null
  /** Highlight stamped on this line, `null` on an ordinary one. */
  stamp: StampId | null
}

/**
 * Why an aborted game ended: a validated abandon (individual quits emptied
 * the table, or the whole table voted to stop) or the 24 h zombie auto-close.
 * Derived from the persisted event log — never stored on `games`.
 */
export type GameAbortReason = Exclude<EndKind, 'village'> | 'zombie'

function payloadNumber(payload: unknown, key: string): number | null {
  if (payload !== null && typeof payload === 'object' && key in payload) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'number') return value
  }
  return null
}

function payloadString(payload: unknown, key: string): string | null {
  if (payload !== null && typeof payload === 'object' && key in payload) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'string') return value
  }
  return null
}

function journalText(
  event: RawEvent,
  events: readonly RawEvent[],
  name: (id: string | null) => string,
  degommageLabels: ReadonlyMap<number, string>
): string {
  switch (event.type) {
    case 'GAME_STARTED':
      return `${name(event.actorId)} a lancé la partie`
    case 'DEGOMMAGE':
      return (
        degommageLabels.get(event.seq) ??
        `${name(event.actorId)} a dégommé un pion ${deName(name(event.targetId))}`
      )
    case 'UNDO': {
      const targetSeq = payloadNumber(event.payload, 'targetSeq')
      const target = events.find((candidate) => candidate.seq === targetSeq)
      if (!target) return `${name(event.actorId)} a annulé un dégommage`
      return `${name(event.actorId)} a annulé le dégommage ${deName(name(target.actorId))} sur ${name(target.targetId)}`
    }
    case 'PLAYER_QUIT':
      return `${name(event.actorId)} a quitté la partie`
    case 'END_REQUESTED': {
      const kind = payloadString(event.payload, 'kind')
      if (kind === 'village')
        return `${name(event.actorId)} demande la fin de partie — village atteint par ${name(event.targetId)}`
      if (kind === 'abandon_individual') return `${name(event.actorId)} demande à abandonner la partie`
      return `${name(event.actorId)} demande l'arrêt de la partie`
    }
    case 'END_REJECTED': {
      const requestSeq = payloadNumber(event.payload, 'requestSeq')
      const request = events.find((candidate) => candidate.seq === requestSeq)
      if (request && request.actorId === event.actorId)
        return `${name(event.actorId)} a retiré sa demande de fin`
      return `${name(event.actorId)} a rejeté la demande de fin`
    }
    case 'END_VALIDATED':
      return `${name(event.actorId)} a validé la fin de partie`
    case 'GAME_AUTO_CLOSED':
      return 'Partie clôturée automatiquement après 24 h d’inactivité'
    default:
      return `Événement ${event.type}`
  }
}

/** `game_events` row → the shape the shared stamp detector reads. */
function toStampEvent(event: RawEvent): StampEvent {
  return {
    seq: event.seq,
    type: event.type,
    actorId: event.actorId,
    targetId: event.targetId,
    payload: event.payload,
    at: event.createdAt.getTime(),
  }
}

/**
 * Full journal of a finished game. Builds the (gameId, seq)-deterministic
 * dégommage sentences with the SAME shared renderer as the live journal
 * (renderDegommageJournal), over the FULL ordered dégommage list — never a
 * slice, or the no-immediate-repeat fold would diverge from what the table
 * read (plan 025; supersedes plan 010's live-only decision). The same `gameId`
 * the live screen used must be passed here, or the archive would tell the game
 * with other words than the ones the table read.
 */
export function buildGameJournal(
  gameId: string,
  events: readonly RawEvent[],
  name: (id: string | null) => string
): JournalEntry[] {
  const refs: DegommageRef[] = []
  for (const event of events) {
    if (event.type === 'DEGOMMAGE' && event.actorId !== null && event.targetId !== null) {
      refs.push({ seq: event.seq, actorId: event.actorId, targetId: event.targetId })
    }
  }
  const degommageLabels = renderDegommageJournal(gameId, refs, (userId) => name(userId))
  const stampRows = events.map(toStampEvent)
  const stamps = detectLineStamps(stampRows)
  return events.map((event) => ({
    seq: event.seq,
    at: event.createdAt,
    text: journalText(event, events, name, degommageLabels),
    actorId: event.actorId,
    stamp: stamps.get(event.seq) ?? null,
  }))
}

/**
 * True end reason of an aborted game, from its event log: the zombie job's
 * GAME_AUTO_CLOSED wins; otherwise the kind of the request the last
 * END_VALIDATED validated (PLAYER_QUIT only ever follows a validated
 * abandon_individual — see ws-server/src/game-manager.ts). Null when the log
 * matches no abort shape (caller only asks for `outcome = 'aborted'` games).
 */
export function deriveAbortReason(events: readonly RawEvent[]): GameAbortReason | null {
  if (events.some((event) => event.type === 'GAME_AUTO_CLOSED')) return 'zombie'
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (!event || event.type !== 'END_VALIDATED') continue
    const requestSeq = payloadNumber(event.payload, 'requestSeq')
    const request = events.find(
      (candidate) => candidate.seq === requestSeq && candidate.type === 'END_REQUESTED'
    )
    const kind = request ? payloadString(request.payload, 'kind') : null
    if (kind === 'abandon_total') return 'abandon_total'
    if (kind === 'abandon_individual') return 'abandon_individual'
    return null
  }
  return events.some((event) => event.type === 'PLAYER_QUIT') ? 'abandon_individual' : null
}

/**
 * End-of-game stamp of a finished game — « Remontada » when the winner is the
 * player who lost the most pions. Same derivation as the live summary
 * (`detectSummaryStamp`), fed from the persisted log instead of the reduced
 * state, so the archive claims exactly what the table saw at « Le banquet ».
 */
export function buildSummaryStamp(
  events: readonly RawEvent[],
  winnerId: string | null
): StampId | null {
  return detectSummaryStamp(takenFromEvents(events.map(toStampEvent)), winnerId)
}
