import { friendships } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  expectNoEvent,
  sleep,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

interface PresenceUpdate {
  userId: string
  presence: string
  lastSeenAt?: string
}

describe('presence', () => {
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
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
  })

  it('notifies friends when a user comes online', async () => {
    const s2 = await ts.connectAs('u2')
    const update = waitForEvent<PresenceUpdate>(s2, 'presence:update')
    await ts.connectAs('u1')
    expect(await update).toEqual({ userId: 'u1', presence: 'online' })
  })

  it('only goes offline when the last socket disconnects', async () => {
    const s2 = await ts.connectAs('u2')
    const online = waitForEvent<PresenceUpdate>(s2, 'presence:update')
    const s1a = await ts.connectAs('u1')
    const s1b = await ts.connectAs('u1')
    await online

    s1a.disconnect()
    await expectNoEvent(s2, 'presence:update', 300)

    const offline = waitForEvent<PresenceUpdate>(s2, 'presence:update')
    s1b.disconnect()
    const payload = await offline
    expect(payload).toEqual({
      userId: 'u1',
      presence: 'offline',
      lastSeenAt: expect.any(String),
    })
    // Round-trips through Date unchanged, i.e. a valid ISO 8601 string.
    expect(new Date(payload.lastSeenAt ?? '').toISOString()).toBe(payload.lastSeenAt)
  })

  it('does not notify non-friends', async () => {
    const s3 = await ts.connectAs('u3')
    await ts.connectAs('u1')
    await expectNoEvent(s3, 'presence:update', 300)
  })

  it('sends a snapshot of the friends already online to a connecting socket', async () => {
    await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    // u1 was already online: no transition happens, only the snapshot can carry it.
    expect(await waitForEvent<PresenceUpdate>(s2, 'presence:update')).toEqual({
      userId: 'u1',
      presence: 'online',
    })
  })

  it('sends in_game in the snapshot for a friend already in a game', async () => {
    const s1 = await ts.connectAs('u1')
    // u1's own handshake ends with syncInGameFlag(false); let it land first,
    // otherwise it silently clears the flag set here.
    await sleep(100)
    ts.server.presence.syncInGameFlag('u1', true)
    const s2 = await ts.connectAs('u2')
    expect(await waitForEvent<PresenceUpdate>(s2, 'presence:update')).toEqual({
      userId: 'u1',
      presence: 'in_game',
    })
    s1.disconnect()
  })

  it('does not send a snapshot entry for an offline friend', async () => {
    const s2 = await ts.connectAs('u2')
    await expectNoEvent(s2, 'presence:update', 300)
  })

  it('does not leak the presence of a non-friend', async () => {
    await ts.connectAs('u3')
    const s2 = await ts.connectAs('u2')
    await expectNoEvent(s2, 'presence:update', 300)
  })

  it('sends the snapshot to a second tab, which triggers no transition', async () => {
    await ts.connectAs('u1')
    await ts.connectAs('u2')
    const s2b = await ts.connectAs('u2')
    expect(await waitForEvent<PresenceUpdate>(s2b, 'presence:update')).toEqual({
      userId: 'u1',
      presence: 'online',
    })
  })
})
