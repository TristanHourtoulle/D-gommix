import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { canonicalPair, friendships, gamePlayers, games, user } from '@degommix/db'
import { CommandError, isUniqueViolation, OK, withAck } from '../ack'
import type { AppContext } from '../context'
import { generateGameCode } from '../game-code'
import { broadcastLobbyState, loadLobbyState } from '../lobby-state'
import {
  assertLobby,
  assertNotJoinedElsewhere,
  findActiveMemberships,
  getGameOrThrow,
  getSeat,
  listSeats,
} from '../lobby-shared'
import type { AppSocket } from '../socket-types'

const formatSchema = z.union([z.literal(2), z.literal(3), z.literal(4)])
const createSchema = z.object({ format: formatSchema })
const inviteSchema = z.object({ gameId: z.uuid(), friendId: z.string().min(1) })
const cancelInviteSchema = z.object({ gameId: z.uuid(), userId: z.string().min(1) })
const respondInviteSchema = z.object({ gameId: z.uuid(), accept: z.boolean() })
const joinByCodeSchema = z.object({ code: z.string().min(1).max(12) })

const CODE_INSERT_ATTEMPTS = 5

export async function createLobby(
  ctx: AppContext,
  hostId: string,
  format: 2 | 3 | 4
): Promise<{ gameId: string; code: string }> {
  const { db } = ctx
  for (let attempt = 0; attempt < CODE_INSERT_ATTEMPTS; attempt++) {
    const code = generateGameCode()
    try {
      return await db.transaction(async (tx) => {
        const [game] = await tx
          .insert(games)
          .values({ code, format, hostId })
          .returning({ id: games.id, code: games.code })
        if (!game) throw new CommandError('INTERNAL')
        await tx.insert(gamePlayers).values({
          gameId: game.id,
          userId: hostId,
          status: 'joined',
          joinedAt: new Date(),
        })
        return { gameId: game.id, code: game.code }
      })
    } catch (error) {
      if (isUniqueViolation(error) && attempt < CODE_INSERT_ATTEMPTS - 1) continue
      throw error
    }
  }
  throw new CommandError('INTERNAL', 'could not generate a unique game code')
}

/** Seats a user as `invited`, reusing a previous declined/kicked/left row. */
export async function inviteSeat(ctx: AppContext, gameId: string, userId: string): Promise<void> {
  const existing = await getSeat(ctx.db, gameId, userId)
  if (existing) {
    if (existing.status === 'invited' || existing.status === 'joined') {
      throw new CommandError('INTERNAL', 'already invited')
    }
    await ctx.db
      .update(gamePlayers)
      .set({ status: 'invited', joinedAt: null, leftAt: null, character: null })
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
  } else {
    await ctx.db.insert(gamePlayers).values({ gameId, userId, status: 'invited' })
  }
}

export function registerLobbyHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, io } = ctx
  const userId = socket.data.userId

  socket.on(
    'lobby:create',
    withAck(createSchema, async ({ format }) => {
      await assertNotJoinedElsewhere(db, io, userId)
      const { gameId, code } = await createLobby(ctx, userId, format)
      await socket.join(`game:${gameId}`)
      await broadcastLobbyState(db, io, gameId)
      return { ok: true, gameId, code }
    })
  )

  socket.on(
    'lobby:invite',
    withAck(inviteSchema, async ({ gameId, friendId }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      const seat = await getSeat(db, gameId, userId)
      if (seat?.status !== 'joined') throw new CommandError('NOT_MEMBER')
      const [low, high] = canonicalPair(userId, friendId)
      const [friendship] = await db
        .select()
        .from(friendships)
        .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
      if (!friendship) throw new CommandError('INVALID_TARGET', 'not a friend')
      const friendGames = await findActiveMemberships(db, friendId)
      if (friendGames.some((m) => m.player.status === 'joined')) {
        throw new CommandError('ALREADY_IN_GAME', 'friend already has an active game')
      }
      const seats = await listSeats(db, gameId)
      if (seats.length >= game.format) throw new CommandError('LOBBY_FULL')
      await inviteSeat(ctx, gameId, friendId)
      const [host] = await db.select().from(user).where(eq(user.id, game.hostId))
      io.to(`user:${friendId}`).emit('invite:received', {
        gameId,
        hostUsername: host?.username ?? '',
        format: game.format,
      })
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:cancel_invite',
    withAck(cancelInviteSchema, async ({ gameId, userId: targetId }) => {
      const game = await getGameOrThrow(db, gameId)
      assertLobby(game)
      if (game.hostId !== userId) throw new CommandError('NOT_HOST')
      const seat = await getSeat(db, gameId, targetId)
      if (seat?.status !== 'invited') throw new CommandError('NOT_FOUND')
      await db
        .delete(gamePlayers)
        .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, targetId)))
      io.to(`user:${targetId}`).emit('invite:canceled', { gameId })
      await broadcastLobbyState(db, io, gameId)
      return OK
    })
  )

  socket.on(
    'lobby:respond_invite',
    withAck(respondInviteSchema, async ({ gameId, accept }) => {
      const game = await getGameOrThrow(db, gameId)
      const seat = await getSeat(db, gameId, userId)
      if (seat?.status !== 'invited') throw new CommandError('NOT_FOUND')
      if (!accept) {
        await db
          .update(gamePlayers)
          .set({ status: 'declined' })
          .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
        await broadcastLobbyState(db, io, gameId)
        return OK
      }
      assertLobby(game)
      const seats = await listSeats(db, gameId)
      const joinedCount = seats.filter((s) => s.status === 'joined').length
      if (joinedCount >= game.format) throw new CommandError('LOBBY_FULL')
      await db
        .update(gamePlayers)
        .set({ status: 'joined', joinedAt: new Date() })
        .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      await socket.join(`game:${gameId}`)
      const lobbyState = await broadcastLobbyState(db, io, gameId)
      return { ok: true, lobbyState }
    })
  )

  socket.on(
    'lobby:join_by_code',
    withAck(joinByCodeSchema, async ({ code }) => {
      const [game] = await db
        .select()
        .from(games)
        .where(eq(games.code, code.toUpperCase()))
      if (!game || game.status !== 'lobby') throw new CommandError('INVALID_CODE')
      const seat = await getSeat(db, game.id, userId)
      if (seat?.status === 'joined') {
        await socket.join(`game:${game.id}`)
        const lobbyState = await loadLobbyState(db, game.id)
        return { ok: true, gameId: game.id, lobbyState }
      }
      await assertNotJoinedElsewhere(db, io, userId, { exceptGameId: game.id })
      const seats = await listSeats(db, game.id)
      const joinedCount = seats.filter((s) => s.status === 'joined').length
      if (joinedCount >= game.format) throw new CommandError('LOBBY_FULL')
      if (seat) {
        await db
          .update(gamePlayers)
          .set({ status: 'joined', joinedAt: new Date(), leftAt: null })
          .where(and(eq(gamePlayers.gameId, game.id), eq(gamePlayers.userId, userId)))
      } else {
        await db.insert(gamePlayers).values({
          gameId: game.id,
          userId,
          status: 'joined',
          joinedAt: new Date(),
        })
      }
      await socket.join(`game:${game.id}`)
      const lobbyState = await broadcastLobbyState(db, io, game.id)
      return { ok: true, gameId: game.id, lobbyState }
    })
  )
}
