import { and, eq } from 'drizzle-orm'
import { gameEvents, gamePlayers, games } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import type { GameEvent } from '@degommix/game-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startGameWith, sendCommand } from './flows'
import {
  collectEvents,
  expectOk,
  startTestServer,
  waitForEvent,
  type TestServer,
} from './harness'

describe('undo and end-of-game flows', () => {
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

  it('two concurrent undos target two distinct degommages', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))

    const [a, b] = await Promise.all([
      sendCommand(s1, gameId, { type: 'undo' }),
      sendCommand(s2, gameId, { type: 'undo' }),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)

    const undoRows = await ts.db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.type, 'UNDO')))
    expect(undoRows).toHaveLength(2)
    const targetSeqs = undoRows.map((row) => (row.payload as { targetSeq: number }).targetSeq)
    expect(new Set(targetSeqs).size).toBe(2)

    const state = await ts.server.manager.getState(gameId)
    expect(state?.players['u1']?.degommages).toBe(0)
  })

  it('rejects undo on an empty log with NOTHING_TO_UNDO', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')
    const ack = await sendCommand(s1, gameId, { type: 'undo' })
    expect(ack).toMatchObject({ ok: false, code: 'NOTHING_TO_UNDO' })
  })

  it('village end: non-host request + host validation denormalizes the game', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(await sendCommand(s2, gameId, { type: 'degommage', targetId: 'u1' }))
    // Undo cancels the last degommage (u2's): it must not be counted.
    expectOk(await sendCommand(s2, gameId, { type: 'undo' }))

    expectOk(
      await sendCommand(s2, gameId, { type: 'request_end', kind: 'village', winnerId: 'u2' })
    )
    expectOk(await sendCommand(s1, gameId, { type: 'respond_end', accept: true }))

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('village_reached')
    expect(game?.winnerId).toBe('u2')
    expect(game?.endedAt).not.toBeNull()

    const players = await ts.db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
    const byUser = new Map(players.map((p) => [p.userId, p.degommages]))
    expect(byUser.get('u1')).toBe(2)
    expect(byUser.get('u2')).toBe(0)
  })

  it('host request auto-validates: two events appended, single ack', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    const broadcast = collectEvents<GameEvent>(s2, 'game:event', 2)
    const ack = expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )
    const events = await broadcast
    expect(events.map((e) => e.type)).toEqual(['END_REQUESTED', 'END_VALIDATED'])
    expect(ack.seq).toBe(events[0]?.seq)

    const rows = await ts.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId))
    expect(rows.filter((r) => r.type === 'END_REQUESTED')).toHaveLength(1)
    expect(rows.filter((r) => r.type === 'END_VALIDATED')).toHaveLength(1)

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.winnerId).toBe('u1')
  })

  it('rejection keeps the game running', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(
      await sendCommand(s2, gameId, { type: 'request_end', kind: 'village', winnerId: 'u2' })
    )
    expectOk(await sendCommand(s1, gameId, { type: 'respond_end', accept: false }))

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('active')
    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
  })

  it('a second end request while one is pending gets END_REQUEST_PENDING', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(
      await sendCommand(s2, gameId, { type: 'request_end', kind: 'village', winnerId: 'u2' })
    )
    const second = await sendCommand(s2, gameId, { type: 'request_end', kind: 'abandon_total' })
    expect(second).toMatchObject({ ok: false, code: 'END_REQUEST_PENDING' })
  })

  it('individual abandon with 3 players appends PLAYER_QUIT and continues', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2', 'u3'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s2, gameId, { type: 'request_end', kind: 'abandon_individual' }))
    expectOk(await sendCommand(s1, gameId, { type: 'respond_end', accept: true }))

    const rows = await ts.db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.type, 'PLAYER_QUIT')))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actorId).toBe('u2')

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('active')
    const [seat] = await ts.db
      .select()
      .from(gamePlayers)
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, 'u2')))
    expect(seat?.status).toBe('left')
  })

  it('individual abandon with 2 players aborts the game', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s2, gameId, { type: 'request_end', kind: 'abandon_individual' }))
    expectOk(await sendCommand(s1, gameId, { type: 'respond_end', accept: true }))

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('aborted')
    expect(game?.winnerId).toBeNull()
  })

  it('emits stats:invalidate to every seated player user room on finish', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2', 'u3'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    const s3 = sockets.get('u3')
    if (!s1 || !s2 || !s3) throw new Error('missing sockets')

    // Attached before the trigger: the emit lands in the same tick as finish.
    const invalidations = Promise.all([
      waitForEvent(s1, 'stats:invalidate'),
      waitForEvent(s2, 'stats:invalidate'),
      waitForEvent(s3, 'stats:invalidate'),
    ])
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u2' })
    )

    const payloads = await invalidations
    for (const payload of payloads) {
      expect(payload).toEqual({ scope: 'game_finished' })
    }
  })

  it('rejects any command after closure with GAME_FINISHED', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')

    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )
    const late = await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' })
    expect(late).toMatchObject({ ok: false, code: 'GAME_FINISHED' })
  })
})
