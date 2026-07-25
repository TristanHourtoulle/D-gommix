import { describe, expect, it, vi } from 'vitest'
import { buildGameState, type GameEvent, type GameState } from '@degommix/game-core'
import { GameEventStream } from './game-stream'

const CREATED_AT = '2026-07-25T10:00:00.000Z'

function started(seq = 1): GameEvent {
  return {
    seq,
    createdAt: CREATED_AT,
    type: 'GAME_STARTED',
    actorId: 'alice',
    targetId: null,
    payload: {
      players: [
        { userId: 'alice', character: 'asterix' },
        { userId: 'bob', character: 'obelix' },
      ],
      format: 2,
    },
  }
}

function degommage(seq: number, actorId: string, targetId: string): GameEvent {
  return { seq, createdAt: CREATED_AT, type: 'DEGOMMAGE', actorId, targetId, payload: null }
}

function undo(seq: number, targetSeq: number): GameEvent {
  return {
    seq,
    createdAt: CREATED_AT,
    type: 'UNDO',
    actorId: 'alice',
    targetId: null,
    payload: { targetSeq },
  }
}

function createStream() {
  const onChange = vi.fn<(state: GameState | null) => void>()
  const onGapDetected = vi.fn<() => void>()
  const stream = new GameEventStream({ onChange, onGapDetected })
  return { stream, onChange, onGapDetected }
}

describe('GameEventStream.ingest', () => {
  it('applies a contiguous broadcast sequence through the shared reducer', () => {
    const { stream, onGapDetected } = createStream()
    const events = [started(), degommage(2, 'alice', 'bob'), degommage(3, 'bob', 'alice'), undo(4, 3)]
    for (const event of events) expect(stream.ingest(event)).toBe(true)
    expect(stream.current).toEqual(buildGameState(events))
    expect(stream.lastSeq).toBe(4)
    expect(stream.startedAt).toBe(CREATED_AT)
    expect(onGapDetected).not.toHaveBeenCalled()
  })

  it('ignores events whose seq is already known', () => {
    const { stream, onChange, onGapDetected } = createStream()
    stream.ingest(started())
    stream.ingest(degommage(2, 'alice', 'bob'))
    onChange.mockClear()
    expect(stream.ingest(degommage(2, 'alice', 'bob'))).toBe(false)
    expect(stream.ingest(started())).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(onGapDetected).not.toHaveBeenCalled()
    expect(stream.current?.players['bob']?.degommages).toBe(0)
    expect(stream.current?.players['alice']?.degommages).toBe(1)
  })

  it('detects a seq gap, skips the event and requests a resync', () => {
    const { stream, onGapDetected } = createStream()
    stream.ingest(started())
    expect(stream.ingest(degommage(4, 'alice', 'bob'))).toBe(false)
    expect(onGapDetected).toHaveBeenCalledTimes(1)
    expect(stream.lastSeq).toBe(1)
  })

  it('requests a resync when the first received event is not GAME_STARTED', () => {
    const { stream, onGapDetected } = createStream()
    // Mid-game (re)mount: broadcast arrives before the resync answer.
    expect(stream.ingest(degommage(1, 'alice', 'bob'))).toBe(false)
    expect(onGapDetected).toHaveBeenCalledTimes(1)
    expect(stream.current).toBeNull()
  })
})

describe('GameEventStream.ingestBatch', () => {
  it('replays a full resync log from seq 0', () => {
    const { stream, onGapDetected } = createStream()
    const events = [started(), degommage(2, 'alice', 'bob'), degommage(3, 'alice', 'bob')]
    stream.ingestBatch(events)
    expect(stream.current).toEqual(buildGameState(events))
    expect(onGapDetected).not.toHaveBeenCalled()
  })

  it('skips already-applied seqs and appends only the tail', () => {
    const { stream } = createStream()
    stream.ingest(started())
    stream.ingest(degommage(2, 'alice', 'bob'))
    stream.ingestBatch([started(), degommage(2, 'alice', 'bob'), degommage(3, 'bob', 'alice')])
    expect(stream.lastSeq).toBe(3)
    expect(stream.current?.players['alice']?.degommages).toBe(1)
    expect(stream.current?.players['bob']?.degommages).toBe(1)
  })

  it('flags a hole inside the batch once and keeps the applied prefix', () => {
    const { stream, onGapDetected } = createStream()
    stream.ingestBatch([started(), degommage(2, 'alice', 'bob'), degommage(5, 'alice', 'bob')])
    expect(onGapDetected).toHaveBeenCalledTimes(1)
    expect(stream.lastSeq).toBe(2)
  })

  it('flags a batch that starts mid-log while no state is known', () => {
    const { stream, onGapDetected } = createStream()
    stream.ingestBatch([degommage(3, 'alice', 'bob')])
    expect(onGapDetected).toHaveBeenCalledTimes(1)
    expect(stream.current).toBeNull()
  })
})

describe('GameEventStream.reset', () => {
  it('drops state, startedAt and lastSeq', () => {
    const { stream, onChange } = createStream()
    stream.ingest(started())
    stream.reset()
    expect(stream.current).toBeNull()
    expect(stream.startedAt).toBeNull()
    expect(stream.lastSeq).toBe(0)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
