'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * A tab payload stays fresh for 30 s: bouncing between Accueil, Amis and
 * Classement inside that window costs zero network. Websocket events
 * invalidate the affected key immediately, so freshness never depends on it.
 */
const STALE_TIME_MS = 30_000

/** Unmounted payloads survive 5 min, which is what makes back-navigation instant. */
const GC_TIME_MS = 5 * 60_000

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        // The socket already pushes every mutation that matters; refetching on
        // each focus would only add jank on mobile tab switches.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  // Server: a fresh client per request. Browser: one singleton, kept outside
  // React state so a suspending initial render cannot throw the cache away.
  if (typeof window === 'undefined') return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

interface QueryProviderProps {
  children: ReactNode
}

/** App-wide TanStack Query cache, mounted by the (tabs) layout. */
export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
}
