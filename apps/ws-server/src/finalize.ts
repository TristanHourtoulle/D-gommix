import { and, eq } from 'drizzle-orm'
import { gamePlayers, games, type Db } from '@degommix/db'
import type { GameState } from '@degommix/game-core'
import { awardSeals } from './seals'

export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Denormalizes the final state when a game closes: outcome/winner on `games`,
 * non-undone degommage counts on `game_players`, and the one-time hauts faits
 * unlocked by this game (plan 033) — in that order, because seal detection
 * issues cross-game career queries that must already see this game as finished.
 */
export async function finalizeGame(
  tx: DbTransaction,
  gameId: string,
  state: GameState
): Promise<void> {
  await tx
    .update(games)
    .set({
      status: 'finished',
      outcome: state.outcome,
      winnerId: state.winnerId,
      endedAt: new Date(),
    })
    .where(eq(games.id, gameId))
  for (const player of Object.values(state.players)) {
    await tx
      .update(gamePlayers)
      .set({ degommages: player.degommages })
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, player.userId)))
  }
  await awardSeals(tx, gameId, state)
}
