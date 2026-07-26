import type { ReactNode } from 'react'
import { InviteEventsBridge } from '@/components/invite-events-bridge'
import { SocketProvider } from '@/components/socket-provider'
import { QueryProvider } from '@/lib/query-client'
import { requireOnboardedSession } from '@/lib/session'

/**
 * Fullscreen live route, outside the `(tabs)` group: no tab bar, and its own
 * socket provider since the tabs layout does not apply here. The query
 * provider hands back the same browser-singleton client as the tabs, so the
 * end-of-game invalidation reaches the Accueil and Classement caches. Toasts
 * come from the root layout, which is what keeps them alive when « Revanche ! »
 * leaves this route for /lobby. The invite bridge (mounted in the tabs layout
 * everywhere else) must also live here so `invite:received` — notably a
 * rematch invitation caught by the summary's RematchPrompt — keeps patching
 * the invites cache while the player is on this route.
 */
export default async function PartieLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <InviteEventsBridge />
        {children}
      </SocketProvider>
    </QueryProvider>
  )
}
