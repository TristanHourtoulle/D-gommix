import type { ReactNode } from 'react'
import { SocketProvider } from '@/components/socket-provider'
import { ToastProvider } from '@/components/ui/toast'
import { requireOnboardedSession } from '@/lib/session'

/**
 * Fullscreen live route, outside the `(tabs)` group: no tab bar, and its own
 * socket + toast providers since the tabs layout does not apply here.
 */
export default async function PartieLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireOnboardedSession()

  return (
    <SocketProvider>
      <ToastProvider>{children}</ToastProvider>
    </SocketProvider>
  )
}
