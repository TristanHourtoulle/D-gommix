import { sql, games } from '@degommix/db'

/**
 * A lobby dissolved before anybody launched it is written as
 * `status = 'finished'`, `outcome = 'aborted'` with `started_at` still NULL:
 * the last player leaving (apps/ws-server/src/handlers/lobby-admin.ts) and the
 * stale-lobby sweep (apps/ws-server/src/zombie-job.ts) both retire the invite
 * code that way. Those rows are a burned-code registry, not games anybody
 * played, so every history and stats surface filters them out with this
 * predicate. Games aborted *after* the start still pass, as design §5.3 wants.
 */
export const gameStarted = sql`${games.startedAt} is not null`

/**
 * Parameterized `column IN (...)` for a non-empty string list. Shared by the
 * stats and records queries (moved out of stats.ts so records.ts can use it
 * without a stats ↔ records import cycle).
 */
export function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}

export interface PhantomLobbyCandidate {
  status: 'lobby' | 'active' | 'finished'
  startedAt: Date | null
}

/**
 * True for a finished game row that never started — the never-played lobby
 * described above. A live `lobby` row also has a null `startedAt`, hence the
 * status check: only the finished flavour is a phantom.
 */
export function isPhantomLobbyGame(game: PhantomLobbyCandidate): boolean {
  return game.status === 'finished' && game.startedAt === null
}
