import { and, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { gamePlayers, games, user } from '@degommix/db'
import type { Command } from '@degommix/game-core'
import { CommandError, withAck } from '../ack'
import type { AppContext } from '../context'
import { createLobby, inviteSeat } from './lobby'
import { broadcastLobbyState } from '../lobby-state'
import { assertNotJoinedElsewhere, getSeat } from '../lobby-shared'
import type { AppSocket } from '../socket-types'

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

const GAME_COMMAND_RATE_LIMIT = 20
const GAME_COMMAND_RATE_WINDOW_MS = 1_000

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
      const [me] = await db.select({ username: user.username }).from(user).where(eq(user.id, userId))
      for (const former of formerPlayers) {
        await inviteSeat(ctx, gameId, former.userId)
        io.to(`user:${former.userId}`).emit('invite:received', {
          gameId,
          hostUsername: me?.username ?? '',
          format: finished.format,
        })
      }
      await socket.join(`game:${gameId}`)
      await broadcastLobbyState(db, io, gameId)
      return { ok: true, gameId, code }
    })
  )
}
