'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ack } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { TauntPayload } from '@/lib/realtime-types'
import { isTauntId, tauntCooldownRemaining, TAUNT_DISPLAY_MS, type TauntId } from './taunts'

export interface ActiveTaunt {
  /** Bumped on every taunt — used as the overlay's React key to restart the CSS. */
  seq: number
  fromId: string
  targetId: string
  tauntId: TauntId
}

export interface UseTauntsResult {
  /** The taunt currently on screen, or `null`. */
  current: ActiveTaunt | null
  /** Local cooldown left, in ms — 0 when the viewer may taunt. */
  cooldownRemainingMs: () => number
  send: (targetId: string, tauntId: TauntId) => Promise<Ack<Record<never, never>>>
}

/**
 * « Balance une vanne » — the ephemeral taunt channel of `/partie/[gameId]`.
 * Subscribes to the `game:taunt` broadcast (which includes the sender, so the
 * whole table stamps at the same instant), owns the local one-per-minute
 * cooldown and sends the command.
 *
 * Nothing here is persisted: a taunt lives for `TAUNT_DISPLAY_MS` and is
 * forgotten. It never reaches the reducer, the journal or the event log.
 */
export function useTaunts(gameId: string): UseTauntsResult {
  const { socket } = useSocket()
  const [current, setCurrent] = useState<ActiveTaunt | null>(null)
  // Refs, not state: both are read on demand inside the long-press handler and
  // must never re-render the live board.
  const lastSentAtRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!socket) return

    const onTaunt = (payload: TauntPayload): void => {
      if (payload.gameId !== gameId) return
      // An id from a newer server: ignore rather than stamp an empty card.
      if (!isTauntId(payload.tauntId)) return
      // Clear the previous timer first, so back-to-back taunts do not leave a
      // stale timeout that would blank the newer stamp early.
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      setCurrent({
        seq: seqRef.current++,
        fromId: payload.fromId,
        targetId: payload.targetId,
        tauntId: payload.tauntId,
      })
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setCurrent(null)
      }, TAUNT_DISPLAY_MS)
    }

    socket.on('game:taunt', onTaunt)
    return () => {
      socket.off('game:taunt', onTaunt)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [socket, gameId])

  const cooldownRemainingMs = useCallback(
    (): number => tauntCooldownRemaining(lastSentAtRef.current, Date.now()),
    []
  )

  const send = useCallback(
    async (targetId: string, tauntId: TauntId): Promise<Ack<Record<never, never>>> => {
      if (!socket) return timeoutAck()
      // Start the local window BEFORE emitting: it then always closes earlier
      // than the server's, which starts on receipt, so the client stays the
      // stricter of the two and never gets a surprise RATE_LIMITED.
      lastSentAtRef.current = Date.now()
      const ack = await emitWithAck(socket, 'game:send_taunt', { gameId, targetId, tauntId })
      // The taunt never landed — give the minute back.
      if (!ack.ok) lastSentAtRef.current = null
      return ack
    },
    [socket, gameId]
  )

  return { current, cooldownRemainingMs, send }
}
