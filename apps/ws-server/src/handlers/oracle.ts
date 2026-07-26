import { z } from 'zod'
import { oraclePicks } from '@degommix/db'
import { CommandError, OK, withAck } from '../ack'
import type { AppContext } from '../context'
import { assertLobby, getGameOrThrow, getSeat } from '../lobby-shared'
import type { AppSocket } from '../socket-types'

const oraclePickSchema = z.object({
  gameId: z.uuid(),
  predictedWinnerId: z.string().min(1),
  predictedSouffreDouleurId: z.string().min(1).nullable().optional(),
})

/** Predictions are cheap but must not be a write amplifier for a stuck client. */
const ORACLE_PICK_LIMIT = 20
const ORACLE_PICK_WINDOW_MS = 60_000

/**
 * « L'Oracle du village » (plan 040). Records ONE optional secret prediction
 * per player per lobby.
 *
 * Three rules, all enforced here and nowhere else:
 *
 * 1. LOCKED AT GAME START — `assertLobby` throws LOBBY_ALREADY_STARTED as soon
 *    as `games.status` leaves 'lobby', which is exactly the transaction that
 *    appends GAME_STARTED (GameManager.startGame). There is no second clock to
 *    keep in sync, and this is the same guard `lobby:pick_character` uses.
 * 2. SEATED PLAYERS ONLY — the caller and both predicted targets must hold a
 *    `joined` seat in THIS lobby. Predicting yourself is allowed: it is a
 *    legitimate bet and the owner did not forbid it.
 * 3. NEVER BLOCKING — this handler has no counterpart anywhere in the start
 *    path. A lobby where nobody ever calls it launches identically.
 *
 * It is deliberately NOT part of `lobby:state`: that payload is broadcast to
 * the whole game room and a prediction is secret until the game finishes.
 * There is no `broadcastLobbyState` call here either — rebroadcasting would
 * leak the *timing* of a prediction into the room.
 */
export function registerOracleHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, limiter } = ctx
  const userId = socket.data.userId

  socket.on(
    'lobby:oracle_pick',
    withAck(oraclePickSchema, async ({ gameId, predictedWinnerId, predictedSouffreDouleurId }) => {
      limiter.assert(`${userId}:lobby:oracle`, ORACLE_PICK_LIMIT, ORACLE_PICK_WINDOW_MS)
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      const seat = await getSeat(db, gameId, userId)
      if (seat?.status !== 'joined') throw new CommandError('NOT_MEMBER')

      const souffre = predictedSouffreDouleurId ?? null
      const winnerSeat = await getSeat(db, gameId, predictedWinnerId)
      if (winnerSeat?.status !== 'joined') throw new CommandError('INVALID_TARGET')
      if (souffre !== null) {
        const souffreSeat = await getSeat(db, gameId, souffre)
        if (souffreSeat?.status !== 'joined') throw new CommandError('INVALID_TARGET')
      }

      // Upsert: changing your mind before the launch overwrites; `created_at`
      // deliberately keeps the first prediction's timestamp.
      await db
        .insert(oraclePicks)
        .values({ gameId, userId, predictedWinnerId, predictedSouffreDouleurId: souffre })
        .onConflictDoUpdate({
          target: [oraclePicks.gameId, oraclePicks.userId],
          set: { predictedWinnerId, predictedSouffreDouleurId: souffre },
        })
      return OK
    })
  )
}
