'use client'

import { useEffect, useState } from 'react'
import { elapsedSeconds, formatChrono } from '@/lib/chrono'

/**
 * Ticking elapsed time (in seconds) anchored on the server clock. `startedAt`
 * accepts an ISO string or epoch ms; `serverOffsetMs` comes from `useGame`.
 * Returns `null` while the game has no start timestamp. Exported so the
 * « Tableau des augures » reads the SAME clock the chrono displays instead of
 * anchoring a second one (`plans/041-tableau-des-augures.md`).
 */
export function useElapsedSeconds(
  startedAt: string | number | null,
  serverOffsetMs: number
): number | null {
  const startedAtMs =
    startedAt === null ? null : typeof startedAt === 'number' ? startedAt : Date.parse(startedAt)

  const [seconds, setSeconds] = useState<number | null>(() =>
    startedAtMs === null || Number.isNaN(startedAtMs)
      ? null
      : elapsedSeconds(startedAtMs, serverOffsetMs)
  )

  useEffect(() => {
    if (startedAtMs === null || Number.isNaN(startedAtMs)) {
      setSeconds(null)
      return
    }
    const tick = (): void => {
      setSeconds(elapsedSeconds(startedAtMs, serverOffsetMs))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => {
      clearInterval(interval)
    }
  }, [startedAtMs, serverOffsetMs])

  return seconds
}

/**
 * Ticking chrono display anchored on the server clock. `startedAt` accepts an
 * ISO string or epoch ms; `serverOffsetMs` comes from `useGame`. Returns the
 * formatted elapsed time, or `null` while the game has no start timestamp.
 */
export function useChrono(
  startedAt: string | number | null,
  serverOffsetMs: number
): string | null {
  const seconds = useElapsedSeconds(startedAt, serverOffsetMs)
  return seconds === null ? null : formatChrono(seconds)
}
