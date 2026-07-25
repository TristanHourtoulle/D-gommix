import { eq, sql } from 'drizzle-orm'
import { gameEvents, gamePlayers, games } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import type { GameEvent } from '@degommix/game-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startGameWith, sendCommand } from './flows'
import {
  emitAck,
  expectNoEvent,
  expectOk,
  sleep,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

interface Snapshot {
  gameId: string
  events: GameEvent[]
  serverNow: number
  hostId: string
}

describe('resync, host transfer, zombie job and replay', () => {
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

  it('resync returns exactly the events after lastSeq', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    s2.disconnect()
    for (let i = 0; i < 4; i++) {
      expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    }

    const s2b = await ts.connectAs('u2')
    const resync = expectOk(
      await emitAck<{ events: GameEvent[]; serverNow: number }>(s2b, 'game:resync', {
        gameId,
        lastSeq: 2,
      })
    )
    expect(resync.events.map((e) => e.seq)).toEqual([3, 4, 5])
    expect(typeof resync.serverNow).toBe('number')

    const full = expectOk(
      await emitAck<{ events: GameEvent[]; serverNow: number }>(s2b, 'game:resync', {
        gameId,
        lastSeq: 0,
      })
    )
    expect(full.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5])
    expect(full.events[0]?.type).toBe('GAME_STARTED')
  })

  it('handshake puts the player back in the room with a state snapshot', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    s2.disconnect()
    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))

    const s2b = await ts.connectAs('u2')
    const snapshot = await waitForEvent<Snapshot>(s2b, 'game:state_snapshot')
    expect(snapshot.gameId).toBe(gameId)
    expect(snapshot.hostId).toBe('u1')
    expect(snapshot.events.map((e) => e.seq)).toEqual([1, 2])

    // Back in the room: subsequent broadcasts arrive without an explicit join.
    const nextEvent = waitForEvent<GameEvent>(s2b, 'game:event')
    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expect((await nextEvent).seq).toBe(3)
  })

  it('transfers the host to the oldest connected player after 60s offline', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2', 'u3'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    s1.disconnect()
    await sleep(200) // let the disconnect handler arm the timer

    const changed = waitForEvent<{ newHostId: string }>(s2, 'game:host_changed')
    await ts.timers.advance(61_000)
    expect(await changed).toEqual({ newHostId: 'u2' })

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.hostId).toBe('u2')
  })

  it('cancels the transfer when the host reconnects within 60s', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    s1.disconnect()
    await sleep(200)
    await ts.timers.advance(30_000)
    await ts.connectAs('u1') // reconnect cancels the pending transfer
    await ts.timers.advance(40_000)

    await expectNoEvent(s2, 'game:host_changed', 300)
    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.hostId).toBe('u1')
  })

  it('the zombie sweep closes games inactive for more than 24h', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s2 = sockets.get('u2')
    if (!s2) throw new Error('missing socket')

    // Equivalent of a +25h clock: backdate the last activity.
    await ts.db
      .update(games)
      .set({ lastActivityAt: sql`now() - interval '25 hours'` })
      .where(eq(games.id, gameId))

    const autoClosed = waitForEvent<GameEvent>(s2, 'game:event')
    const closedCount = await ts.server.zombie.tick()
    expect(closedCount).toBe(1)
    expect((await autoClosed).type).toBe('GAME_AUTO_CLOSED')

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('aborted')
    const rows = await ts.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId))
    expect(rows.some((r) => r.type === 'GAME_AUTO_CLOSED')).toBe(true)
  })

  it('replay:create opens a new lobby and re-invites the former players', async () => {
    const { gameId, code, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    const invite = waitForEvent<{ gameId: string; hostUsername: string }>(s2, 'invite:received')
    const replay = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'replay:create', {
        finishedGameId: gameId,
      })
    )
    expect(replay.gameId).not.toBe(gameId)
    expect(replay.code).not.toBe(code)
    expect((await invite).gameId).toBe(replay.gameId)

    const seats = await ts.db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, replay.gameId))
    const byUser = new Map(seats.map((s) => [s.userId, s.status]))
    expect(byUser.get('u1')).toBe('joined')
    expect(byUser.get('u2')).toBe('invited')
  })
})
