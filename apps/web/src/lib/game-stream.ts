import { buildGameState, reduce, type GameEvent, type GameState } from '@degommix/game-core'

export interface GameStreamListeners {
  /** Called after every applied event or reset with the fresh state. */
  onChange: (state: GameState | null) => void
  /** Called when a seq gap is detected: the owner must emit `game:resync`. */
  onGapDetected: () => void
}

/**
 * Applies confirmed `game:event` broadcasts to a client-side `GameState`
 * through the shared reducer. Events with an already-known seq are ignored,
 * a hole in the seq sequence triggers a defensive resync (design §4.5).
 * Pure TypeScript: the React hook owns the socket wiring.
 */
export class GameEventStream {
  private state: GameState | null = null
  private startedAtValue: string | null = null

  constructor(private readonly listeners: GameStreamListeners) {}

  get current(): GameState | null {
    return this.state
  }

  /** ISO timestamp of the GAME_STARTED event (chrono anchor), if seen. */
  get startedAt(): string | null {
    return this.startedAtValue
  }

  get lastSeq(): number {
    return this.state?.lastSeq ?? 0
  }

  /** Ingests a single broadcast event. Returns true when it was applied. */
  ingest(event: GameEvent): boolean {
    if (event.seq <= this.lastSeq) return false
    if (event.seq !== this.lastSeq + 1) {
      this.listeners.onGapDetected()
      return false
    }
    if (this.state === null) {
      if (event.type !== 'GAME_STARTED') {
        this.listeners.onGapDetected()
        return false
      }
      this.state = buildGameState([event])
      this.startedAtValue = event.createdAt
    } else {
      this.state = reduce(this.state, event)
    }
    this.listeners.onChange(this.state)
    return true
  }

  /**
   * Ingests a resync/snapshot batch (contiguous, seq ascending). Known seqs
   * are skipped; a hole inside the batch triggers at most one gap callback.
   */
  ingestBatch(events: GameEvent[]): void {
    let gap = false
    for (const event of events) {
      if (event.seq <= this.lastSeq) continue
      if (event.seq !== this.lastSeq + 1 || (this.state === null && event.type !== 'GAME_STARTED')) {
        gap = true
        break
      }
      // The guard above ensures a null state only ever meets GAME_STARTED here.
      if (this.state === null) {
        this.state = buildGameState([event])
        this.startedAtValue = event.createdAt
      } else {
        this.state = reduce(this.state, event)
      }
    }
    this.listeners.onChange(this.state)
    if (gap) this.listeners.onGapDetected()
  }

  /** Drops the local state (e.g. before a full resync from seq 0). */
  reset(): void {
    this.state = null
    this.startedAtValue = null
    this.listeners.onChange(null)
  }
}
