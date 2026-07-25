'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket } from '@/components/socket-provider'
import type { FriendsEventPayload } from '@/lib/realtime-types'

export interface UseFriendsEventsResult {
  /** Friend request lifecycle events received while mounted, newest last. */
  events: FriendsEventPayload[]
  clear: () => void
}

/**
 * Streams `friends:event` broadcasts (request received / accepted /
 * canceled). The optional `onEvent` callback lets the Amis screen patch its
 * SSR-fed lists without resubscribing on each render.
 */
export function useFriendsEvents(
  onEvent?: (event: FriendsEventPayload) => void
): UseFriendsEventsResult {
  const { socket } = useSocket()
  const [events, setEvents] = useState<FriendsEventPayload[]>([])
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!socket) return
    const onFriendsEvent = (payload: FriendsEventPayload): void => {
      setEvents((current) => [...current, payload])
      handlerRef.current?.(payload)
    }
    socket.on('friends:event', onFriendsEvent)
    return () => {
      socket.off('friends:event', onFriendsEvent)
    }
  }, [socket])

  const clear = useCallback(() => {
    setEvents([])
  }, [])

  return { events, clear }
}
