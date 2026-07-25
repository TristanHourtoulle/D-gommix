/**
 * Search results state of the Amis screen, kept in sync with the live
 * `friends:event` broadcasts (post-playtest round 1): the rows returned by
 * `/api/friends/search` are a snapshot of the relation flags at query time, so
 * a still-open results list went stale as soon as the other side answered —
 * a row accepted by the receiver kept showing « Demande en attente ».
 *
 * The relation flags mirror the ones computed by the search route
 * (`apps/web/src/app/api/friends/search/route.ts`), which reads `hasPending`
 * in both directions, hence the mapping below is expressed from the point of
 * view of the *recipient* of the event — `event.from` is always the other user.
 */

import { z } from 'zod'
import type { FriendsEventKind, FriendsEventPayload } from '@/lib/realtime-types'

export const searchResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      avatarId: z.string().nullable().optional(),
      isFriend: z.boolean(),
      hasPending: z.boolean(),
    })
  ),
})

export type SearchUser = z.infer<typeof searchResponseSchema>['users'][number]

type RowRelation = Pick<SearchUser, 'isFriend' | 'hasPending'>

/**
 * Relation the row of `event.from.id` must show once the event landed:
 * - `request_received`: they just asked us → « Demande en attente »
 * - `request_accepted`: they accepted our request → « Déjà amis »
 * - `request_canceled`: they withdrew their request → invitable again
 *
 * A declined request and a friendship removal emit nothing on purpose
 * (`apps/ws-server/src/handlers/friends.ts`), so they cannot be reconciled
 * here; the next search refetch carries the truth.
 */
const RELATION_AFTER = {
  request_received: { isFriend: false, hasPending: true },
  request_accepted: { isFriend: true, hasPending: false },
  request_canceled: { isFriend: false, hasPending: false },
} as const satisfies Record<FriendsEventKind, RowRelation>

/**
 * Patches the row of the user the event comes from. Returns the very same
 * array when nothing changed (unknown user, unknown kind, already up to date)
 * so an unrelated event costs no re-render.
 */
export function applyFriendsEvent(
  results: SearchUser[],
  event: FriendsEventPayload
): SearchUser[] {
  const relation: RowRelation | undefined = RELATION_AFTER[event.kind]
  if (!relation) return results
  let changed = false
  const next = results.map((entry) => {
    if (entry.id !== event.from.id) return entry
    if (entry.isFriend === relation.isFriend && entry.hasPending === relation.hasPending) {
      return entry
    }
    changed = true
    return { ...entry, ...relation }
  })
  return changed ? next : results
}
