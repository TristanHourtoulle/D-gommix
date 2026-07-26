import { and, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { gamePlayers, games, user } from '@degommix/db'
import type { Command } from '@degommix/game-core'
import { CommandError, isUniqueViolation, OK, withAck } from '../ack'
import type { AppContext } from '../context'
import { createLobby, inviteSeat } from './lobby'
import { broadcastLobbyState } from '../lobby-state'
import {
  assertNotJoinedElsewhere,
  getGameOrThrow,
  getSeat,
  type GamePlayerRow,
} from '../lobby-shared'
import type { AppSocket } from '../socket-types'
import { TAUNT_COOLDOWN_MS, TAUNT_IDS } from '../taunts'

const commandSchema: z.ZodType<Command> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('degommage'), targetId: z.string().min(1) }),
  z.object({ type: z.literal('undo') }),
  z.object({
    type: z.literal('request_end'),
    kind: z.enum(['village', 'abandon_individual', 'abandon_total']),
    winnerId: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('respond_end'), accept: z.boolean() }),
  z.object({ type: z.literal('withdraw_end') }),
])

const gameCommandSchema = z.object({
  gameId: z.uuid(),
  clientEventId: z.uuid(),
  command: commandSchema,
})
const resyncSchema = z.object({ gameId: z.uuid(), lastSeq: z.number().int().nonnegative() })
const replaySchema = z.object({ finishedGameId: z.uuid() })
const tauntSchema = z.object({
  gameId: z.uuid(),
  targetId: z.string().min(1),
  tauntId: z.enum(TAUNT_IDS),
})

const GAME_COMMAND_RATE_LIMIT = 20
const GAME_COMMAND_RATE_WINDOW_MS = 1_000

/**
 * Best-effort copy of a player's character from the finished game onto their
 * seat in the rematch lobby. The seed targets the NEW game's row only — the
 * source seats are frozen in the finished game and untouched by the stale-lobby
 * evacuations of `assertNotJoinedElsewhere`. A valid source game cannot trip
 * the per-game unique index (`game_players_character_unique`), but the seed is
 * purely cosmetic: on a unique violation the seat simply stays null instead of
 * failing the rematch.
 */
async function seedCharacter(
  db: AppContext['db'],
  gameId: string,
  userId: string,
  character: GamePlayerRow['character']
): Promise<void> {
  if (character === null) return
  try {
    await db
      .update(gamePlayers)
      .set({ character })
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }
}

export function registerGameHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, io, manager, limiter } = ctx
  const userId = socket.data.userId

  socket.on(
    'game:command',
    withAck(gameCommandSchema, async ({ gameId, clientEventId, command }) => {
      limiter.assert(
        `${socket.id}:game:command`,
        GAME_COMMAND_RATE_LIMIT,
        GAME_COMMAND_RATE_WINDOW_MS
      )
      return manager.submitCommand(gameId, userId, clientEventId, command)
    })
  )

  socket.on(
    'game:resync',
    withAck(resyncSchema, async ({ gameId, lastSeq }) => {
      const seat = await getSeat(db, gameId, userId)
      if (!seat) throw new CommandError('NOT_MEMBER')
      await socket.join(`game:${gameId}`)
      const events = await manager.getEventsSince(gameId, lastSeq)
      return { ok: true, events, serverNow: Date.now() }
    })
  )

  /**
   * « Balance une vanne » — pure decoration relayed to the game room. NOT a
   * game command: no `seq`, no `game_events` row, no reducer, no idempotency
   * key. The room emit reaches the sender too, so the whole table sees the
   * stamp at the same instant.
   *
   * The cooldown is keyed by USER, not by socket, unlike the flood guards
   * above: one taunt per minute is a game rule, and a socket-keyed window
   * would be defeated by a second tab. It is asserted BEFORE the DB reads so
   * a flood costs no queries; a taunt rejected afterwards still burns the
   * minute, which is harmless (the caller was not entitled to it anyway).
   */
  socket.on(
    'game:send_taunt',
    withAck(tauntSchema, async ({ gameId, targetId, tauntId }) => {
      limiter.assert(`${userId}:game:taunt`, 1, TAUNT_COOLDOWN_MS)
      const seat = await getSeat(db, gameId, userId)
      if (!seat || seat.status !== 'joined') throw new CommandError('NOT_MEMBER')
      const game = await getGameOrThrow(db, gameId)
      if (game.status !== 'active') throw new CommandError('GAME_NOT_ACTIVE')
      if (targetId === userId) throw new CommandError('INVALID_TARGET')
      io.to(`game:${gameId}`).emit('game:taunt', { gameId, fromId: userId, targetId, tauntId })
      return OK
    })
  )

  socket.on(
    'replay:create',
    withAck(replaySchema, async ({ finishedGameId }) => {
      const [finished] = await db.select().from(games).where(eq(games.id, finishedGameId))
      if (!finished || finished.status !== 'finished') throw new CommandError('NOT_FOUND')
      const mySeat = await getSeat(db, finishedGameId, userId)
      if (!mySeat) throw new CommandError('NOT_MEMBER')
      await assertNotJoinedElsewhere(db, io, userId)
      const formerPlayers = await db
        .select()
        .from(gamePlayers)
        .where(
          and(
            eq(gamePlayers.gameId, finishedGameId),
            inArray(gamePlayers.status, ['joined', 'left']),
            ne(gamePlayers.userId, userId)
          )
        )
      const { gameId, code } = await createLobby(ctx, userId, finished.format as 2 | 3 | 4)
      await seedCharacter(db, gameId, userId, mySeat.character)
      const [me] = await db.select({ username: user.username }).from(user).where(eq(user.id, userId))
      for (const former of formerPlayers) {
        await inviteSeat(ctx, gameId, former.userId)
        await seedCharacter(db, gameId, former.userId, former.character)
        io.to(`user:${former.userId}`).emit('invite:received', {
          gameId,
          hostUsername: me?.username ?? '',
          format: finished.format,
          rematchOf: finishedGameId,
        })
      }
      await socket.join(`game:${gameId}`)
      await broadcastLobbyState(db, io, gameId)
      return { ok: true, gameId, code }
    })
  )
}
