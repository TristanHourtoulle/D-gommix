/**
 * Query keys of the tab data endpoints. One key per screen payload, so a
 * websocket event can invalidate exactly the screens it affects instead of
 * forcing a whole-page RSC refetch through `router.refresh()`.
 */
export const queryKeys = {
  /** GET /api/home — stats tiles, resume banner, recent history. */
  home: ['home'] as const,
  /** GET /api/friends — requests in/out, friend list, own lobby id. */
  friends: ['friends'] as const,
  /** GET /api/leaderboard — friends-circle ranking and character winrates. */
  leaderboard: ['leaderboard'] as const,
}
