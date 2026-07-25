'use client'

import type { GameFormat } from '@degommix/game-core'
import { Pill } from '@/components/ui/pill'
import { useChrono } from '@/hooks/use-chrono'

interface GameClockProps {
  format: GameFormat
  /** ISO timestamp of GAME_STARTED (chrono anchor from `useGame`). */
  startedAt: string | null
  serverOffset: number
  connected: boolean
}

/**
 * Status header of the live screen: FFA pill, server-anchored chrono and the
 * « En direct » / « Reconnexion… » sync indicator.
 */
export function GameClock({ format, startedAt, serverOffset, connected }: GameClockProps) {
  const chrono = useChrono(startedAt, serverOffset)

  return (
    <header className="relative z-10 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Pill variant="ffa">FFA · {format} joueurs</Pill>
        <span className="font-mono text-2xl font-bold tabular-nums">{chrono ?? '--:--'}</span>
      </div>
      <p
        className="m-0 flex items-center gap-2 text-xs font-semibold"
        style={{ color: connected ? 'var(--good)' : 'var(--bronze-strong)' }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: 'currentColor' }}
        />
        {connected ? 'En direct — synchronisé' : 'Reconnexion…'}
      </p>
    </header>
  )
}
