import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Socket as ClientSocket } from 'socket.io-client'
import { canonicalPair, friendships, gamePlayers, games, seals } from '@degommix/db'
import { migrateTestDb } from '@degommix/db/test-utils'
import {
  AVENGER_VENGEANCES,
  CAMP_CHIEF_HOSTED_GAMES,
  CENTURION_DEGOMMAGES,
  MENHIR_MIN_TAKEN,
  UNBEATEN_MIN_VILLAGE_GAMES,
  currentParisMonthKey,
  monthWindowParis,
  previousMonthKey,
  type CharacterId,
} from '@degommix/game-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backfillSeals } from '../src/backfill-seals'
import { awardSeals } from '../src/seals'
import { startGameWith, sendCommand } from './flows'
import { expectOk, startTestServer, type TestServer } from './harness'

/** Far enough back that every seeded game precedes the live ones. */
const PAST = new Date(Date.now() - 200 * 86_400_000)

/**
 * The Paris month the title seals evaluate: the most recent COMPLETED one, as
 * seen from a game finalized now. Derived rather than hardcoded so the suite
 * does not rot on the first of a month.
 */
const LAST_MONTH = (() => {
  const key = previousMonthKey(currentParisMonthKey())
  if (key === null) throw new Error('no previous month')
  return key
})()

interface SeedPlayer {
  userId: string
  character?: CharacterId
  degommages?: number
}

