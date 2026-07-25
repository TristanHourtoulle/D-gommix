import { friendships } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  expectNoEvent,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

interface PresenceUpdate {
  userId: string
  presence: string
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
    expect(await offline).toEqual({ userId: 'u1', presence: 'offline' })
  })

  it('does not notify non-friends', async () => {
    const s3 = await ts.connectAs('u3')
    await ts.connectAs('u1')
    await expectNoEvent(s3, 'presence:update', 300)
  })
})
