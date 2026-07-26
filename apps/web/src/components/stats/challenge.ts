import type { Presence } from '@degommix/game-core'

/**
 * What the « Régler ses comptes » key looks like for one rivalry row.
 * `hidden` means no key at all: the rival is not (or not yet known to be) a
 * friend, and `lobby:invite` would reject the invitation server-side with
 * INVALID_TARGET (apps/ws-server/src/handlers/lobby.ts:96-101).
 */
export type ChallengeState = 'hidden' | 'busy' | 'in_game' | 'ready'

export interface ChallengeInput {
  rivalId: string
  /**
   * Ids from the friends payload; `undefined` while it is not in cache yet —
   * treated as `hidden` so no key flashes before the guard can be applied.
   */
  friendIds: ReadonlySet<string> | undefined
  presence: Presence
  /** Rival with an invitation in flight, from `useInviteFriend`. */
  busyRivalId: string | null
}

/**
 * Pure gate of the rivalry-row action. Order matters: friendship first (the
 * server rule), then the transient in-flight state, then presence — a rival
 * already in an active game would be rejected with ALREADY_IN_GAME
 * (apps/ws-server/src/handlers/lobby.ts:105-108), so the key is greyed rather
 * than hidden (a row must not gain and lose its action as presence flips).
 */
export function challengeState({
  rivalId,
  friendIds,
  presence,
  busyRivalId,
}: ChallengeInput): ChallengeState {
  if (friendIds === undefined || !friendIds.has(rivalId)) return 'hidden'
  if (busyRivalId === rivalId) return 'busy'
  if (presence === 'in_game') return 'in_game'
  return 'ready'
}
