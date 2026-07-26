/**
 * Query keys of the tab data endpoints. One key per screen payload, so a
 * websocket event can invalidate exactly the screens it affects instead of
 * forcing a whole-page RSC refetch through `router.refresh()`.
 */
export const queryKeys = {
  /** GET /api/home — stats tiles, resume banner, recent history. */
  home: ['home'] as const,
  /** GET /api/invites — lobby invitations still awaiting an answer. */
  invites: ['invites'] as const,
  /** GET /api/friends — requests in/out, friend list, own lobby id. */
  friends: ['friends'] as const,
  /**
   * GET /api/leaderboard — friends-circle ranking and character winrates.
   * Invalidation root: `useLeaderboardData` appends the period ('all' |
   * 'month'); `invalidateQueries` prefix-matches both variants.
   */
  leaderboard: ['leaderboard'] as const,
}
