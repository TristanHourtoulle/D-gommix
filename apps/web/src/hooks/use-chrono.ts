'use client'

import { useEffect, useState } from 'react'
import { elapsedSeconds, formatChrono } from '@/lib/chrono'

/**
 * Ticking chrono display anchored on the server clock. `startedAt` accepts an
 * ISO string or epoch ms; `serverOffsetMs` comes from `useGame`. Returns the
 * formatted elapsed time, or `null` while the game has no start timestamp.
 */
export function useChrono(
  startedAt: string | number | null,
  serverOffsetMs: number
): string | null {
  const startedAtMs =
    startedAt === null ? null : typeof startedAt === 'number' ? startedAt : Date.parse(startedAt)

  const [display, setDisplay] = useState<string | null>(() =>
    startedAtMs === null || Number.isNaN(startedAtMs)
      ? null
      : formatChrono(elapsedSeconds(startedAtMs, serverOffsetMs))
  )

  useEffect(() => {
    if (startedAtMs === null || Number.isNaN(startedAtMs)) {
      setDisplay(null)
      return
    }
    const tick = (): void => {
      setDisplay(formatChrono(elapsedSeconds(startedAtMs, serverOffsetMs)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => {
      clearInterval(interval)
    }
  }, [startedAtMs, serverOffsetMs])

  return display
}
