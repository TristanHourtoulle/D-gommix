import { CommandError } from './ack'

/** In-memory sliding-window rate limiter, keyed by caller-provided strings. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, limit: number, windowMs: number): boolean {
    const at = this.now()
    const recent = (this.hits.get(key) ?? []).filter((ts) => at - ts < windowMs)
    if (recent.length >= limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(at)
    this.hits.set(key, recent)
    return true
  }

  /** Throws `RATE_LIMITED` when the window is exhausted. */
  assert(key: string, limit: number, windowMs: number): void {
    if (!this.consume(key, limit, windowMs)) throw new CommandError('RATE_LIMITED')
  }
}
