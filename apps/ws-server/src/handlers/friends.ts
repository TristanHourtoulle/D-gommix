import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { canonicalPair, friendRequests, friendships, user } from '@degommix/db'
import { CommandError, isUniqueViolation, OK, withAck } from '../ack'
import type { AppContext } from '../context'
import type { AppSocket } from '../socket-types'

const requestSchema = z.object({ receiverId: z.string().min(1) })
const respondSchema = z.object({ requestId: z.uuid(), accept: z.boolean() })
const cancelSchema = z.object({ requestId: z.uuid() })
const removeSchema = z.object({ friendId: z.string().min(1) })

const FRIENDS_RATE_LIMIT = 10
const FRIENDS_RATE_WINDOW_MS = 60_000

export function registerFriendsHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, io, limiter } = ctx
  const userId = socket.data.userId

  const getUsername = async (id: string): Promise<string> => {
    const [row] = await db.select({ username: user.username }).from(user).where(eq(user.id, id))
    return row?.username ?? ''
  }

  socket.on(
    'friends:request',
    withAck(requestSchema, async ({ receiverId }) => {
      limiter.assert(`${socket.id}:friends:request`, FRIENDS_RATE_LIMIT, FRIENDS_RATE_WINDOW_MS)
      if (receiverId === userId) throw new CommandError('INVALID_TARGET')
      const [receiver] = await db.select().from(user).where(eq(user.id, receiverId))
      if (!receiver) throw new CommandError('NOT_FOUND')
      const [low, high] = canonicalPair(userId, receiverId)
      const [existingFriendship] = await db
        .select()
        .from(friendships)
        .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
      if (existingFriendship) throw new CommandError('INTERNAL', 'already friends')
      const [pending] = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            or(
              and(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, receiverId)),
              and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, userId))
            ),
            eq(friendRequests.status, 'pending')
          )
        )
      if (pending) throw new CommandError('INTERNAL', 'request already pending')
      let requestId: string
      try {
        const [inserted] = await db
          .insert(friendRequests)
          .values({ senderId: userId, receiverId })
          .returning({ id: friendRequests.id })
        if (!inserted) throw new CommandError('INTERNAL')
        requestId = inserted.id
      } catch (error) {
        if (isUniqueViolation(error)) throw new CommandError('INTERNAL', 'request already pending')
        throw error
      }
      io.to(`user:${receiverId}`).emit('friends:event', {
        kind: 'request_received',
        requestId,
        from: { id: userId, username: await getUsername(userId) },
      })
      return { ok: true, requestId }
    })
  )

  socket.on(
    'friends:respond',
    withAck(respondSchema, async ({ requestId, accept }) => {
      const [request] = await db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, requestId))
      if (!request || request.status !== 'pending' || request.receiverId !== userId) {
        throw new CommandError('NOT_FOUND')
      }
      if (accept) {
        const [low, high] = canonicalPair(request.senderId, request.receiverId)
        await db.transaction(async (tx) => {
          await tx
            .update(friendRequests)
            .set({ status: 'accepted', updatedAt: new Date() })
            .where(eq(friendRequests.id, requestId))
          await tx.insert(friendships).values({ userLow: low, userHigh: high })
        })
        io.to(`user:${request.senderId}`).emit('friends:event', {
          kind: 'request_accepted',
          requestId,
          from: { id: userId, username: await getUsername(userId) },
        })
      } else {
        await db
          .update(friendRequests)
          .set({ status: 'declined', updatedAt: new Date() })
          .where(eq(friendRequests.id, requestId))
      }
      return OK
    })
  )

  socket.on(
    'friends:cancel',
    withAck(cancelSchema, async ({ requestId }) => {
      const [request] = await db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, requestId))
      if (!request || request.status !== 'pending' || request.senderId !== userId) {
        throw new CommandError('NOT_FOUND')
      }
      await db
        .update(friendRequests)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(friendRequests.id, requestId))
      io.to(`user:${request.receiverId}`).emit('friends:event', {
        kind: 'request_canceled',
        requestId,
        from: { id: userId, username: await getUsername(userId) },
      })
      return OK
    })
  )

  socket.on(
    'friends:remove',
    withAck(removeSchema, async ({ friendId }) => {
      const [low, high] = canonicalPair(userId, friendId)
      // Silent removal: no event is emitted towards the ex-friend.
      await db
        .delete(friendships)
        .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
      return OK
    })
  )
}
