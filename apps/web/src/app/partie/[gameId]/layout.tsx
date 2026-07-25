import type { ReactNode } from 'react'
import { SocketProvider } from '@/components/socket-provider'
import { QueryProvider } from '@/lib/query-client'
import { requireOnboardedSession } from '@/lib/session'

/**
 * Fullscreen live route, outside the `(tabs)` group: no tab bar, and its own
 * socket provider since the tabs layout does not apply here. The query
 * provider hands back the same browser-singleton client as the tabs, so the
 * end-of-game invalidation reaches the Accueil and Classement caches. Toasts
 * come from the root layout, which is what keeps them alive when « Rejouer »
 * leaves this route for /lobby.
 */
export default async function PartieLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>{children}</SocketProvider>
    </QueryProvider>
  )
}
