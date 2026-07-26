import { and, eq, sql } from 'drizzle-orm'
import { friendships, gamePlayers, games } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import type { Socket as ClientSocket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { LobbyState } from '../src/lobby-state'
import {
  emitAck,
  expectNoEvent,
  expectOk,
  startTestServer,
  waitForEvent,
  waitForEventMatching,
  type TestServer,
} from './harness'

interface InviteReceived {
  gameId: string
  hostUsername: string
  format: number
}

describe('durable invitations', () => {
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
    // canonicalPair ordering: 'u1' < 'u2' lexicographically.
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
  })

  /** u1 opens a lobby; returns the host socket and the new game. */
  async function openLobby(
    format: 2 | 3 | 4 = 2
  ): Promise<{ s1: ClientSocket; gameId: string; code: string }> {
    const s1 = await ts.connectAs('u1')
    const created = expectOk(
      await emitAck<{ gameId: string; code: string }>(s1, 'lobby:create', { format })
    )
    return { s1, gameId: created.gameId, code: created.code }
  }

  /** u1 opens a lobby and invites u2; returns the new game id. */
  async function inviteU2(format: 2 | 3 | 4 = 2): Promise<{ gameId: string; code: string }> {
    const { s1, gameId, code } = await openLobby(format)
    expectOk(await emitAck(s1, 'lobby:invite', { gameId, friendId: 'u2' }))
    return { gameId, code }
  }

  async function seatStatus(gameId: string, userId: string): Promise<string | undefined> {
    const seats = await ts.db
      .select({ userId: gamePlayers.userId, status: gamePlayers.status })
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
    return seats.find((seat) => seat.userId === userId)?.status
  }

  it('re-pushes a pending invitation when the invitee reconnects', async () => {
    // u2 is offline while the invitation is created: nothing could reach it.
    const { gameId } = await inviteU2()

    const s2 = await ts.connectAs('u2')
    expect(await waitForEvent<InviteReceived>(s2, 'invite:received')).toEqual({
      gameId,
      hostUsername: 'u1',
      format: 2,
    })
  })

  it('re-pushes on reconnect after the socket dropped', async () => {
    const s2 = await ts.connectAs('u2')
    const { s1, gameId } = await openLobby()

    // Attach before the invite: the live broadcast is synchronous with the ack.
    const live = waitForEvent<InviteReceived>(s2, 'invite:received')
    expectOk(await emitAck(s1, 'lobby:invite', { gameId, friendId: 'u2' }))
    expect((await live).gameId).toBe(gameId)

    s2.disconnect()
    const s2b = await ts.connectAs('u2')
    expect(await waitForEvent<InviteReceived>(s2b, 'invite:received')).toEqual({
      gameId,
      hostUsername: 'u1',
      format: 2,
    })
  })

  it('does not re-push an invitation to a dissolved lobby', async () => {
    const { s1, gameId } = await openLobby()
    expectOk(await emitAck(s1, 'lobby:invite', { gameId, friendId: 'u2' }))
    // Host leaves with nobody joined: the lobby is dissolved (finished/aborted).
    expectOk(await emitAck(s1, 'lobby:leave', { gameId }))

    const s2 = await ts.connectAs('u2')
    await expectNoEvent(s2, 'invite:received', 300)
  })

  it('dissolving a lobby cancels the pending invitation live', async () => {
    const s2 = await ts.connectAs('u2')
    const { s1, gameId } = await openLobby()

    const received = waitForEvent<InviteReceived>(s2, 'invite:received')
    expectOk(await emitAck(s1, 'lobby:invite', { gameId, friendId: 'u2' }))
    expect((await received).gameId).toBe(gameId)

    // Attach before the leave: the cancel is synchronous with the ack.
    const canceled = waitForEvent<{ gameId: string }>(s2, 'invite:canceled')
    expectOk(await emitAck(s1, 'lobby:leave', { gameId }))
    expect(await canceled).toEqual({ gameId })

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('aborted')
  })

  it('a pending invitation no longer blocks lobby:create', async () => {
    const { gameId } = await inviteU2()

    const s2 = await ts.connectAs('u2')
    const created = expectOk(await emitAck<{ gameId: string }>(s2, 'lobby:create', { format: 2 }))
    expect(created.gameId).not.toBe(gameId)
    expect(await seatStatus(gameId, 'u2')).toBe('declined')
  })

  it('auto-declining a pending invitation notifies the host', async () => {
    const { s1, gameId } = await openLobby()
    expectOk(await emitAck(s1, 'lobby:invite', { gameId, friendId: 'u2' }))
    const s2 = await ts.connectAs('u2')

    const hostSees = waitForEventMatching<LobbyState>(s1, 'lobby:state', (state) =>
      state.players.every((player) => player.userId !== 'u2')
    )
    expectOk(await emitAck(s2, 'lobby:create', { format: 2 }))
    const state = await hostSees
    expect(state.gameId).toBe(gameId)
    expect(state.players.map((player) => player.userId)).toEqual(['u1'])
  })

  it('a joined seat still blocks lobby:create', async () => {
    const { gameId } = await inviteU2()
    const s2 = await ts.connectAs('u2')
    expectOk(await emitAck(s2, 'lobby:respond_invite', { gameId, accept: true }))

    const second = await emitAck(s2, 'lobby:create', { format: 2 })
    expect(second).toMatchObject({ ok: false, code: 'ALREADY_IN_GAME' })
  })

  it('accepting one invitation auto-declines the others and cancels them live', async () => {
    // canonicalPair ordering: 'u2' < 'u3' lexicographically.
    await ts.db.insert(friendships).values({ userLow: 'u2', userHigh: 'u3' })
    const { gameId: gameA } = await inviteU2()
    const s3 = await ts.connectAs('u3')
    const createdB = expectOk(await emitAck<{ gameId: string }>(s3, 'lobby:create', { format: 2 }))
    expectOk(await emitAck(s3, 'lobby:invite', { gameId: createdB.gameId, friendId: 'u2' }))

    const s2 = await ts.connectAs('u2')
    // Attach before the accept: the cancel is synchronous with the ack.
    const canceled = waitForEvent<{ gameId: string }>(s2, 'invite:canceled')
    expectOk(await emitAck(s2, 'lobby:respond_invite', { gameId: gameA, accept: true }))
    expect(await canceled).toEqual({ gameId: createdB.gameId })

    expect(await seatStatus(gameA, 'u2')).toBe('joined')
    expect(await seatStatus(createdB.gameId, 'u2')).toBe('declined')
  })

  it('a joined seat elsewhere blocks accepting a stale invitation', async () => {
    const { gameId } = await inviteU2()
    const s2 = await ts.connectAs('u2')
    // Creating a lobby auto-declines the pending invitation, so restore the
    // pre-fix stale state: an `invited` seat surviving while u2 sits `joined`.
    expectOk(await emitAck(s2, 'lobby:create', { format: 2 }))
    await ts.db
      .update(gamePlayers)
      .set({ status: 'invited' })
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, 'u2')))

    const ack = await emitAck(s2, 'lobby:respond_invite', { gameId, accept: true })
    expect(ack).toMatchObject({ ok: false, code: 'ALREADY_IN_GAME' })
    expect(await seatStatus(gameId, 'u2')).toBe('invited')
  })

  it('join_by_code into the lobby you were invited to still works', async () => {
    const { gameId, code } = await inviteU2()
    const s2 = await ts.connectAs('u2')

    const joined = expectOk(await emitAck<{ gameId: string }>(s2, 'lobby:join_by_code', { code }))
    expect(joined.gameId).toBe(gameId)
    expect(await seatStatus(gameId, 'u2')).toBe('joined')
  })

  it('the sweep dissolves a lobby inactive for more than 24h and cancels its invitations', async () => {
    const { gameId } = await inviteU2()
    const s2 = await ts.connectAs('u2')
    await waitForEvent<InviteReceived>(s2, 'invite:received')

    // Equivalent of a +25h clock: backdate the last activity.
    await ts.db
      .update(games)
      .set({ lastActivityAt: sql`now() - interval '25 hours'` })
      .where(eq(games.id, gameId))

    const canceled = waitForEvent<{ gameId: string }>(s2, 'invite:canceled')
    expect(await ts.server.zombie.tick()).toBe(1)
    expect(await canceled).toEqual({ gameId })

    const [game] = await ts.db.select().from(games).where(eq(games.id, gameId))
    expect(game?.status).toBe('finished')
    expect(game?.outcome).toBe('aborted')
  })
})
