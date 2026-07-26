import { and, eq } from 'drizzle-orm'
import { games, oraclePicks } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startGameWith } from './flows'
import { emitAck, expectOk, startTestServer, type TestServer } from './harness'

describe('lobby:oracle_pick', () => {
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

  /** Opens a 2-player lobby with u1 as host and u2 joined by code. */
  const openLobby = async (): Promise<{
    gameId: string
    s1: Awaited<ReturnType<TestServer['connectAs']>>
    s2: Awaited<ReturnType<TestServer['connectAs']>>
  }> => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expectOk(await emitAck(s2, 'lobby:join_by_code', { code: created.code }))
    return { gameId: created.gameId, s1, s2 }
  }

  const picksOf = async (gameId: string) =>
    ts.db.select().from(oraclePicks).where(eq(oraclePicks.gameId, gameId))

  const countAll = async (): Promise<number> => (await ts.db.select().from(oraclePicks)).length

  it('records a full prediction', async () => {
    const { gameId, s1 } = await openLobby()

    expectOk(
      await emitAck(s1, 'lobby:oracle_pick', {
        gameId,
        predictedWinnerId: 'u2',
        predictedSouffreDouleurId: 'u2',
      })
    )

    const rows = await picksOf(gameId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe('u1')
    expect(rows[0]?.predictedWinnerId).toBe('u2')
    expect(rows[0]?.predictedSouffreDouleurId).toBe('u2')
  })

  it('accepts a prediction without a souffre-douleur', async () => {
    const { gameId, s1 } = await openLobby()

    expectOk(await emitAck(s1, 'lobby:oracle_pick', { gameId, predictedWinnerId: 'u2' }))

    const rows = await picksOf(gameId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.predictedSouffreDouleurId).toBeNull()
  })

  it('overwrites a previous prediction and keeps created_at', async () => {
    const { gameId, s1 } = await openLobby()

    expectOk(
      await emitAck(s1, 'lobby:oracle_pick', {
        gameId,
        predictedWinnerId: 'u2',
        predictedSouffreDouleurId: 'u2',
      })
    )
    const [before] = await picksOf(gameId)

    expectOk(
      await emitAck(s1, 'lobby:oracle_pick', {
        gameId,
        predictedWinnerId: 'u1',
        predictedSouffreDouleurId: null,
      })
    )

    const rows = await picksOf(gameId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.predictedWinnerId).toBe('u1')
    expect(rows[0]?.predictedSouffreDouleurId).toBeNull()
    expect(rows[0]?.createdAt.getTime()).toBe(before?.createdAt.getTime())
  })

  it('refuses a prediction once the game has started', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')

    const ack = await emitAck(s1, 'lobby:oracle_pick', { gameId, predictedWinnerId: 'u2' })

    expect(ack).toMatchObject({ ok: false, code: 'LOBBY_ALREADY_STARTED' })
    expect(await countAll()).toBe(0)
  })

  it('refuses a prediction from a player with no seat', async () => {
    const { gameId } = await openLobby()
    const s3 = await ts.connectAs('u3')

    const ack = await emitAck(s3, 'lobby:oracle_pick', { gameId, predictedWinnerId: 'u2' })

    expect(ack).toMatchObject({ ok: false, code: 'NOT_MEMBER' })
    expect(await countAll()).toBe(0)
  })

  it('refuses a prediction naming a player outside the lobby', async () => {
    const { gameId, s1 } = await openLobby()

    const ack = await emitAck(s1, 'lobby:oracle_pick', { gameId, predictedWinnerId: 'u3' })

    expect(ack).toMatchObject({ ok: false, code: 'INVALID_TARGET' })
    expect(await countAll()).toBe(0)
  })

  it('lets a lobby where nobody predicted launch normally', async () => {
    // Regression guard for the owner's « optionnelle, pas obligatoire ! »
    // requirement: no prediction is ever made below, and the launch must still
    // succeed. If a future change ever gates the start path on the Oracle,
    // this is the test that goes red.
    const { gameId } = await startGameWith(ts, ['u1', 'u2'])

    expect(await countAll()).toBe(0)
    const [game] = await ts.db
      .select({ status: games.status })
      .from(games)
      .where(and(eq(games.id, gameId)))
    expect(game?.status).toBe('active')
  })
})
