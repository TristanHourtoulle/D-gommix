import { and, eq } from 'drizzle-orm'
import { seals } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { awardSeals } from '../src/seals'
import { startGameWith, sendCommand } from './flows'
import { expectOk, startTestServer, type TestServer } from './harness'

describe('seal awards in the finalize transaction', () => {
  let ts: TestServer

  beforeAll(async () => {
    await migrateTestDb()
    ts = await startTestServer()
  })

  afterAll(async () => {
    await ts.stop()
  })

  beforeEach(async () => {
    await ts.reset(['u1', 'u2', 'u3', 'u4'])
  })

  const sealsOf = async (userId: string): Promise<{ sealId: string; gameId: string }[]> =>
    ts.db
      .select({ sealId: seals.sealId, gameId: seals.gameId })
      .from(seals)
      .where(eq(seals.userId, userId))

  const countAll = async (): Promise<number> => (await ts.db.select().from(seals)).length

  it('engraves imperator and first_win for an untouched first-time winner', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    const rows = await sealsOf('u1')
    expect(rows.map((r) => r.sealId).sort()).toEqual(['first_win', 'imperator'])
    for (const row of rows) expect(row.gameId).toBe(gameId)
  })

  it('gives the loser of that same 1v1 nothing', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    expect(await sealsOf('u2')).toEqual([])
  })

  it('keeps imperator when the winner’s only degommage was undone', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s2, gameId, { type: 'degommage', targetId: 'u1' }))
    expectOk(await sendCommand(s2, gameId, { type: 'undo' }))
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).toContain('imperator')
  })

  it('is idempotent: replaying awardSeals over a finished game inserts nothing', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    const before = await countAll()
    expect(before).toBeGreaterThan(0)

    const state = await ts.server.manager.getState(gameId)
    if (!state) throw new Error('missing state')
    const replayed = await ts.db.transaction((tx) => awardSeals(tx, gameId, state))

    expect(replayed.size).toBe(0)
    expect(await countAll()).toBe(before)
  })

  it('keeps first_win pinned to the game that first earned it', async () => {
    const first = await startGameWith(ts, ['u1', 'u2'])
    const f1 = first.sockets.get('u1')
    if (!f1) throw new Error('missing socket')
    expectOk(
      await sendCommand(f1, first.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u1',
      })
    )

    const [firstRow] = await ts.db
      .select()
      .from(seals)
      .where(and(eq(seals.userId, 'u1'), eq(seals.sealId, 'first_win')))
    expect(firstRow?.gameId).toBe(first.gameId)
    const unlockedAt = firstRow?.unlockedAt

    ts.disconnectAll()
    const second = await startGameWith(ts, ['u1', 'u2'])
    const s1 = second.sockets.get('u1')
    if (!s1) throw new Error('missing socket')
    expectOk(
      await sendCommand(s1, second.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u1',
      })
    )

    const [afterRow] = await ts.db
      .select()
      .from(seals)
      .where(and(eq(seals.userId, 'u1'), eq(seals.sealId, 'first_win')))
    expect(afterRow?.gameId).toBe(first.gameId)
    expect(afterRow?.unlockedAt).toEqual(unlockedAt)
  })

  it('awards village_tour once, in the game where every opponent was hit', async () => {
    const first = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const f1 = first.sockets.get('u1')
    if (!f1) throw new Error('missing socket')
    for (const target of ['u2', 'u3', 'u4']) {
      expectOk(await sendCommand(f1, first.gameId, { type: 'degommage', targetId: target }))
    }
    // u1 is the host: its request auto-validates and closes the game.
    expectOk(
      await sendCommand(f1, first.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    const afterFirst = await sealsOf('u1')
    expect(afterFirst.map((r) => r.sealId)).toEqual(['village_tour'])
    expect(afterFirst[0]?.gameId).toBe(first.gameId)

    // A second game where u1 skips an opponent adds no row: already earned.
    ts.disconnectAll()
    const second = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const s1 = second.sockets.get('u1')
    if (!s1) throw new Error('missing socket')
    expectOk(await sendCommand(s1, second.gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, second.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    const afterSecond = await sealsOf('u1')
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0]?.gameId).toBe(first.gameId)
  })

  it('awards nothing when the game is aborted', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    const s2 = sockets.get('u2')
    if (!s1 || !s2) throw new Error('missing sockets')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(await sendCommand(s2, gameId, { type: 'request_end', kind: 'abandon_total' }))
    expectOk(await sendCommand(s1, gameId, { type: 'respond_end', accept: true }))

    expect(await countAll()).toBe(0)
  })
})
