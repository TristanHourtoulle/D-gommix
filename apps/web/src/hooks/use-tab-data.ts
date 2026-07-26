'use client'

import { useCallback } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type DefinedUseQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query'
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

/**
 * The SSR payload is stamped as already stale (`initialDataUpdatedAt: 0`):
 * without it TanStack Query timestamps `initialData` at mount time, so a
 * replayed RSC payload (Router Cache) or a remount within `staleTime` would
 * paint pre-game numbers and never refetch. With it the first paint is still
 * instant from `initialData`, but a background refetch always revalidates.
 */
const STALE_INITIAL_DATA = { initialDataUpdatedAt: 0 } as const

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
    ...STALE_INITIAL_DATA,
  })
}

/** Accueil stats, resume banner and history. */
export function useHomeData(initialData: HomePayload): DefinedUseQueryResult<HomePayload, Error> {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => fetchPayload('/api/home', homePayloadSchema),
    initialData,
    ...STALE_INITIAL_DATA,
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
    ...STALE_INITIAL_DATA,
  })
}

/**
 * Pending-invitations count for the tab-bar badge. Same query key as the
 * screens, so the badge rides the cache they seed and every ws invalidation
 * — it only triggers its own `/api/invites` fetch on a cold cache (a hard
 * load landing outside Accueil/Arène).
 */
export function useInvitesCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => fetchPayload('/api/invites', invitesPayloadSchema),
  })
  return data?.invites.length ?? 0
}

/**
 * Friends payload for surfaces without an SSR seed (the friend profile
 * island). Same query key as the Amis screen, so it rides the cache that
 * screen seeds and every `friends` invalidation — it only triggers its own
 * `/api/friends` fetch on a cold cache (a hard load landing on a profile).
 * `undefined` until the first payload is available.
 */
export function useFriendsSnapshot(): FriendsPayload | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => fetchPayload('/api/friends', friendsPayloadSchema),
  })
  return data
}

export type LeaderboardPeriod = 'all' | 'month'

/**
 * Classement of the friends circle. `period` selects the window server-side;
 * only the all-time variant is SSR-seeded, so the month variant fetches on
 * first use while `keepPreviousData` keeps the previous window on screen.
 * Invalidations target the `queryKeys.leaderboard` prefix and hit both.
 */
export function useLeaderboardData(
  initialData: LeaderboardPayload,
  period: LeaderboardPeriod = 'all'
): UseQueryResult<LeaderboardPayload, Error> {
  return useQuery({
    queryKey: [...queryKeys.leaderboard, period] as const,
    queryFn: () => fetchPayload(`/api/leaderboard?period=${period}`, leaderboardPayloadSchema),
    initialData: period === 'all' ? initialData : undefined,
    ...STALE_INITIAL_DATA,
    placeholderData: keepPreviousData,
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
