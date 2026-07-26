import { and, eq } from 'drizzle-orm'
import { games, seals } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backfillSeals } from '../src/backfill-seals'
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

/**
 * The retroactive replay (plan 033) must reconstruct history, not re-read
 * today's totals for every past game. Regression suite for the prod backfill
 * run, where every historical game saw the final state of the career.
 */
describe('retroactive backfill over a career', () => {
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

  /** One clean 1v1 (no degommages) closed by the host in favour of `winnerId`. */
  const playGame = async (winnerId: string): Promise<string> => {
    ts.disconnectAll()
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const host = sockets.get('u1')
    if (!host) throw new Error('missing socket')
    expectOk(await sendCommand(host, gameId, { type: 'request_end', kind: 'village', winnerId }))
    return gameId
  }

  /**
   * Plays the sequence, then rewrites `ended_at` to one minute apart in play
   * order. Games finished milliseconds apart could otherwise tie, and the
   * (ended_at, id) tiebreak on a random uuid would scramble chronology.
   */
  const playCareer = async (winners: string[]): Promise<string[]> => {
    const gameIds: string[] = []
    for (const winnerId of winners) gameIds.push(await playGame(winnerId))
    const base = Date.UTC(2026, 0, 1, 12, 0, 0)
    for (const [index, gameId] of gameIds.entries()) {
      await ts.db
        .update(games)
        .set({ endedAt: new Date(base + index * 60_000) })
        .where(eq(games.id, gameId))
    }
    return gameIds
  }

  /** Wipes what the live path engraved, leaving the games as bare history. */
  const replayFromScratch = async (): Promise<void> => {
    await ts.db.delete(seals)
    const summary = await backfillSeals(ts.db)
    expect(summary.failed).toBe(0)
    expect(summary.skipped).toBe(0)
  }

  const sealRow = async (
    userId: string,
    sealId: string
  ): Promise<{ gameId: string } | undefined> => {
    const [row] = await ts.db
      .select({ gameId: seals.gameId })
      .from(seals)
      .where(and(eq(seals.userId, userId), eq(seals.sealId, sealId)))
    return row
  }

  it(
    'pins rising_tide to the game that closed the FIRST three-win run',
    async () => {
      // u1 wins games 2-4 and 6-8; the career ends on a loss, so a query that
      // reads « the three most recent village games » absolutely sees a broken
      // streak and awards nothing — the prod false negative.
      const gameIds = await playCareer(['u2', 'u1', 'u1', 'u1', 'u2', 'u1', 'u1', 'u1', 'u2'])
      expect(gameIds).toHaveLength(9)

      await replayFromScratch()

      const risingTide = await sealRow('u1', 'rising_tide')
      expect(risingTide?.gameId).toBe(gameIds[3])
      // u2's three wins are games 1, 5 and 9: never consecutive.
      expect(await sealRow('u2', 'rising_tide')).toBeUndefined()
      // Sanity: the first win is still pinned to the first win, not to game 1.
      expect((await sealRow('u1', 'first_win'))?.gameId).toBe(gameIds[1])
    },
    60_000
  )

  it(
    'pins decurion to the tenth win, not to the first game replayed',
    async () => {
      const gameIds = await playCareer(Array.from({ length: 10 }, () => 'u1'))
      expect(gameIds).toHaveLength(10)

      await replayFromScratch()

      expect((await sealRow('u1', 'decurion'))?.gameId).toBe(gameIds[9])
      expect((await sealRow('u1', 'rising_tide'))?.gameId).toBe(gameIds[2])
    },
    60_000
  )
})
