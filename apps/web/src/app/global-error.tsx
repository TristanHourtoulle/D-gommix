'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-reporter'

const STYLES = `
  :root { --parchment: #ece0c4; --ink: #251a10; --ink-soft: #6d5a3f; --bronze: #8c5a2b; --surface-2: #fbf6e9; }
  @media (prefers-color-scheme: dark) {
    :root { --parchment: #1c150d; --ink: #f1e3c2; --ink-soft: #cbb98c; --bronze: #d79a4b; --surface-2: #2b2115; }
  }
  body { margin: 0; background: var(--parchment); color: var(--ink); font-family: 'Times New Roman', Georgia, serif; }
  main { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 0 1.5rem; text-align: center; }
  h1 { font-size: 1.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
  p { max-width: 20rem; font-size: 0.9rem; color: var(--ink-soft); }
  button { font: inherit; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; background: var(--bronze); color: var(--surface-2); border: 2px solid var(--ink); border-radius: 14px; padding: 0.8rem 1.5rem; cursor: pointer; box-shadow: 0 5px 0 var(--ink); }
  button:active { transform: translateY(5px); box-shadow: none; }
`

/**
 * Last-resort crash floor: replaces the root layout, so it must ship its own
 * <html>/<body> and inline styling (globals.css is not loaded here). Only
 * rendered in production builds — next dev shows the overlay instead.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error, window.location.pathname, navigator.userAgent)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <style>{STYLES}</style>
        <main>
          <h1>Par Toutatis, un pépin !</h1>
          <p>L’écran s’est dégommé tout seul. Recharge pour reprendre — rien n’est perdu.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </main>
      </body>
    </html>
  )
}
