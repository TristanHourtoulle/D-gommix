'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Presence } from '@degommix/game-core'
import { mergePresence, presenceStore } from '@/lib/presence-store'

export interface UsePresenceResult {
  /** Latest known presence per userId (friends only — server scoped). */
  presenceMap: Readonly<Record<string, Presence>>
  /** Presence for one user, `offline` when nothing was received yet. */
  presenceOf: (userId: string) => Presence
  /**
   * Live `lastSeenAt` (ISO) delivered with an `offline` transition on this
   * socket, null when none arrived — callers fall back to their SSR seed.
   */
  lastSeenOf: (userId: string) => string | null
}

/**
 * Friends presence map, read from the socket-lifetime store so it survives
 * client-side navigations (see `@/lib/presence-store`).
 *
 * `initial` is an optional SSR/query seed (T24) and is merged UNDER the live
 * map: a value received on the socket always wins over the seed, whatever the
 * order in which they arrive, and the seed is only what fills the first paint
 * (and the friends the socket has said nothing about).
 */
export function usePresence(initial?: Record<string, Presence>): UsePresenceResult {
  const live = useSyncExternalStore(
    presenceStore.subscribe,
    presenceStore.getSnapshot,
    presenceStore.getSnapshot
  )

  const liveLastSeen = useSyncExternalStore(
    presenceStore.subscribe,
    presenceStore.getLastSeen,
    presenceStore.getLastSeen
  )

  const presenceMap = useMemo(() => mergePresence(initial, live), [initial, live])

  const presenceOf = useCallback(
    (userId: string): Presence => presenceMap[userId] ?? 'offline',
    [presenceMap]
  )

  const lastSeenOf = useCallback(
    (userId: string): string | null => liveLastSeen[userId] ?? null,
    [liveLastSeen]
  )

  return { presenceMap, presenceOf, lastSeenOf }
}
