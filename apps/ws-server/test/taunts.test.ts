import { eq } from 'drizzle-orm'
import { gameEvents } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startGameWith } from './flows'
import {
  emitAck,
  expectNoEvent,
  expectOk,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

interface TauntBroadcast {
  gameId: string
  fromId: string
  targetId: string
  tauntId: string
}

/**
 * « Balance une vanne » — the ephemeral taunt relay.
 *
 * IMPORTANT: the cooldown key is `${userId}:game:taunt` and `RateLimiter` is an
 * in-memory Map held by the server built once in `beforeAll`. `ts.reset()`
 * truncates the DATABASE, not the limiter — and the limit is 1 per 60 s while
 * this whole file runs in seconds. So a user who taunts in one test is still
 * rate-limited in the next: every test uses its own SENDER id. Seats may be
 * reused freely; only senders must be unique.
 *
 * Senders, in order: u1, u4, u6, u3, u5.
 */
describe('taunts', () => {
  let ts: TestServer

  beforeAll(async () => {
    await migrateTestDb()
    ts = await startTestServer()
  })

  afterAll(async () => {
    await ts.stop()
  })

  beforeEach(async () => {
    await ts.reset(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'])
  })

  it('relays the taunt to the whole room, sender included', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2', 'u3'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    const s3 = sockets.get('u3')
    if (!s1 || !s2 || !s3) throw new Error('missing sockets')

    // Attach BEFORE emitting: the sender's own copy arrives on the same tick.
    const received = Promise.all([
      waitForEvent<TauntBroadcast>(s1, 'game:taunt'),
      waitForEvent<TauntBroadcast>(s2, 'game:taunt'),
      waitForEvent<TauntBroadcast>(s3, 'game:taunt'),
    ])

    expectOk(
      await emitAck(s1, 'game:send_taunt', {
        gameId,
        targetId: 'u2',
        tauntId: 'crazy_romans',
      })
    )

    const expected = { gameId, fromId: 'u1', targetId: 'u2', tauntId: 'crazy_romans' }
    for (const payload of await received) expect(payload).toEqual(expected)
  })

  it('writes no game event: a taunt leaves no trace in the log', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u4', 'u5'])
    const s4 = sockets.get('u4')
    if (!s4) throw new Error('missing socket')

    const before = await ts.db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId))

    expectOk(
      await emitAck(s4, 'game:send_taunt', {
        gameId,
        targetId: 'u5',
        tauntId: 'by_toutatis',
      })
    )

    const after = await ts.db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId))
    expect(after).toHaveLength(before.length)
  })

  it('enforces the one-per-minute cooldown', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u6', 'u1'])
    const s6 = sockets.get('u6')
    const other = sockets.get('u1')
    if (!s6 || !other) throw new Error('missing sockets')

    expectOk(
      await emitAck(s6, 'game:send_taunt', { gameId, targetId: 'u1', tauntId: 'you_tremble' })
    )

    const second = await emitAck(s6, 'game:send_taunt', {
      gameId,
      targetId: 'u1',
      tauntId: 'menhir_faster',
    })
    expect(second).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    await expectNoEvent(other, 'game:taunt', 250)
  })

  it('rejects a taunt from a non-member', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const seated = sockets.get('u2')
    if (!seated) throw new Error('missing socket')
    const s3 = await ts.connectAs('u3')

    const ack = await emitAck(s3, 'game:send_taunt', {
      gameId,
      targetId: 'u2',
      tauntId: 'stable_awaits',
    })
    expect(ack).toMatchObject({ ok: false, code: 'NOT_MEMBER' })
    await expectNoEvent(seated, 'game:taunt', 250)
  })

  it('rejects an unknown taunt id', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u5', 'u2'])
    const s5 = sockets.get('u5')
    const other = sockets.get('u2')
    if (!s5 || !other) throw new Error('missing sockets')

    const ack = await emitAck(s5, 'game:send_taunt', {
      gameId,
      targetId: 'u2',
      tauntId: 'not_a_taunt',
    })
    expect(ack).toMatchObject({ ok: false, code: 'INTERNAL' })
    await expectNoEvent(other, 'game:taunt', 250)
  })
})
