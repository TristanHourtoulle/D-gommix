'use client'

import { useEffect } from 'react'
import { useSocket } from '@/components/socket-provider'
import { useInvalidateTabData } from '@/hooks/use-tab-data'

/**
 * Mount-once bridge between `stats:invalidate` and the tab query cache. The
 * ws-server pushes it to every seated player's `user:{id}` room when a game
 * finishes, so counters refresh even for tabs that never mounted the live
 * screen (Classement left open, backgrounded PWA, second device). History
 * rows live inside the home payload, so `home` + `leaderboard` cover it.
 */
export function StatsEventsBridge() {
  const { socket } = useSocket()
  const invalidate = useInvalidateTabData()

  useEffect(() => {
    if (!socket) return
    // The payload (`StatsInvalidatePayload`) is intentionally ignored: any
    // scope means the persisted stats changed and both payloads refetch.
    const onInvalidate = (): void => {
      invalidate('home', 'leaderboard')
    }
    socket.on('stats:invalidate', onInvalidate)
    return () => {
      socket.off('stats:invalidate', onInvalidate)
    }
  }, [socket, invalidate])

  return null
}
