'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { TAP_LOCK_COOLDOWN_MS, TapLock, type TapLockSnapshot } from './tap-lock'

export interface UseTapLockResult extends TapLockSnapshot {
  /** Registers a tap — `false` means it was swallowed as a double tap. */
  begin: (targetId: string) => boolean
  /** Resolves the pending tap on that target with the server ack result. */
  settle: (targetId: string, ok: boolean) => void
}

/** React binding of {@link TapLock} — that module documents the lock rules. */
export function useTapLock(cooldownMs: number = TAP_LOCK_COOLDOWN_MS): UseTapLockResult {
  const lock = useMemo(() => new TapLock(cooldownMs), [cooldownMs])

  useEffect(
    () => () => {
      lock.dispose()
    },
    [lock]
  )

  const { lockedTargetIds, pendingTargetIds } = useSyncExternalStore(
    lock.subscribe,
    lock.getSnapshot,
    lock.getSnapshot
  )

  return { lockedTargetIds, pendingTargetIds, begin: lock.begin, settle: lock.settle }
}
