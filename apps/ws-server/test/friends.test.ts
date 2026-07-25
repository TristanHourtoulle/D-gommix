import { eq, and } from 'drizzle-orm'
import { friendRequests, friendships } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  emitAck,
  expectNoEvent,
  expectOk,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

interface FriendsEvent {
  kind: string
  requestId: string
  from: { id: string; username: string }
}

describe('friends commands', () => {
  let ts: TestServer

  beforeAll(async () => {
    await migrateTestDb()
    ts = await startTestServer()
  })

  afterAll(async () => {
    await ts.stop()
  })

  beforeEach(async () => {
    await ts.reset(['u1', 'u2'])
  })

  it('request + accept creates the canonical friendship and notifies both sides', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')

    const received = waitForEvent<FriendsEvent>(s2, 'friends:event')
    const requestAck = expectOk(
      await emitAck<{ requestId: string }>(s1, 'friends:request', { receiverId: 'u2' })
    )
    const event = await received
    expect(event.kind).toBe('request_received')
    expect(event.requestId).toBe(requestAck.requestId)
    expect(event.from).toEqual({ id: 'u1', username: 'u1' })

    const accepted = waitForEvent<FriendsEvent>(s1, 'friends:event')
    expectOk(
      await emitAck(s2, 'friends:respond', { requestId: requestAck.requestId, accept: true })
    )
    expect((await accepted).kind).toBe('request_accepted')

    const rows = await ts.db.select().from(friendships)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userLow: 'u1', userHigh: 'u2' })
  })

  it('rejects a duplicate pending request', async () => {
    const s1 = await ts.connectAs('u1')
    expectOk(await emitAck(s1, 'friends:request', { receiverId: 'u2' }))
    const dup = await emitAck(s1, 'friends:request', { receiverId: 'u2' })
    expect(dup.ok).toBe(false)
  })

  it('rejects a request to an existing friend', async () => {
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
    const s1 = await ts.connectAs('u1')
    const ack = await emitAck(s1, 'friends:request', { receiverId: 'u2' })
    expect(ack.ok).toBe(false)
  })

  it('cancel marks the request canceled and allows re-sending', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const first = expectOk(
      await emitAck<{ requestId: string }>(s1, 'friends:request', { receiverId: 'u2' })
    )
    const canceled = waitForEvent<FriendsEvent>(s2, 'friends:event')
    expectOk(await emitAck(s1, 'friends:cancel', { requestId: first.requestId }))
    expect((await canceled).kind).toBe('request_canceled')

    const [row] = await ts.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, first.requestId))
    expect(row?.status).toBe('canceled')

    const again = await emitAck<{ requestId: string }>(s1, 'friends:request', {
      receiverId: 'u2',
    })
    expect(again.ok).toBe(true)
  })

  it('remove deletes the friendship silently', async () => {
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')

    expectOk(await emitAck(s1, 'friends:remove', { friendId: 'u2' }))

    const rows = await ts.db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userLow, 'u1'), eq(friendships.userHigh, 'u2')))
    expect(rows).toHaveLength(0)
    await expectNoEvent(s2, 'friends:event', 200)
  })

  it('rate limits the 11th friends:request within a minute', async () => {
    const s1 = await ts.connectAs('u1')
    for (let i = 0; i < 10; i++) {
      // Target does not need to exist for the limiter to count the attempt.
      await emitAck(s1, 'friends:request', { receiverId: `ghost-${i}` })
    }
    const eleventh = await emitAck(s1, 'friends:request', { receiverId: 'u2' })
    expect(eleventh).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
  })
})
