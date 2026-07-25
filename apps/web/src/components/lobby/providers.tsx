'use client'

import type { ReactNode } from 'react'
import { SocketProvider } from '@/components/socket-provider'
import { ToastProvider } from '@/components/ui/toast'

interface RealtimeProvidersProps {
  children: ReactNode
}

/**
 * Socket + toast context for the realtime screens (Jouer, Lobby).
 * Local to these pages until the providers are hoisted into a shared layout;
 * the socket itself is a module singleton, so remounts reuse the connection.
 */
export function RealtimeProviders({ children }: RealtimeProvidersProps) {
  return (
    <SocketProvider>
      <ToastProvider>{children}</ToastProvider>
    </SocketProvider>
  )
}
