'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient, type DefinedUseQueryResult } from '@tanstack/react-query'
import type { ZodType } from 'zod'
import {
  friendsPayloadSchema,
  homePayloadSchema,
  invitesPayloadSchema,
  leaderboardPayloadSchema,
  type FriendsPayload,
  type HomePayload,
  type InvitesPayload,
  type LeaderboardPayload,
} from '@/lib/api-payloads'
import { queryKeys } from '@/lib/query-keys'

/** Fetches a tab payload and validates its shape before it reaches the cache. */
async function fetchPayload<T>(url: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`)
  }
  return schema.parse(await response.json())
}

/**
 * Amis lists. Seeded with the SSR payload so the first paint is instant, then
 * owned by the cache: `friends:event` and every friend command invalidate it.
 */
export function useFriendsData(
  initialData: FriendsPayload
): DefinedUseQueryResult<FriendsPayload, Error> {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => fetchPayload('/api/friends', friendsPayloadSchema),
    initialData,
  })
}

/** Accueil stats, resume banner and history. */
export function useHomeData(initialData: HomePayload): DefinedUseQueryResult<HomePayload, Error> {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => fetchPayload('/api/home', homePayloadSchema),
    initialData,
  })
}

/** Pending lobby invitations (Accueil banner + Jouer tab list). */
export function useInvitesData(
  initialData: InvitesPayload
): DefinedUseQueryResult<InvitesPayload, Error> {
  return useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => fetchPayload('/api/invites', invitesPayloadSchema),
    initialData,
  })
}

/** Classement of the friends circle. */
export function useLeaderboardData(
  initialData: LeaderboardPayload
): DefinedUseQueryResult<LeaderboardPayload, Error> {
  return useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: () => fetchPayload('/api/leaderboard', leaderboardPayloadSchema),
    initialData,
  })
}

export type TabDataKey = keyof typeof queryKeys

/**
 * Targeted invalidation for websocket handlers. Marks the affected payloads
 * stale and refetches the ones currently on screen — the rest refresh the next
 * time their tab mounts.
 */
export function useInvalidateTabData(): (...keys: TabDataKey[]) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (...keys: TabDataKey[]) => {
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: queryKeys[key] })
      }
    },
    [queryClient]
  )
}
