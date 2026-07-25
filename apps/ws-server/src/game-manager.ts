import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { gameEvents, gamePlayers, games, type Db } from '@degommix/db'
import {
  buildGameState,
  reduce,
  resolveUndoTarget,
  validateCommand,
  type Ack,
  type CharacterId,
  type Command,
  type GameEvent,
  type GameFormat,
  type GameState,
} from '@degommix/game-core'
import { CommandError, failAck } from './ack'
import { finalizeGame } from './finalize'
import type { AppServer } from './socket-types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type GameEventDraft = DistributiveOmit<GameEvent, 'seq' | 'createdAt'>

type EventRow = typeof gameEvents.$inferSelect

export function rowToGameEvent(row: EventRow): GameEvent {
  return {
    seq: row.seq,
    type: row.type,
    actorId: row.actorId,
    targetId: row.targetId,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  } as GameEvent
}

export interface GameManagerDeps {
  db: Db
  io: AppServer
  onFinished?: (gameId: string, state: GameState) => void
}

/**
 * Authoritative write path for game events. One in-memory promise chain per
 * gameId acts as a mutex: a single command is processed at a time per game,
 * which makes seq attribution and undo-target resolution race-free.
 */
export class GameManager {
  private readonly chains = new Map<string, Promise<void>>()
  private readonly states = new Map<string, GameState>()

  constructor(private readonly deps: GameManagerDeps) {}

  private enqueue<T>(gameId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(gameId) ?? Promise.resolve()
    const run = previous.then(task)
    this.chains.set(
      gameId,
      run.then(
        () => undefined,
        () => undefined
      )
    )
    return run
  }

  private async loadState(gameId: string): Promise<GameState | null> {
    const cached = this.states.get(gameId)
    if (cached) return cached
    const rows = await this.deps.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId))
      .orderBy(asc(gameEvents.seq))
    if (rows.length === 0) return null
    const state = buildGameState(rows.map(rowToGameEvent))
    this.states.set(gameId, state)
    return state
  }

  getState(gameId: string): Promise<GameState | null> {
    return this.enqueue(gameId, () => this.loadState(gameId))
  }

  async getEventsSince(gameId: string, lastSeq: number): Promise<GameEvent[]> {
    const rows = await this.deps.db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.gameId, gameId), gt(gameEvents.seq, lastSeq)))
      .orderBy(asc(gameEvents.seq))
    return rows.map(rowToGameEvent)
  }

  submitCommand(
    gameId: string,
    actorId: string,
    clientEventId: string,
    command: Command
  ): Promise<Ack<{ seq: number }>> {
    return this.enqueue(gameId, async () => {
      const [existing] = await this.deps.db
        .select({ seq: gameEvents.seq })
        .from(gameEvents)
        .where(eq(gameEvents.clientEventId, clientEventId))
      if (existing) return { ok: true, seq: existing.seq }

      const [game] = await this.deps.db.select().from(games).where(eq(games.id, gameId))
      if (!game) return failAck('NOT_FOUND')
      if (game.status === 'lobby') return failAck('GAME_NOT_ACTIVE')

      const state = await this.loadState(gameId)
      if (!state) return failAck('GAME_NOT_ACTIVE')

      const verdict = validateCommand(state, actorId, command, {
        isHost: actorId === game.hostId,
      })
      if (!verdict.ok) return failAck(verdict.code)

      const events = buildCommandEvents(state, actorId, command, game.hostId)
      await this.persist(gameId, state, events, clientEventId)
      const first = events[0]
      if (!first) return failAck('INTERNAL')
      return { ok: true, seq: first.seq }
    })
  }

  /** Appends a server-generated event (e.g. GAME_AUTO_CLOSED) through the queue. */
  appendSystemEvent(gameId: string, draft: GameEventDraft): Promise<void> {
    return this.enqueue(gameId, async () => {
      const state = await this.loadState(gameId)
      if (!state || state.status === 'finished') return
      const event = { ...draft, seq: state.lastSeq + 1, createdAt: new Date().toISOString() } as GameEvent
      await this.persist(gameId, state, [event], null)
    })
  }

  /** Transitions a lobby to active and appends GAME_STARTED with seq 1. */
  startGame(gameId: string, hostId: string): Promise<Ack<{ firstEvents: GameEvent[] }>> {
    return this.enqueue(gameId, async () => {
      const [game] = await this.deps.db.select().from(games).where(eq(games.id, gameId))
      if (!game) return failAck('NOT_FOUND')
      if (game.hostId !== hostId) return failAck('NOT_HOST')
      if (game.status !== 'lobby') return failAck('LOBBY_ALREADY_STARTED')
      const rows = await this.deps.db
        .select()
        .from(gamePlayers)
        .where(
          and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.status, ['invited', 'joined']))
        )
      if (rows.some((row) => row.status === 'invited')) return failAck('PENDING_INVITES')
      const joined = rows
        .filter((row) => row.status === 'joined')
        .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0))
      if (joined.length !== game.format) {
        return failAck('FORMAT_INCOMPATIBLE', 'lobby is not full')
      }
      if (joined.some((row) => row.character === null)) {
        return failAck('FORMAT_INCOMPATIBLE', 'all players must pick a character')
      }
      const event: GameEvent = {
        seq: 1,
        createdAt: new Date().toISOString(),
        type: 'GAME_STARTED',
        actorId: hostId,
        targetId: null,
        payload: {
          players: joined.map((row) => ({
            userId: row.userId,
            character: row.character as CharacterId,
          })),
          format: game.format as GameFormat,
        },
      }
      await this.deps.db.transaction(async (tx) => {
        await tx
          .update(games)
          .set({ status: 'active', startedAt: new Date(), lastActivityAt: new Date() })
          .where(eq(games.id, gameId))
        await tx.insert(gameEvents).values({
          gameId,
          seq: event.seq,
          type: event.type,
          actorId: event.actorId,
          targetId: event.targetId,
          payload: event.payload,
          clientEventId: randomUUID(),
          createdAt: new Date(event.createdAt),
        })
      })
      this.states.set(gameId, buildGameState([event]))
      this.deps.io.to(`game:${gameId}`).emit('game:event', event)
      return { ok: true, firstEvents: [event] }
    })
  }

  private async persist(
    gameId: string,
    state: GameState,
    events: GameEvent[],
    clientEventId: string | null
  ): Promise<void> {
    let nextState = state
    for (const event of events) nextState = reduce(nextState, event)
    const finished = nextState.status === 'finished' && state.status !== 'finished'
    const quitters = events.filter((e) => e.type === 'PLAYER_QUIT').map((e) => e.actorId)
    await this.deps.db.transaction(async (tx) => {
      for (const [index, event] of events.entries()) {
        await tx.insert(gameEvents).values({
          gameId,
          seq: event.seq,
          type: event.type,
          actorId: event.actorId,
          targetId: event.targetId,
          payload: event.payload,
          clientEventId: index === 0 && clientEventId !== null ? clientEventId : randomUUID(),
          createdAt: new Date(event.createdAt),
        })
      }
      await tx.update(games).set({ lastActivityAt: new Date() }).where(eq(games.id, gameId))
      for (const quitter of quitters) {
        await tx
          .update(gamePlayers)
          .set({ status: 'left', leftAt: new Date() })
          .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, quitter)))
      }
      if (finished) await finalizeGame(tx, gameId, nextState)
    })
    this.states.set(gameId, nextState)
    for (const event of events) this.deps.io.to(`game:${gameId}`).emit('game:event', event)
    if (finished) this.deps.onFinished?.(gameId, nextState)
  }
}

