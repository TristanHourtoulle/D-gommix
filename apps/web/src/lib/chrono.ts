/**
 * Server-anchored elapsed time helpers for the game chrono (design §5.2):
 * the display is derived from `startedAt` and the server clock offset, never
 * from a client-side counter alone.
 */

/** Seconds elapsed since `startedAt`, corrected by the server clock offset. */
export function elapsedSeconds(
  startedAtMs: number,
  serverOffsetMs: number,
  nowMs: number = Date.now()
): number {
  const elapsed = Math.floor((nowMs + serverOffsetMs - startedAtMs) / 1000)
  return Math.max(0, elapsed)
}

/** Formats a duration in seconds as `MM:SS`, or `H:MM:SS` beyond one hour. */
export function formatChrono(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
