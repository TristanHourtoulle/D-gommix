'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { attachLobbyCache } from '@/lib/lobby-cache'
import { attachPresenceStore } from '@/lib/presence-store'
import { getSocket } from '@/lib/socket'
import type { AppSocket } from '@/lib/realtime-types'

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting'

export interface SocketContextValue {
  socket: AppSocket | null
  status: SocketStatus
  connected: boolean
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: 'connecting',
  connected: false,
})

interface SocketProviderProps {
  children: ReactNode
}

/**
 * Owns the app-wide socket singleton: connects on mount (client only) and
 * tracks the connection status for the discreet « Reconnexion… » banner.
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<AppSocket | null>(null)
  const [status, setStatus] = useState<SocketStatus>('connecting')

  useEffect(() => {
    const s = getSocket()
    attachLobbyCache(s)
    attachPresenceStore(s)
    setSocket(s)
    setStatus(s.connected ? 'connected' : 'connecting')

    const onConnect = (): void => {
      setStatus('connected')
    }
    const onDisconnect = (): void => {
      setStatus('reconnecting')
    }
    const onConnectError = (): void => {
      setStatus((previous) => (previous === 'connected' ? 'reconnecting' : previous))
    }
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('connect_error', onConnectError)
    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('connect_error', onConnectError)
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, status, connected: status === 'connected' }}>
      {children}
    </SocketContext.Provider>
  )
}

/** Connection state + socket instance (null during SSR and first paint). */
export function useSocket(): SocketContextValue {
  return useContext(SocketContext)
}
