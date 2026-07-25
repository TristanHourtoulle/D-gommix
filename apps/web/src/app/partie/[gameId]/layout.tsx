import type { ReactNode } from 'react'
import { SocketProvider } from '@/components/socket-provider'
import { ToastProvider } from '@/components/ui/toast'
import { QueryProvider } from '@/lib/query-client'
import { requireOnboardedSession } from '@/lib/session'

/**
 * Fullscreen live route, outside the `(tabs)` group: no tab bar, and its own
 * socket + toast providers since the tabs layout does not apply here. The
 * query provider hands back the same browser-singleton client as the tabs, so
 * the end-of-game invalidation reaches the Accueil and Classement caches.
 */
export default async function PartieLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <ToastProvider>{children}</ToastProvider>
      </SocketProvider>
    </QueryProvider>
  )
}
