'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-reporter'

interface CrashScreenProps {
  error: Error & { digest?: string }
}

/**
 * Crash floor for a route segment. Rendered inside the root layout, so
 * globals.css tokens and the .cta key are available. « Recharger » does a full
 * reload on purpose: the ws-server replays the complete event log on
 * reconnection, so a live game rebuilds itself losslessly.
 */
export function CrashScreen({ error }: CrashScreenProps) {
  useEffect(() => {
    reportClientError(error, window.location.pathname, navigator.userAgent)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1
        className="text-xl font-extrabold uppercase tracking-wide text-ink"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Par Toutatis, un pépin !
      </h1>
      <p className="max-w-xs text-sm text-ink-soft">
        L’écran s’est dégommé tout seul. Recharge pour reprendre — rien n’est perdu.
      </p>
      <button
        type="button"
        className="cta"
        style={{ maxWidth: '16rem' }}
        onClick={() => window.location.reload()}
      >
        Recharger
      </button>
    </main>
  )
}
