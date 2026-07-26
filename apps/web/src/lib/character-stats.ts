/**
 * Per-character record aggregation. Pure and db-free on purpose:
 * `apps/web/vitest.config.ts` runs unit tests with no database and no env vars.
 */

import type { CharacterId } from '@degommix/game-core'

/** One `(userId, character)` aggregate row from the stats query. */
export interface CharacterStatRow {
  userId: string
  character: CharacterId | null
  played: number
  villageGames: number
  wins: number
  /** Epoch seconds of the most recent game started with this character. */
  lastPlayed: number
}

/** One character's record for one player. */
export interface CharacterStat {
  character: CharacterId
  played: number
  villageGames: number
  wins: number
  /**
   * Percentage 0-100 over `villageGames` only (aborted games excluded from the
   * denominator, SPECS.md §Stats). Null when `villageGames` is 0 — the same
   * small-sample guard as `getPlayerStats` (friends.ts).
   */
  winrate: number | null
}

/**
 * Groups the aggregate rows per player, most-played character first (ties by
 * most recently played, then character id for a deterministic order). Rows
 * with a null character are skipped.
 */
export function buildPerCharacter(
  rows: readonly CharacterStatRow[]
): Map<string, CharacterStat[]> {
  const byUser = new Map<string, CharacterStat[]>()
  const lastPlayedByKey = new Map<string, number>()
  for (const row of rows) {
    if (row.character === null) continue
    const list = byUser.get(row.userId) ?? []
    list.push({
      character: row.character,
      played: row.played,
      villageGames: row.villageGames,
      wins: row.wins,
      winrate: row.villageGames > 0 ? Math.round((row.wins / row.villageGames) * 100) : null,
    })
    byUser.set(row.userId, list)
    lastPlayedByKey.set(`${row.userId}:${row.character}`, row.lastPlayed)
  }
  for (const [userId, list] of byUser) {
    list.sort(
      (a, b) =>
        b.played - a.played ||
        (lastPlayedByKey.get(`${userId}:${b.character}`) ?? 0) -
          (lastPlayedByKey.get(`${userId}:${a.character}`) ?? 0) ||
        a.character.localeCompare(b.character)
    )
  }
  return byUser
}
