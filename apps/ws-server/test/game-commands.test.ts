import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { friendships, gameEvents } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import type { GameEvent } from '@degommix/game-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startGameWith, sendCommand } from './flows'
import {
  collectEvents,
  emitAck,
  expectNoEvent,
  expectOk,
  startTestServer,
  type TestServer,
} from './harness'

describe('game commands', () => {
  let ts: TestServer

  beforeAll(async () => {
    await migrateTestDb()
    ts = await startTestServer()
  })

  afterAll(async () => {
    await ts.stop()
  })

  beforeEach(async () => {
    await ts.reset(['u1', 'u2', 'u3'])
  })

  it('blocks start on a pending invite, unblocks after cancel_invite', async () => {
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u3' })
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expectOk(await emitAck(s2, 'lobby:join_by_code', { code: created.code }))
    expectOk(
      await emitAck(s1, 'lobby:pick_character', { gameId: created.gameId, character: 'asterix' })
    )
    expectOk(
      await emitAck(s2, 'lobby:pick_character', { gameId: created.gameId, character: 'obelix' })
    )
    // Grow the lobby so a third seat can hold a pending invite.
    expectOk(await emitAck(s1, 'lobby:set_format', { gameId: created.gameId, format: 3 }))
    expectOk(await emitAck(s1, 'lobby:invite', { gameId: created.gameId, friendId: 'u3' }))

    const blocked = await emitAck(s1, 'lobby:start', { gameId: created.gameId })
    expect(blocked).toMatchObject({ ok: false, code: 'PENDING_INVITES' })

    expectOk(await emitAck(s1, 'lobby:cancel_invite', { gameId: created.gameId, userId: 'u3' }))
    expectOk(await emitAck(s1, 'lobby:set_format', { gameId: created.gameId, format: 2 }))
    const started = expectOk(
      await emitAck<{ firstEvents: GameEvent[] }>(s1, 'lobby:start', { gameId: created.gameId })
    )
    expect(started.firstEvents[0]?.type).toBe('GAME_STARTED')
    expect(started.firstEvents[0]?.seq).toBe(1)
  })

  it('broadcasts degommages to every client in the same seq order', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    const events1 = collectEvents<GameEvent>(s1, 'game:event', 3)
    const events2 = collectEvents<GameEvent>(s2, 'game:event', 3)
    for (let i = 0; i < 3; i++) {
      expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    }
    const [got1, got2] = await Promise.all([events1, events2])
    expect(got1.map((e) => e.seq)).toEqual([2, 3, 4])
    expect(got2.map((e) => e.seq)).toEqual([2, 3, 4])
    expect(got1.every((e) => e.type === 'DEGOMMAGE')).toBe(true)
  })

  it('is idempotent on clientEventId: same seq, single row, no re-broadcast', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    const clientEventId = randomUUID()
    const first = expectOk(
      await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }, clientEventId)
    )
    const before = await ts.db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId))

    const retry = expectOk(
      await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }, clientEventId)
    )
    expect(retry.seq).toBe(first.seq)

    const after = await ts.db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId))
    expect(after).toHaveLength(before.length)
    await expectNoEvent(s2, 'game:event', 250)
  })

  it('rejects commands from a non-member', async () => {
    const { gameId } = await startGameWith(ts, ['u1', 'u2'])
    const s3 = await ts.connectAs('u3')
    const ack = await sendCommand(s3, gameId, { type: 'degommage', targetId: 'u2' })
    expect(ack).toMatchObject({ ok: false, code: 'NOT_MEMBER' })
  })

  it('rejects self-degommage with INVALID_TARGET', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')
    const ack = await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u1' })
    expect(ack).toMatchObject({ ok: false, code: 'INVALID_TARGET' })
  })
})
