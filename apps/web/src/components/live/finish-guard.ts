import type { GameState } from '@degommix/game-core'

/**
 * Decides whether the end-of-game cache invalidation is still owed for this
 * game.
 *
 * The live state is rebuilt from the event log, so `finished` is re-observed on
 * every resync, reconnection and re-render — and it is already `finished` on
 * the very first state when the summary is opened after the fact. Keying the
 * guard on the game id makes the effect fire exactly once per game while still
 * covering a replay, which mounts the same screen under a new id.
 */
export function shouldInvalidateOnFinish(
  status: GameState['status'] | undefined,
  gameId: string,
  invalidatedGameId: string | null
): boolean {
  return status === 'finished' && invalidatedGameId !== gameId
}
