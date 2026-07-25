'use client'

import { useEffect } from 'react'

/**
 * Keeps the screen awake while the component is mounted (design §6.4):
 * requests a screen wake lock on mount, re-requests it when the page comes
 * back to the foreground and releases it on unmount. Every failure is silent
 * — the app keeps working, the screen may simply lock.
 */
export function useWakeLock(): void {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    const request = async (): Promise<void> => {
      if (!('wakeLock' in navigator)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) {
          lock.release().catch(() => undefined)
          return
        }
        sentinel = lock
      } catch {
        // Unsupported browser or denied request: silent by design.
      }
    }

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [])
}
