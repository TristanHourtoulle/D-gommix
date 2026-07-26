/**
 * Pair-level degommage aggregation — the « qui dégomme qui » side of the stats.
 * Pure and db-free on purpose: `apps/web/vitest.config.ts` runs unit tests with
 * no database and no env vars.
 */

import type { GameState } from '@degommix/game-core'

/** One `game_events` row, narrowed to what the aggregation needs. */
export interface RivalryEventRow {
  gameId: string
  seq: number
  type: string
  actorId: string | null
  targetId: string | null
  payload: unknown
}

/** Degommages exchanged between the viewer and one opponent. */
export interface PairCount {
  opponentId: string
  /** Non-undone degommages the viewer dealt to this opponent. */
  dealt: number
  /** Non-undone degommages this opponent dealt to the viewer. */
  taken: number
}

function readTargetSeq(payload: unknown): number | null {
  if (payload !== null && typeof payload === 'object' && 'targetSeq' in payload) {
    const value = (payload as Record<string, unknown>).targetSeq
    if (typeof value === 'number') return value
  }
  return null
}

/**
 * `{gameId}:{seq}` key of every degommage cancelled by an UNDO event. The game
 * id is part of the key because `seq` restarts at 1 in every game.
 */
function undoneKeys(rows: readonly RivalryEventRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.type !== 'UNDO') continue
    const targetSeq = readTargetSeq(row.payload)
    if (targetSeq !== null) keys.add(`${row.gameId}:${targetSeq}`)
  }
  return keys
}

/**
 * Counts non-undone degommages between `viewerId` and every other player found
 * in `rows`. Mirrors the reducer exactly: a DEGOMMAGE counts unless an UNDO of
 * the SAME game targets its `seq` (see packages/game-core/src/reducer.ts UNDO
 * case, whose result is what apps/ws-server/src/finalize.ts persists into
 * game_players.degommages). Self-degommages are ignored. Sorted by opponentId
 * for a deterministic result.
 */
export function aggregatePairCounts(
  rows: readonly RivalryEventRow[],
  viewerId: string
): PairCount[] {
  const undone = undoneKeys(rows)
  const byOpponent = new Map<string, PairCount>()

  const entry = (opponentId: string): PairCount => {
    const existing = byOpponent.get(opponentId)
    if (existing) return existing
    const created: PairCount = { opponentId, dealt: 0, taken: 0 }
    byOpponent.set(opponentId, created)
    return created
  }

  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    if (actorId === viewerId) entry(targetId).dealt += 1
    else if (targetId === viewerId) entry(actorId).taken += 1
  }

  return [...byOpponent.values()].sort((a, b) => a.opponentId.localeCompare(b.opponentId))
}

/**
 * Non-undone degommages suffered per target, across every game found in
 * `rows`. Same cancellation rule as `aggregatePairCounts`: a DEGOMMAGE counts
 * unless an UNDO of the SAME game targets its `seq`. Self-degommages and rows
 * with a null actor or target are ignored.
 */
export function aggregateTakenCounts(rows: readonly RivalryEventRow[]): Map<string, number> {
  const undone = undoneKeys(rows)
  const taken = new Map<string, number>()
  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    taken.set(targetId, (taken.get(targetId) ?? 0) + 1)
  }
  return taken
}

/**
 * Picks the pair with the highest `main` counter. Ties are broken by the other
 * counter descending, then by `opponentId` ascending, so the winner is stable
 * whatever order the rows arrived in.
 */
function pickBest(
  pairs: readonly PairCount[],
  main: 'dealt' | 'taken',
  other: 'dealt' | 'taken'
): PairCount | null {
  let best: PairCount | null = null
  for (const pair of pairs) {
    if (pair[main] === 0) continue
    if (best === null) {
      best = pair
      continue
    }
    if (pair[main] > best[main]) {
      best = pair
      continue
    }
    if (pair[main] < best[main]) continue
    if (pair[other] > best[other]) {
      best = pair
      continue
    }
    if (pair[other] < best[other]) continue
    if (pair.opponentId.localeCompare(best.opponentId) < 0) best = pair
  }
  return best
}

/** Opponent who dégommed the viewer the most; null when nobody ever did. */
export function pickNemesis(pairs: readonly PairCount[]): PairCount | null {
  return pickBest(pairs, 'taken', 'dealt')
}

/** Opponent the viewer dégommed the most; null when the viewer never did. */
export function pickFavoriteVictim(pairs: readonly PairCount[]): PairCount | null {
  return pickBest(pairs, 'dealt', 'taken')
}

/**
 * Display order of the « Rivalités » list: most active pair first
 * (dealt + taken desc), then French alphabetical username. Returns a copy —
 * never mutates the input.
 */
export function sortRivalryPairs<T extends { username: string; dealt: number; taken: number }>(
  pairs: readonly T[]
): T[] {
  return [...pairs].sort(
    (a, b) => b.dealt + b.taken - (a.dealt + a.taken) || a.username.localeCompare(b.username, 'fr')
  )
}

/** Degommages suffered per player in the current game (undone ones excluded). */
export function takenByTarget(
  state: Pick<GameState, 'degommageLog' | 'undoneSeqs'>
): Record<string, number> {
  const taken: Record<string, number> = {}
  for (const entry of state.degommageLog) {
    if (state.undoneSeqs.has(entry.seq)) continue
    taken[entry.targetId] = (taken[entry.targetId] ?? 0) + 1
  }
  return taken
}
