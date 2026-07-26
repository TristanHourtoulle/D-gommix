import { eq, friendships, games } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { LobbyState } from '../src/lobby-state'
import {
  emitAck,
  expectOk,
  startTestServer,
  waitForEvent,
  waitForEventMatching,
  type TestServer,
} from './harness'

describe('lobby flow', () => {
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

  it('create, join by code and pick characters', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')

    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expect(created.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)

    const joined = expectOk(
      await emitAck<{ gameId: string; lobbyState: LobbyState }>(s2, 'lobby:join_by_code', {
        code: created.code,
      })
    )
    expect(joined.gameId).toBe(created.gameId)
    expect(joined.lobbyState.players.map((p) => p.userId).sort()).toEqual(['u1', 'u2'])

    expectOk(
      await emitAck(s1, 'lobby:pick_character', { gameId: created.gameId, character: 'asterix' })
    )
    const finalState = waitForEventMatching<LobbyState>(
      s2,
      'lobby:state',
      (state) => state.players.every((p) => p.character !== null)
    )
    expectOk(
      await emitAck(s2, 'lobby:pick_character', { gameId: created.gameId, character: 'obelix' })
    )
    const state = await finalState
    const byUser = new Map(state.players.map((p) => [p.userId, p.character]))
    expect(byUser.get('u1')).toBe('asterix')
    expect(byUser.get('u2')).toBe('obelix')
    expect(state.hostId).toBe('u1')
  })

  it('resolves a concurrent character pick: one ok, one CHARACTER_TAKEN', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expectOk(await emitAck(s2, 'lobby:join_by_code', { code: created.code }))

    const [a, b] = await Promise.all([
      emitAck(s1, 'lobby:pick_character', { gameId: created.gameId, character: 'obelix' }),
      emitAck(s2, 'lobby:pick_character', { gameId: created.gameId, character: 'obelix' }),
    ])
    const oks = [a, b].filter((ack) => ack.ok)
    const fails = [a, b].filter((ack) => !ack.ok)
    expect(oks).toHaveLength(1)
    expect(fails).toHaveLength(1)
    expect(fails[0]).toMatchObject({ ok: false, code: 'CHARACTER_TAKEN' })
  })

  it('kick notifies the kicked player', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expectOk(await emitAck(s2, 'lobby:join_by_code', { code: created.code }))

    const kicked = waitForEvent<{ gameId: string }>(s2, 'game:kicked')
    expectOk(await emitAck(s1, 'lobby:kick', { gameId: created.gameId, userId: 'u2' }))
    expect(await kicked).toEqual({ gameId: created.gameId })
  })

  it('refuses shrinking the format below the seated player count', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const s3 = await ts.connectAs('u3')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 4 })
    )
    expectOk(await emitAck(s2, 'lobby:join_by_code', { code: created.code }))
    expectOk(await emitAck(s3, 'lobby:join_by_code', { code: created.code }))

    const ack = await emitAck(s1, 'lobby:set_format', { gameId: created.gameId, format: 2 })
    expect(ack).toMatchObject({ ok: false, code: 'FORMAT_INCOMPATIBLE' })
  })

  it('lobby:create evacuates a stale never-started lobby instead of refusing', async () => {
    const s1 = await ts.connectAs('u1')
    const first = expectOk(
      await emitAck<{ gameId: string }>(s1, 'lobby:create', { format: 2 })
    )
    const second = expectOk(
      await emitAck<{ gameId: string }>(s1, 'lobby:create', { format: 2 })
    )
    expect(second.gameId).not.toBe(first.gameId)

    // The abandoned lobby is dissolved: seat left, code burned forever.
    const [firstGame] = await ts.db.select().from(games).where(eq(games.id, first.gameId))
    expect(firstGame?.status).toBe('finished')
    expect(firstGame?.outcome).toBe('aborted')
  })

  it('burns the code when the last player leaves (dissolved lobby)', async () => {
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )
    expectOk(await emitAck(s1, 'lobby:leave', { gameId: created.gameId }))

    const ack = await emitAck(s2, 'lobby:join_by_code', { code: created.code })
    expect(ack).toMatchObject({ ok: false, code: 'INVALID_CODE' })

    // The row stays as the burned-code registry, but it never started: this is
    // the exact shape the web history/stats queries must filter out
    // (apps/web/src/lib/queries/game-filters.ts).
    const [game] = await ts.db.select().from(games).where(eq(games.id, created.gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('aborted')
    expect(game?.startedAt).toBeNull()
  })

  it('invite + accept seats the friend as joined', async () => {
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
    const s1 = await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format: 2 })
    )

    const invite = waitForEvent<{ gameId: string; hostUsername: string; format: number }>(
      s2,
      'invite:received'
    )
    expectOk(await emitAck(s1, 'lobby:invite', { gameId: created.gameId, friendId: 'u2' }))
    expect(await invite).toEqual({ gameId: created.gameId, hostUsername: 'u1', format: 2 })

    const responded = expectOk(
      await emitAck<{ lobbyState: LobbyState }>(s2, 'lobby:respond_invite', {
        gameId: created.gameId,
        accept: true,
      })
    )
    const me = responded.lobbyState.players.find((p) => p.userId === 'u2')
    expect(me?.status).toBe('joined')
  })
})
