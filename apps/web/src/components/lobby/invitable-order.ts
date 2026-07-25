import type { Presence } from '@degommix/game-core'
import type { InvitableFriend } from '@/lib/queries/lobby'

/**
 * Invite-list ordering: reachable friends first, then the ones who would not
 * answer, then the ones stuck in another game. A pending invitation blocks
 * « Lancer la partie » (SPECS.md:92), so surfacing availability before the tap
 * is what keeps the host from stalling their own lobby.
 */
const AVAILABILITY_RANK: Record<Presence, number> = {
  online: 0,
  offline: 1,
  in_game: 2,
}

export function sortByAvailability(
  friends: InvitableFriend[],
  presenceOf: (userId: string) => Presence
): InvitableFriend[] {
  return [...friends].sort(
    (a, b) => AVAILABILITY_RANK[presenceOf(a.id)] - AVAILABILITY_RANK[presenceOf(b.id)]
  )
}
