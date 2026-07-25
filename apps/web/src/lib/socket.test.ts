import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ack } from '@degommix/game-core'
import type { AckEmitter, CommandMap, CommandName } from './realtime-types'
import {
  ACK_TIMEOUT_MS,
  COMMAND_RETRY_ATTEMPTS,
  COMMAND_RETRY_TIMEOUT_MS,
  emitWithAck,
  isAckTimeout,
  sendGameCommand,
} from './socket'

interface RecordedCall<K extends CommandName> {
  event: CommandName
  payload: CommandMap[K]['payload']
  respond: (response: Ack<CommandMap[K]['result']>) => void
}

/** Mock emitter recording calls for a single command type. */
function createEmitter<K extends CommandName>() {
  const calls: RecordedCall<K>[] = []
  const emitter: AckEmitter = {
    emit(event, payload, ack) {
      calls.push({
        event,
        payload: payload as CommandMap[K]['payload'],
        respond: ack as RecordedCall<K>['respond'],
      })
    },
  }
  return { emitter, calls }
}

const COMMAND = { type: 'undo' } as const

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('emitWithAck', () => {
  it('resolves with the server ack', async () => {
    const { emitter, calls } = createEmitter<'lobby:create'>()
    const promise = emitWithAck(emitter, 'lobby:create', { format: 2 })
    calls[0]?.respond({ ok: true, gameId: 'g1', code: 'ABC123' })
    await expect(promise).resolves.toEqual({ ok: true, gameId: 'g1', code: 'ABC123' })
  })

  it('resolves with a synthetic failure after the 10s ack timeout', async () => {
    const { emitter } = createEmitter<'lobby:create'>()
    const promise = emitWithAck(emitter, 'lobby:create', { format: 2 })
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)
    const ack = await promise
    expect(ack.ok).toBe(false)
    expect(isAckTimeout(ack)).toBe(true)
  })

  it('ignores an ack that arrives after the timeout already settled', async () => {
    const { emitter, calls } = createEmitter<'lobby:create'>()
    const promise = emitWithAck(emitter, 'lobby:create', { format: 2 })
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)
    calls[0]?.respond({ ok: true, gameId: 'g1', code: 'ABC123' })
    const ack = await promise
    expect(ack.ok).toBe(false)
  })
})

describe('sendGameCommand', () => {
  it('retries with the same clientEventId and resolves on a late attempt', async () => {
    const { emitter, calls } = createEmitter<'game:command'>()
    const promise = sendGameCommand(emitter, 'game-1', 'client-uuid', COMMAND)

    await vi.advanceTimersByTimeAsync(COMMAND_RETRY_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(COMMAND_RETRY_TIMEOUT_MS)
    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.event === 'game:command')).toBe(true)
    expect(calls.every((call) => call.payload.clientEventId === 'client-uuid')).toBe(true)
    expect(calls.every((call) => call.payload.command === COMMAND)).toBe(true)

    calls[2]?.respond({ ok: true, seq: 7 })
    await expect(promise).resolves.toEqual({ ok: true, seq: 7 })
  })

  it('gives up after 3 attempts (~10s) with a delivery timeout failure', async () => {
    const { emitter, calls } = createEmitter<'game:command'>()
    const promise = sendGameCommand(emitter, 'game-1', 'client-uuid', COMMAND)
    await vi.advanceTimersByTimeAsync(COMMAND_RETRY_ATTEMPTS * COMMAND_RETRY_TIMEOUT_MS)
    const ack = await promise
    expect(calls).toHaveLength(COMMAND_RETRY_ATTEMPTS)
    expect(ack.ok).toBe(false)
    expect(isAckTimeout(ack)).toBe(true)
  })

  it('does not retry on a server error ack', async () => {
    const { emitter, calls } = createEmitter<'game:command'>()
    const promise = sendGameCommand(emitter, 'game-1', 'client-uuid', COMMAND)
    calls[0]?.respond({ ok: false, code: 'NOTHING_TO_UNDO', message: 'NOTHING_TO_UNDO' })
    const ack = await promise
    expect(calls).toHaveLength(1)
    expect(ack).toEqual({ ok: false, code: 'NOTHING_TO_UNDO', message: 'NOTHING_TO_UNDO' })
  })

  it('returns the idempotent ack when a retry hits an already-persisted command', async () => {
    const { emitter, calls } = createEmitter<'game:command'>()
    const promise = sendGameCommand(emitter, 'game-1', 'client-uuid', COMMAND)
    await vi.advanceTimersByTimeAsync(COMMAND_RETRY_TIMEOUT_MS)
    // First attempt was persisted server-side but its ack got lost;
    // the retry acks with the seq of the existing event.
    calls[1]?.respond({ ok: true, seq: 4 })
    await expect(promise).resolves.toEqual({ ok: true, seq: 4 })
  })
})
