import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { gamePlayers, games } from '@degommix/db'
import { CHARACTERS } from '@degommix/game-core'
import { CommandError, isUniqueViolation, OK, withAck } from '../ack'
import type { AppContext } from '../context'
import { transferHost } from '../host-transfer'
import { broadcastLobbyState } from '../lobby-state'
import { assertLobby, getGameOrThrow, getSeat, listSeats } from '../lobby-shared'
import type { AppSocket } from '../socket-types'

const pickSchema = z.object({ gameId: z.uuid(), character: z.enum(CHARACTERS) })
const setFormatSchema = z.object({
  gameId: z.uuid(),
  format: z.union([z.literal(2), z.literal(3), z.literal(4)]),
})
const kickSchema = z.object({ gameId: z.uuid(), userId: z.string().min(1) })
const leaveSchema = z.object({ gameId: z.uuid() })
const startSchema = z.object({ gameId: z.uuid() })

export function registerLobbyAdminHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, io, manager, presence } = ctx
  const userId = socket.data.userId

  socket.on(
    'lobby:pick_character',
    withAck(pickSchema, async ({ gameId, character }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      const seat = await getSeat(db, gameId, userId)
      if (seat?.status !== 'joined') throw new CommandError('NOT_MEMBER')
      try {
        await db
          .update(gamePlayers)
          .set({ character })
          .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      } catch (error) {
        // First arrived at the server wins: the partial unique index decides.
        if (isUniqueViolation(error)) throw new CommandError('CHARACTER_TAKEN')
        throw error
      }
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:set_format',
    withAck(setFormatSchema, async ({ gameId, format }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      if (game.hostId !== userId) throw new CommandError('NOT_HOST')
      const seats = await listSeats(db, gameId)
      if (seats.length > format) throw new CommandError('FORMAT_INCOMPATIBLE')
      await db.update(games).set({ format }).where(eq(games.id, gameId))
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:kick',
    withAck(kickSchema, async ({ gameId, userId: targetId }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      if (game.hostId !== userId) throw new CommandError('NOT_HOST')
      if (targetId === userId) throw new CommandError('INVALID_TARGET')
      const seat = await getSeat(db, gameId, targetId)
      if (!seat || (seat.status !== 'joined' && seat.status !== 'invited')) {
        throw new CommandError('NOT_FOUND')
      }
      await db
        .update(gamePlayers)
        .set({ status: 'kicked', character: null })
        .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, targetId)))
      io.to(`user:${targetId}`).emit('game:kicked', { gameId })
      io.in(`user:${targetId}`).socketsLeave(`game:${gameId}`)
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:leave',
    withAck(leaveSchema, async ({ gameId }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      const seat = await getSeat(db, gameId, userId)
      if (!seat || (seat.status !== 'joined' && seat.status !== 'invited')) {
        throw new CommandError('NOT_MEMBER')
      }
      await db
        .update(gamePlayers)
        .set({ status: 'left', leftAt: new Date(), character: null })
        .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      io.in(`user:${userId}`).socketsLeave(`game:${gameId}`)
      if (game.hostId === userId) {
        const remaining = await listSeats(db, gameId)
        const joined = remaining.filter((s) => s.status === 'joined')
        if (joined.length === 0) {
          // Last player out: dissolve the lobby, the code is burned forever.
          await db
            .update(games)
            .set({ status: 'finished', outcome: 'aborted', endedAt: new Date() })
            .where(eq(games.id, gameId))
          return OK
        }
        await transferHost(db, io, gameId, userId, (id) => presence.isOnline(id))
      }
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:start',
    withAck(startSchema, async ({ gameId }) => {
      const ack = await manager.startGame(gameId, userId)
      if (ack.ok) {
        const [firstEvent] = ack.firstEvents
        if (firstEvent && firstEvent.type === 'GAME_STARTED') {
          for (const seatSnapshot of firstEvent.payload.players) {
            await presence.setInGame(seatSnapshot.userId, true)
          }
        }
      }
      return ack
    })
  )
}