interface SeedGame {
  hostId: string
  winnerId: string | null
  outcome: 'village_reached' | 'aborted'
  endedAt: Date
  players: SeedPlayer[]
}

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

  /**
   * Writes a finished game straight to the database — history the live path
   * never replays, so the career and month queries have something to read
   * without playing dozens of sockets flows.
   */
  const seedGame = async (game: SeedGame): Promise<string> => {
    const gameId = randomUUID()
    await ts.db.insert(games).values({
      id: gameId,
      code: randomUUID().slice(0, 8).toUpperCase(),
      status: 'finished',
      format: game.players.length,
      hostId: game.hostId,
      winnerId: game.winnerId,
      outcome: game.outcome,
      startedAt: new Date(game.endedAt.getTime() - 600_000),
      endedAt: game.endedAt,
    })
    await ts.db.insert(gamePlayers).values(
      game.players.map((player) => ({
        gameId,
        userId: player.userId,
        status: 'joined' as const,
        character: player.character ?? null,
        degommages: player.degommages ?? 0,
      }))
    )
    return gameId
  }

  it('engraves imperator and first_win for an untouched first-time winner', async () => {
    const { gameId, sockets } = await startGameWith(ts, ['u1', 'u2'])
    const s1 = sockets.get('u1')
    if (!s1) throw new Error('missing socket')

    expectOk(await sendCommand(s1, gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    // Plan 039: the suite's games last milliseconds, so every village win in it
    // also lands « L’Éclair de Toutatis ».
    const rows = await sealsOf('u1')
    expect(rows.map((r) => r.sealId).sort()).toEqual(['first_win', 'imperator', 'toutatis_bolt'])
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

  // -------------------------------------------------------------------------
  // Plan 039 — second wave
  // -------------------------------------------------------------------------

  const socketsOf = (
    started: { sockets: Map<string, ClientSocket> },
    ...userIds: string[]
  ): ClientSocket[] =>
    userIds.map((userId) => {
      const socket = started.sockets.get(userId)
      if (!socket) throw new Error(`missing socket for ${userId}`)
      return socket
    })

  /** `count` dégommages on `u1`, dealt alternately by u2 and u3. */
  const beatUpU1 = async (
    started: { gameId: string; sockets: Map<string, ClientSocket> },
    count: number
  ): Promise<void> => {
    const [s2, s3] = socketsOf(started, 'u2', 'u3')
    if (!s2 || !s3) throw new Error('missing sockets')
    for (let index = 0; index < count; index++) {
      expectOk(
        await sendCommand(index % 2 === 0 ? s2 : s3, started.gameId, {
          type: 'degommage',
          targetId: 'u1',
        })
      )
    }
  }

  it('engraves menhir on a player who absorbed ten dégommages and stayed', async () => {
    // u1 hosts, so u1's own village request auto-validates and closes the game.
    const started = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const [s1] = socketsOf(started, 'u1')
    if (!s1) throw new Error('missing socket')
    await beatUpU1(started, MENHIR_MIN_TAKEN)
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).toContain('menhir')
  })

  it('does not engrave menhir when one of the ten was undone', async () => {
    const started = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const [s1, s3] = socketsOf(started, 'u1', 'u3')
    if (!s1 || !s3) throw new Error('missing sockets')
    await beatUpU1(started, MENHIR_MIN_TAKEN)
    // The tenth hit was u3's; taking it back leaves nine.
    expectOk(await sendCommand(s3, started.gameId, { type: 'undo' }))
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).not.toContain('menhir')
  })

  it('does not engrave menhir on a player who quit before the village', async () => {
    // u2 hosts here so u1 can be the one who walks out.
    const started = await startGameWith(ts, ['u2', 'u1', 'u3', 'u4'])
    const [s1, s2] = socketsOf(started, 'u1', 'u2')
    if (!s1 || !s2) throw new Error('missing sockets')
    await beatUpU1(started, MENHIR_MIN_TAKEN)
    expectOk(
      await sendCommand(s1, started.gameId, { type: 'request_end', kind: 'abandon_individual' })
    )
    expectOk(await sendCommand(s2, started.gameId, { type: 'respond_end', accept: true }))
    expectOk(
      await sendCommand(s2, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).not.toContain('menhir')
  })

  it('engraves avenger on three printed vengeances in one game', async () => {
    const started = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const [s1, s2] = socketsOf(started, 'u1', 'u2')
    if (!s1 || !s2) throw new Error('missing sockets')
    // u1 opens, u2 answers, three times over: u2's third answer is their third
    // surviving dégommage, so no « Carnage » masks it.
    for (let round = 0; round < AVENGER_VENGEANCES; round++) {
      expectOk(await sendCommand(s1, started.gameId, { type: 'degommage', targetId: 'u2' }))
      expectOk(await sendCommand(s2, started.gameId, { type: 'degommage', targetId: 'u1' }))
    }
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u3',
      })
    )

    expect((await sealsOf('u2')).map((r) => r.sealId)).toContain('avenger')
    // u1 only ever opened: two of their hits answer u2, one starts the game.
    expect((await sealsOf('u1')).map((r) => r.sealId)).not.toContain('avenger')
  })

  it('engraves centurion on the game where the hundredth dégommage landed', async () => {
    await seedGame({
      hostId: 'u2',
      winnerId: 'u2',
      outcome: 'village_reached',
      endedAt: new Date(PAST.getTime()),
      players: [
        { userId: 'u1', character: 'asterix', degommages: CENTURION_DEGOMMAGES - 1 },
        { userId: 'u2', character: 'obelix' },
      ],
    })

    const started = await startGameWith(ts, ['u1', 'u2'])
    const [s1] = socketsOf(started, 'u1')
    if (!s1) throw new Error('missing socket')
    expectOk(await sendCommand(s1, started.gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    const row = (await sealsOf('u1')).find((r) => r.sealId === 'centurion')
    expect(row?.gameId).toBe(started.gameId)
    // u2 dealt nothing in either game: no centurion, whatever u1's total.
    expect((await sealsOf('u2')).map((r) => r.sealId)).not.toContain('centurion')
  })

  it('engraves camp_chief on the host of the tenth game brought to the village', async () => {
    for (let index = 0; index < CAMP_CHIEF_HOSTED_GAMES - 1; index++) {
      await seedGame({
        hostId: 'u1',
        winnerId: 'u2',
        outcome: 'village_reached',
        endedAt: new Date(PAST.getTime() + index * 60_000),
        players: [
          { userId: 'u1', character: 'asterix' },
          { userId: 'u2', character: 'obelix' },
        ],
      })
    }

    const started = await startGameWith(ts, ['u1', 'u2'])
    const [s1] = socketsOf(started, 'u1')
    if (!s1) throw new Error('missing socket')
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).toContain('camp_chief')
    // u2 played all ten and hosted none.
    expect((await sealsOf('u2')).map((r) => r.sealId)).not.toContain('camp_chief')
  })

  it('engraves collector only once every character has won', async () => {
    const others: CharacterId[] = ['obelix', 'caius_bonus']
    for (const [index, character] of others.entries()) {
      await seedGame({
        hostId: 'u1',
        winnerId: 'u1',
        outcome: 'village_reached',
        endedAt: new Date(PAST.getTime() + index * 60_000),
        players: [
          { userId: 'u1', character },
          { userId: 'u2', character: 'caligula_minus' },
        ],
      })
    }

    // Three distinct winning characters is one short.
    const third = await startGameWith(ts, ['u1', 'u2'])
    const [t1] = socketsOf(third, 'u1')
    if (!t1) throw new Error('missing socket')
    expectOk(
      await sendCommand(t1, third.gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )
    expect((await sealsOf('u1')).map((r) => r.sealId)).not.toContain('collector')

    // The fourth character closes the set.
    await seedGame({
      hostId: 'u1',
      winnerId: 'u1',
      outcome: 'village_reached',
      endedAt: new Date(PAST.getTime() + 10 * 60_000),
      players: [
        { userId: 'u1', character: 'caligula_minus' },
        { userId: 'u2', character: 'obelix' },
      ],
    })
    ts.disconnectAll()
    const fourth = await startGameWith(ts, ['u1', 'u2'])
    const [f1] = socketsOf(fourth, 'u1')
    if (!f1) throw new Error('missing socket')
    expectOk(
      await sendCommand(f1, fourth.gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    const row = (await sealsOf('u1')).find((r) => r.sealId === 'collector')
    expect(row?.gameId).toBe(fourth.gameId)
  })

  it('engraves unbeaten for a flawless completed month, and not for a lost one', async () => {
    const window = monthWindowParis(LAST_MONTH)
    if (window === null) throw new Error('bad month key')
    for (let index = 0; index < UNBEATEN_MIN_VILLAGE_GAMES; index++) {
      await seedGame({
        hostId: 'u1',
        // The last of the three is lost by u1 in the "not awarded" half below.
        winnerId: 'u1',
        outcome: 'village_reached',
        endedAt: new Date(window.from.getTime() + (index + 1) * 86_400_000),
        players: [
          { userId: 'u1', character: 'asterix' },
          { userId: 'u2', character: 'obelix' },
        ],
      })
    }

    const started = await startGameWith(ts, ['u1', 'u2'])
    const [s1] = socketsOf(started, 'u1')
    if (!s1) throw new Error('missing socket')
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    expect((await sealsOf('u1')).map((r) => r.sealId)).toContain('unbeaten')
    // u2 lost all three of that month.
    expect((await sealsOf('u2')).map((r) => r.sealId)).not.toContain('unbeaten')
  })

  it('needs two ranked players before golden_boar is engraved', async () => {
    const window = monthWindowParis(LAST_MONTH)
    if (window === null) throw new Error('bad month key')
    await seedGame({
      hostId: 'u1',
      winnerId: 'u1',
      outcome: 'village_reached',
      endedAt: new Date(window.from.getTime() + 86_400_000),
      players: [
        { userId: 'u1', character: 'asterix', degommages: 5 },
        { userId: 'u2', character: 'obelix', degommages: 1 },
      ],
    })

    // u1 has no friends: the circle is one, and « Le Sanglier d'or » is refused.
    const solo = await startGameWith(ts, ['u1', 'u2'])
    const [x1] = socketsOf(solo, 'u1')
    if (!x1) throw new Error('missing socket')
    expectOk(
      await sendCommand(x1, solo.gameId, { type: 'request_end', kind: 'village', winnerId: 'u2' })
    )
    expect((await sealsOf('u1')).map((r) => r.sealId)).not.toContain('golden_boar')

    // With u2 in the circle, that same month has two ranked players.
    const [userLow, userHigh] = canonicalPair('u1', 'u2')
    await ts.db.insert(friendships).values({ userLow, userHigh })
    ts.disconnectAll()
    const withFriend = await startGameWith(ts, ['u1', 'u2'])
    const [y1] = socketsOf(withFriend, 'u1')
    if (!y1) throw new Error('missing socket')
    expectOk(
      await sendCommand(y1, withFriend.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )
    expect((await sealsOf('u1')).map((r) => r.sealId)).toContain('golden_boar')
    // u2 dégomma less that month.
    expect((await sealsOf('u2')).map((r) => r.sealId)).not.toContain('golden_boar')
  })

  it('costs nothing to replay a game whose seals are already held', async () => {
    const first = await startGameWith(ts, ['u1', 'u2'])
    const [f1] = socketsOf(first, 'u1')
    if (!f1) throw new Error('missing socket')
    expectOk(
      await sendCommand(f1, first.gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )
    const afterFirst = await countAll()
    expect(afterFirst).toBeGreaterThan(0)

    ts.disconnectAll()
    const second = await startGameWith(ts, ['u1', 'u2'])
    const [s1] = socketsOf(second, 'u1')
    if (!s1) throw new Error('missing socket')
    expectOk(
      await sendCommand(s1, second.gameId, { type: 'request_end', kind: 'village', winnerId: 'u1' })
    )

    // Same verdict, already held: the Decision-4 skip changes nothing.
    expect(await countAll()).toBe(afterFirst)
  })

  it('is idempotent end to end: a second backfill inserts nothing', async () => {
    const started = await startGameWith(ts, ['u1', 'u2', 'u3', 'u4'])
    const [s1] = socketsOf(started, 'u1')
    if (!s1) throw new Error('missing socket')
    expectOk(await sendCommand(s1, started.gameId, { type: 'degommage', targetId: 'u2' }))
    expectOk(
      await sendCommand(s1, started.gameId, {
        type: 'request_end',
        kind: 'village',
        winnerId: 'u2',
      })
    )

    const firstRun = await backfillSeals(ts.db)
    expect(firstRun.failed).toBe(0)
    const after = await countAll()

    const secondRun = await backfillSeals(ts.db)
    expect(secondRun.failed).toBe(0)
    expect(secondRun.sealsInserted).toBe(0)
    expect(await countAll()).toBe(after)
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

  it('pins rising_tide to the game that closed the FIRST three-win run', async () => {
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
  }, 60_000)

  it('pins decurion to the tenth win, not to the first game replayed', async () => {
    const gameIds = await playCareer(Array.from({ length: 10 }, () => 'u1'))
    expect(gameIds).toHaveLength(10)

    await replayFromScratch()

    expect((await sealRow('u1', 'decurion'))?.gameId).toBe(gameIds[9])
    expect((await sealRow('u1', 'rising_tide'))?.gameId).toBe(gameIds[2])
  }, 60_000)

  it('bounds every plan-039 query by the cursor too, career and month alike', async () => {
    // The PR #75 regression, extended: replaying the FIRST game of a ten-win
    // career must see only that game — no decurion, no streak, and no month
    // record built from the nine games that came after it.
    const gameIds = await playCareer(Array.from({ length: 10 }, () => 'u1'))
    const firstGameId = gameIds[0]
    if (firstGameId === undefined) throw new Error('missing game')

    await ts.db.delete(seals)
    const state = await ts.server.manager.getState(firstGameId)
    if (!state) throw new Error('missing state')
    const earned = await ts.db.transaction((tx) => awardSeals(tx, firstGameId, state))

    const detected = earned.get('u1') ?? []
    expect(detected).toContain('first_win')
    expect(detected).not.toContain('decurion')
    expect(detected).not.toContain('rising_tide')
    expect(detected).not.toContain('camp_chief')
    expect(detected).not.toContain('unbeaten')
    expect(detected).not.toContain('golden_boar')

    // And a second pass over that very game inserts nothing at all.
    const before = (await ts.db.select().from(seals)).length
    const replayed = await ts.db.transaction((tx) => awardSeals(tx, firstGameId, state))
    expect(replayed.size).toBe(0)
    expect((await ts.db.select().from(seals)).length).toBe(before)
  }, 60_000)
})
