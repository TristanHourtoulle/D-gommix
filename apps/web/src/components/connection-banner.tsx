'use client'

import { useSocket } from '@/components/socket-provider'

/** Thin fixed « Reconnexion… » banner shown while the socket is reconnecting. */
export function ConnectionBanner() {
  const { status } = useSocket()

  if (status !== 'reconnecting') return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 py-1 pt-[calc(0.25rem_+_env(safe-area-inset-top))] text-center text-xs font-semibold"
      style={{ background: 'var(--bronze-tint)', color: 'var(--bronze-strong)' }}
    >
      Reconnexion…
    </div>
  )
}
