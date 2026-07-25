'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Presence } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'

export interface UsePresenceResult {
  /** Latest known presence per userId (friends only — server scoped). */
  presenceMap: Record<string, Presence>
  /** Presence for one user, `offline` when nothing was received yet. */
  presenceOf: (userId: string) => Presence
}

/**
 * Friends presence map fed by `presence:update` broadcasts. The initial
 * values come from SSR data (T24); this hook only tracks live transitions.
 */
export function usePresence(initial?: Record<string, Presence>): UsePresenceResult {
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>(initial ?? {})
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket) return
    const onUpdate = ({ userId, presence }: { userId: string; presence: Presence }): void => {
      setPresenceMap((current) => ({ ...current, [userId]: presence }))
    }
    socket.on('presence:update', onUpdate)
    return () => {
      socket.off('presence:update', onUpdate)
    }
  }, [socket])

  const presenceOf = useCallback(
    (userId: string): Presence => presenceMap[userId] ?? 'offline',
    [presenceMap]
  )

  return { presenceMap, presenceOf }
}