/** Translates a validated command into fully sequenced events (server authority). */
function buildCommandEvents(
  state: GameState,
  actorId: string,
  command: Command,
  hostId: string
): GameEvent[] {
  const createdAt = new Date().toISOString()
  let seq = state.lastSeq
  const next = (): number => ++seq
  switch (command.type) {
    case 'degommage':
      return [
        { seq: next(), createdAt, type: 'DEGOMMAGE', actorId, targetId: command.targetId, payload: null },
      ]
    case 'undo': {
      const targetSeq = resolveUndoTarget(state)
      if (targetSeq === null) throw new CommandError('NOTHING_TO_UNDO')
      return [
        { seq: next(), createdAt, type: 'UNDO', actorId, targetId: null, payload: { targetSeq } },
      ]
    }
    case 'request_end': {
      const requestSeq = next()
      const events: GameEvent[] = [
        {
          seq: requestSeq,
          createdAt,
          type: 'END_REQUESTED',
          actorId,
          targetId: command.kind === 'village' ? (command.winnerId ?? null) : null,
          payload: { kind: command.kind },
        },
      ]
      if (actorId === hostId) {
        events.push({
          seq: next(),
          createdAt,
          type: 'END_VALIDATED',
          actorId,
          targetId: null,
          payload: { requestSeq },
        })
        if (command.kind === 'abandon_individual') {
          events.push({
            seq: next(),
            createdAt,
            type: 'PLAYER_QUIT',
            actorId,
            targetId: null,
            payload: null,
          })
        }
      }
      return events
    }
    case 'respond_end': {
      const pending = state.pendingEndRequest
      if (!pending) throw new CommandError('NO_PENDING_REQUEST')
      if (!command.accept) {
        return [
          {
            seq: next(),
            createdAt,
            type: 'END_REJECTED',
            actorId,
            targetId: null,
            payload: { requestSeq: pending.requestSeq },
          },
        ]
      }
      const events: GameEvent[] = [
        {
          seq: next(),
          createdAt,
          type: 'END_VALIDATED',
          actorId,
          targetId: null,
          payload: { requestSeq: pending.requestSeq },
        },
      ]
      if (pending.kind === 'abandon_individual') {
        events.push({
          seq: next(),
          createdAt,
          type: 'PLAYER_QUIT',
          actorId: pending.requesterId,
          targetId: null,
          payload: null,
        })
      }
      return events
    }
    case 'withdraw_end': {
      const pending = state.pendingEndRequest
      if (!pending) throw new CommandError('NO_PENDING_REQUEST')
      return [
        {
          seq: next(),
          createdAt,
          type: 'END_REJECTED',
          actorId,
          targetId: null,
          payload: { requestSeq: pending.requestSeq },
        },
      ]
    }
  }
}
