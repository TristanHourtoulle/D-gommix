# Plan 028: Personal stats the data already knows — « Dégommages subis » and per-character winrate per player

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 596863e..HEAD -- \
>   apps/web/src/lib/rivalries.ts \
>   apps/web/src/lib/rivalries.test.ts \
>   apps/web/src/lib/queries/rivalries.ts \
>   apps/web/src/lib/queries/stats.ts \
>   apps/web/src/lib/api-payloads.ts \
>   apps/web/src/app/api/leaderboard/route.ts \
>   'apps/web/src/app/(tabs)/classement/page.tsx' \
>   'apps/web/src/app/(tabs)/profil/page.tsx' \
>   'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' \
>   apps/web/src/components/stats/leaderboard-screen.tsx \
>   apps/web/src/components/stats/character-winrate-bars.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `596863e`, 2026-07-26

## Why this matters

Two personal stats are fully recorded in the database and never shown anywhere.
First, every `DEGOMMAGE` event carries a `target_id`, but every surfaced number
is dealt-side — nobody can see how often they (or a friend) *got hit*, so the
circle's souffre-douleur has no spotlight and the friend profile is half a
story. Second, `getLeaderboard` already groups seats by `(userId, character)`
but only counts `played`, then collapses everything to one `favoriteCharacter`
scalar — « suis-je meilleur en Obélix ? » is unanswerable even though wins per
seat are one SQL aggregate away. This plan adds both as pure read-model
features: no schema change, no migration, no ws-server change, and the `/profil`
page gets its first stats block.

## Current state

All excerpts verified at commit `596863e`. Baselines verified passing at that
commit: `pnpm typecheck` exit 0, `pnpm lint` exit 0,
`pnpm --filter @degommix/web test` → **27 files / 315 tests**
(`apps/web/src/lib/rivalries.test.ts` contributes 17 of them).

### Files and their roles

- `packages/db/src/schema/games.ts` — `game_events` has `targetId` (line 88).
  Its only indexes (lines 93–96, and
  `packages/db/drizzle/0000_fixed_monster_badoon.sql:135-136`) are
  `game_events_game_seq_unique` and `game_events_game_seq`, both on
  `(game_id, seq)`. **There is no index on `target_id` or `type`, and this plan
  must not add one** (see STOP conditions).
- `packages/game-core/src/types.ts:25` — `targetId` is mandatory on DEGOMMAGE:
  `| (BaseEvent & { type: 'DEGOMMAGE'; actorId: string; targetId: string; payload: null })`.
- `apps/web/src/lib/rivalries.ts` — pure, db-free aggregation (plan 003). Its
  `aggregatePairCounts` (lines 58–83) already computes both sides pairwise,
  cancelling undone hits via `undoneKeys` (lines 40–48, `${gameId}:${targetSeq}`
  keys). This is **the** UNDO-cancellation path to reuse.
- `apps/web/src/lib/queries/rivalries.ts` — db wrappers: `finishedGameIdsFor`
  (48–63), `loadRivalryEvents` (69–85), `getHeadToHead`, `getRivalrySpotlight`
  (153–176). Everything is viewer-pairwise; no circle-wide `taken` exists.
- `apps/web/src/lib/queries/stats.ts` — `getLeaderboard` (200–318) with the
  per-(user, character) `characterRows` query (211–221, no wins), the
  circle-wide `characterWinrates` from `seatRows` (222–243 query, 303–315
  build), and the `favoriteCharacter` collapse (266–281).
- `apps/web/src/lib/queries/friends.ts` — `getPlayerStats` (184–242): the
  friend-profile tiles; dealt-only (`sum(game_players.degommages)` at 207–214).
- `apps/web/src/lib/api-payloads.ts` — zod wire schemas;
  `leaderboardPayloadSchema` (110–142), `rivalryPeerSchema` (103–108).
- `apps/web/src/app/api/leaderboard/route.ts` — JSON twin of the Classement
  (must stay byte-identical to the SSR seed).
- `apps/web/src/app/(tabs)/classement/page.tsx` — SSR seed (lines 10–15).
- `apps/web/src/components/stats/leaderboard-screen.tsx` — client shell;
  renders `TopDegommeurTile` / `RivalryTile` / `CharacterWinrateBars`.
- `apps/web/src/components/stats/top-degommeur-tile.tsx` — the dealt-side
  spotlight (« Fléau des Gaules ») this plan mirrors on the taken side.
- `apps/web/src/components/stats/character-winrate-bars.tsx` — the bars idiom
  to reuse for per-player winrates (read-only in this plan).
- `apps/web/src/app/(tabs)/profil/page.tsx` — own-profile page; **zero stats
  today** (only pseudo/avatar/theme/account sections, lines 14–89).
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — friend profile; 3 stat
  tiles (71–75), fetish character, shared games.

### The UNDO-cancellation rule (hard constraint)

`game_players.degommages` is the reducer's non-undone count copied at close by
`apps/ws-server/src/finalize.ts`. The equivalent read-side rule, already
implemented and unit-tested in `apps/web/src/lib/rivalries.ts:40-48`:

```ts
/**
 * `{gameId}:{seq}` key of every degommage cancelled by an UNDO event. The game
 * id is part of the key because `seq` restarts at 1 in every game.
 */
function undoneKeys(rows: readonly RivalryEventRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.type !== 'UNDO') continue
    const targetSeq = readTargetSeq(row.payload)
    if (targetSeq !== null) keys.add(`${row.gameId}:${targetSeq}`)
  }
  return keys
}
```

and its use in `aggregatePairCounts` (`rivalries.ts:73-80`):

```ts
  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    if (actorId === viewerId) entry(targetId).dealt += 1
    else if (targetId === viewerId) entry(actorId).taken += 1
  }
```

**Hard constraint**: every new `taken` number in this plan MUST go through this
path (`loadRivalryEvents` → a pure aggregate that reuses `undoneKeys`). Do NOT
write a raw SQL `count(*)` over `game_events where type = 'DEGOMMAGE'` — it
would overcount, because undone dégommages stay in the event log and are only
cancelled by a matching `UNDO` row of the same game.

### The per-character query as it exists (no wins)

`apps/web/src/lib/queries/stats.ts:211-221`, inside `getLeaderboard`'s
`Promise.all`:

```ts
    db
      .select({
        userId: gamePlayers.userId,
        character: gamePlayers.character,
        played: sql`count(*)`.mapWith(Number),
        lastPlayed: sql`extract(epoch from max(${games.startedAt}))`.mapWith(Number),
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(finishedStarted, sql`${gamePlayers.character} is not null`))
      .groupBy(gamePlayers.userId, gamePlayers.character),
```

The favorites collapse (`stats.ts:266-281`) keeps only the most-played
character per user. The circle-wide `characterWinrates` (`stats.ts:303-315`)
never breaks down per player. The wins aggregate to copy already exists in
`queryCircleStats` (`stats.ts:135`):

```ts
      wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(Number),
```

### Winrate small-sample guard precedent

`apps/web/src/lib/queries/friends.ts:237` (and the same shape at
`stats.ts:163`):

```ts
    winrate: villageGames > 0 ? wins / villageGames : null,
```

Winrate is only ever computed over `village_reached` games (SPECS.md:126:
« **Parties abandonnées** : les dégommages comptent, mais la partie est
**exclue du dénominateur du winrate**. ») and is `null`/hidden below one such
game. Mirror exactly that guard for per-character winrates.

### Payload contract and conventions

`apps/web/src/lib/api-payloads.ts:6-12` documents the invariant: the JSON a
client query receives is **byte-identical** to the `initialData` the server
component seeds. So any field added to the leaderboard payload must be produced
by BOTH `classement/page.tsx` and `api/leaderboard/route.ts`. Fields added
after launch are `.optional()` for old PWA-cached payloads — exemplar at
`api-payloads.ts:121-122`:

```ts
      /** Optional for old PWA-cached SSR payloads (same convention as lastSeenAt). */
      currentStreak: z.number().optional(),
```

`rivalryPeerSchema` (`api-payloads.ts:103-108`) is
`{ userId, username, avatarId?, count }` — reuse it for the souffre-douleur.

Other conventions: French UI copy with typographic apostrophe `’`, English
identifiers/comments, TS strict, no `any`. Pure helpers live in db-free modules
with co-located vitest tests (`apps/web/vitest.config.ts` runs with no DB and
no env; importing `@/lib/db` transitively throws — this is why `rivalries.ts`
is separate from `queries/rivalries.ts`, see plan 003). Icon set is closed:
`IconName = keyof typeof paths` (`apps/web/src/components/icons.tsx:142`);
available names include `sword`, `trophy`, `flag`, `pawn`, `crown`, `timer`.

### E2E contract that must keep passing

`e2e/happy-path.spec.ts:134-136` asserts on the Classement by test id:

```ts
    await p1.goto('/classement')
    await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
    await expect(p1.getByTestId(`ranking-row-${J1.username}`)).toContainText('0 v')
```

New tiles above the ranking do not affect these assertions. No e2e spec reads
`/profil` or `/amis/[userId]`.

## Commands you will need

All verified at commit `596863e` (from the repo root; Node ≥ 22, pnpm, Turbo):

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (repo) | `pnpm typecheck` | exit 0 |
| Lint (repo) | `pnpm lint` | exit 0 |
| Web unit tests | `pnpm --filter @degommix/web test` | all pass (baseline 27 files / 315 tests) |
| One test file | `pnpm --filter @degommix/web exec vitest run src/lib/rivalries.test.ts` | that file passes |
| Test DB (db/ws suites only) | `docker compose -f docker-compose.test.yml up -d` | container running |
| Full test suite (serialized — DB suites share one database) | `pnpm exec turbo run test --concurrency=1` | exit 0 |
| E2E | `pnpm test:e2e` | all pass |

If Docker is unavailable, run `pnpm --filter @degommix/web test` and
`pnpm --filter @degommix/game-core test` instead of the full suite and say so
in your report.

## Suggested executor toolkit

- Invoke `superpowers:verification-before-completion` before claiming done:
  paste real command output, never a summary.
- If a Drizzle API detail is unclear (`selectDistinct`, `sql` filter clauses),
  fetch current docs with Context7 (`mcp__context7__resolve-library-id` →
  `query-docs` for `drizzle-orm`) rather than guessing.
- Reference docs in the repo: `SPECS.md` §Stats (lines 122–128) and
  `docs/superpowers/specs/2026-07-25-degommix-design.md` §5.3 (lines 314–321).

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/lib/rivalries.ts` (edit — add `aggregateTakenCounts`)
- `apps/web/src/lib/rivalries.test.ts` (edit — new cases)
- `apps/web/src/lib/queries/rivalries.ts` (edit — circle-wide queries)
- `apps/web/src/lib/character-stats.ts` (create — pure per-character builder)
- `apps/web/src/lib/character-stats.test.ts` (create)
- `apps/web/src/lib/queries/stats.ts` (edit)
- `apps/web/src/lib/api-payloads.ts` (edit)
- `apps/web/src/app/api/leaderboard/route.ts` (edit)
- `apps/web/src/app/(tabs)/classement/page.tsx` (edit)
- `apps/web/src/components/stats/souffre-douleur-tile.tsx` (create)
- `apps/web/src/components/stats/per-character-block.tsx` (create)
- `apps/web/src/components/stats/leaderboard-screen.tsx` (edit)
- `apps/web/src/app/(tabs)/profil/page.tsx` (edit)
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` (edit)

**Out of scope** (do NOT touch, even though they look related):

- `packages/db/**` — **no schema change, no migration, no new index** (STOP
  condition if one seems needed).
- `apps/ws-server/**`, `packages/game-core/**` — read-only over existing data.
- `apps/web/src/lib/queries/friends.ts` — `getPlayerStats` keeps its shape;
  the subis number arrives via a separate query (same rationale as plan 003).
- `apps/web/src/components/stats/character-winrate-bars.tsx` — reused as-is.
- `apps/web/src/hooks/use-tab-data.ts`, `apps/web/src/lib/query-keys.ts` —
  invalidation is prefix-matched; nothing to change.
- `apps/web/src/components/stats/podium.tsx`, `ranking-table.tsx`,
  `rivalry-tile.tsx`, `top-degommeur-tile.tsx` — unchanged.
- `apps/web/src/app/globals.css` — reuse `.stat-tile`, `.sec-label`, existing
  card classes; no new CSS.
- `e2e/**`, `SPECS.md`, docs.

## Git workflow

- Branch: `feat/028-personal-stats` (repo convention `type/short-slug`).
- Conventional commits in English, one per step or logical unit — exemplar from
  `git log`: `feat(web): pair win record on the head-to-head card`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the pure taken-side aggregate to `apps/web/src/lib/rivalries.ts`

Add after `aggregatePairCounts` (keep `undoneKeys` private and reuse it — do
not duplicate the key logic):

```ts
/**
 * Non-undone degommages suffered per target, across every game found in
 * `rows`. Same cancellation rule as `aggregatePairCounts`: a DEGOMMAGE counts
 * unless an UNDO of the SAME game targets its `seq`. Self-degommages and rows
 * with a null actor or target are ignored.
 */
export function aggregateTakenCounts(rows: readonly RivalryEventRow[]): Map<string, number> {
  const undone = undoneKeys(rows)
  const taken = new Map<string, number>()
  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    taken.set(targetId, (taken.get(targetId) ?? 0) + 1)
  }
  return taken
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 2: Unit-test `aggregateTakenCounts` in `apps/web/src/lib/rivalries.test.ts`

Add a `describe('aggregateTakenCounts', …)` block using the existing row
factory of that file. Cases (all required):

1. `counts non-undone degommages per target across games`
2. `excludes a degommage cancelled by an UNDO targeting its seq`
3. `scopes undo exclusion to its own game` — an UNDO in game `g1` must NOT
   cancel the same `seq` in game `g2` (the `${gameId}:${seq}` key).
4. `ignores self-degommages and rows with a null actor or target`
5. `returns an empty map when there are no degommages`

**Verify**: `pnpm --filter @degommix/web exec vitest run src/lib/rivalries.test.ts`
→ exit 0, 22 tests (17 baseline + 5).

### Step 3: Circle-wide queries in `apps/web/src/lib/queries/rivalries.ts`

Import `aggregateTakenCounts` from `@/lib/rivalries`. Add a private helper
next to `finishedGameIdsFor` (note `selectDistinct`: several members share a
game and the id must not repeat):

```ts
/** Finished, started games where any of the given members held a seat. */
async function finishedGameIdsForMembers(memberIds: string[]): Promise<string[]> {
  if (memberIds.length === 0) return []
  const rows = await db
    .selectDistinct({ id: games.id })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted
      )
    )
  return rows.map((row) => row.id)
}
```

Then two exported functions (reuse the module's existing `inList`,
`loadRivalryEvents`, `loadUsernames`, `RivalryPeer`, `getCircleMemberIds`):

```ts
/**
 * Circle member who suffered the most non-undone degommages, all-time — the
 * taken-side twin of the « Fléau des Gaules » spotlight. A member can only be
 * dégommé in a game they sat in, so scanning the union of the circle's games
 * counts exactly each member's own suffered hits. Strangers met via code are
 * filtered out (SPECS.md §Amis: « Profil et stats visibles par les amis
 * uniquement »). Null when nobody in the circle was ever dégommé.
 */
export async function getSouffreDouleur(viewerId: string): Promise<RivalryPeer | null> {
  const memberIds = await getCircleMemberIds(viewerId)
  const gameIds = await finishedGameIdsForMembers(memberIds)
  const rows = await loadRivalryEvents(gameIds)
  const taken = aggregateTakenCounts(rows)

  const circle = new Set(memberIds)
  let bestId: string | null = null
  let bestTaken = 0
  for (const [userId, count] of taken) {
    if (!circle.has(userId) || count === 0) continue
    const beats =
      count > bestTaken ||
      (count === bestTaken && bestId !== null && userId.localeCompare(bestId) < 0)
    if (beats) {
      bestId = userId
      bestTaken = count
    }
  }
  if (bestId === null) return null

  const identity = (await loadUsernames([bestId])).get(bestId)
  return {
    userId: bestId,
    username: identity?.username ?? 'Inconnu',
    avatarId: identity?.avatarId ?? null,
    count: bestTaken,
  }
}

/**
 * Total non-undone degommages this player suffered over their finished games.
 * Goes through the same UNDO-cancellation path as the pair aggregation — a raw
 * SQL count over game_events would overcount undone hits.
 */
export async function getDegommagesTaken(userId: string): Promise<number> {
  const gameIds = await finishedGameIdsFor(userId)
  const rows = await loadRivalryEvents(gameIds)
  return aggregateTakenCounts(rows).get(userId) ?? 0
}
```

Aborted games are deliberately included, like everywhere on the dégommage side
(design doc line 318: « `dégommages` = somme des `DEGOMMAGE` non annulés,
**toutes parties finies confondues, abandons inclus** »).

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 4: Create the pure per-character builder `apps/web/src/lib/character-stats.ts`

This module must import nothing from `@/lib/db` (db-free test environment —
see conventions). Type-only imports allowed:

```ts
import type { CharacterId } from '@degommix/game-core'

/** One `(userId, character)` aggregate row from the stats query. */
export interface CharacterStatRow {
  userId: string
  character: CharacterId | null
  played: number
  villageGames: number
  wins: number
  /** Epoch seconds of the most recent game started with this character. */
  lastPlayed: number
}

/** One character's record for one player. */
export interface CharacterStat {
  character: CharacterId
  played: number
  villageGames: number
  wins: number
  /**
   * Percentage 0-100 over `villageGames` only (aborted games excluded from the
   * denominator, SPECS.md §Stats). Null when `villageGames` is 0 — the same
   * small-sample guard as `getPlayerStats` (friends.ts:237).
   */
  winrate: number | null
}

/**
 * Groups the aggregate rows per player, most-played character first (ties by
 * most recently played, then character id for a deterministic order). Rows
 * with a null character are skipped.
 */
export function buildPerCharacter(
  rows: readonly CharacterStatRow[]
): Map<string, CharacterStat[]> {
  const byUser = new Map<string, CharacterStat[]>()
  const lastPlayedByKey = new Map<string, number>()
  for (const row of rows) {
    if (row.character === null) continue
    const list = byUser.get(row.userId) ?? []
    list.push({
      character: row.character,
      played: row.played,
      villageGames: row.villageGames,
      wins: row.wins,
      winrate:
        row.villageGames > 0 ? Math.round((row.wins / row.villageGames) * 100) : null,
    })
    byUser.set(row.userId, list)
    lastPlayedByKey.set(`${row.userId}:${row.character}`, row.lastPlayed)
  }
  for (const [userId, list] of byUser) {
    list.sort(
      (a, b) =>
        b.played - a.played ||
        (lastPlayedByKey.get(`${userId}:${b.character}`) ?? 0) -
          (lastPlayedByKey.get(`${userId}:${a.character}`) ?? 0) ||
        a.character.localeCompare(b.character)
    )
  }
  return byUser
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 5: Unit-test the builder in `apps/web/src/lib/character-stats.test.ts`

Model on `apps/web/src/lib/rivalries.test.ts` (plain vitest
`describe`/`it`/`expect`, a small row factory, no db imports). Cases:

1. `groups rows per user and computes a rounded winrate` (e.g. 1 win / 3
   villageGames → 33)
2. `returns a null winrate when villageGames is 0` (the small-sample guard)
3. `sorts by played desc, then lastPlayed desc, then character asc`
4. `skips rows with a null character`
5. `keeps users independent` (two users' rows never mix)
6. `returns an empty map for no rows`

**Verify**: `pnpm --filter @degommix/web exec vitest run src/lib/character-stats.test.ts`
→ exit 0, 6 tests pass.

### Step 6: Wins per seat and `perCharacter` in `apps/web/src/lib/queries/stats.ts`

1. Import the builder:
   `import { buildPerCharacter, type CharacterStat } from '@/lib/character-stats'`.
2. Extract the inline characterRows query (stats.ts:211-221) into a module
   function next to `queryCircleStats`, adding the two aggregates (copy the
   `filter (where …)` shapes from `queryCircleStats`, stats.ts:135-136):

   ```ts
   function queryCharacterStats(memberIds: string[], range: LeaderboardRange = {}) {
     return db
       .select({
         userId: gamePlayers.userId,
         character: gamePlayers.character,
         played: sql`count(*)`.mapWith(Number),
         villageGames: sql`count(*) filter (where ${games.outcome} = 'village_reached')`.mapWith(
           Number
         ),
         wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(
           Number
         ),
         lastPlayed: sql`extract(epoch from max(${games.startedAt}))`.mapWith(Number),
       })
       .from(gamePlayers)
       .innerJoin(games, eq(games.id, gamePlayers.gameId))
       .where(and(circleFinishedStarted(memberIds, range), sql`${gamePlayers.character} is not null`))
       .groupBy(gamePlayers.userId, gamePlayers.character)
   }
   ```

   In `getLeaderboard`'s `Promise.all`, replace the inline query with
   `queryCharacterStats(memberIds, range)`. The favorites loop
   (stats.ts:266-281) reads the same `userId/character/played/lastPlayed`
   fields and stays untouched.
3. Add to `LeaderboardRow` (after `currentStreak`):

   ```ts
   /**
    * Per-character record, most played first. The server always sets it;
    * optional only so old PWA-cached wire payloads stay assignable (same
    * convention as `currentStreak`).
    */
   perCharacter?: CharacterStat[]
   ```

4. In `getLeaderboard`, after the favorites loop:
   `const perCharacterByUser = buildPerCharacter(characterRows)` and in the
   rows map add `perCharacter: perCharacterByUser.get(row.userId) ?? [],`.
   Note the leaderboard variant inherits `range` — in the month view (plan
   019) `perCharacter` is month-scoped like `favoriteCharacter`; intended.
5. Add the single-player accessor used by the profile pages (all-time):

   ```ts
   /** One player's all-time per-character record (profile pages). */
   export async function getPlayerCharacterStats(userId: string): Promise<CharacterStat[]> {
     const rows = await queryCharacterStats([userId])
     return buildPerCharacter(rows).get(userId) ?? []
   }
   ```

6. Do NOT touch `compareStandings`, `queryCircleStats`, the streak query, or
   the `characterWinrates` build.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.
**Verify**: `pnpm --filter @degommix/web test` → all pass (326 tests).

### Step 7: Extend the wire schema in `apps/web/src/lib/api-payloads.ts`

Above `leaderboardPayloadSchema`, next to `rivalryPeerSchema`:

```ts
const characterStatSchema = z.object({
  character: characterSchema,
  played: z.number(),
  villageGames: z.number(),
  wins: z.number(),
  winrate: z.number().nullable(),
})
```

Inside the `rows` object, after `currentStreak`:

```ts
      /** Optional for old PWA-cached SSR payloads (same convention as currentStreak). */
      perCharacter: z.array(characterStatSchema).optional(),
```

At the top level, after the `rivalry` field:

```ts
  /** Optional for old PWA-cached SSR payloads (same convention as currentStreak). */
  souffreDouleur: rivalryPeerSchema.nullable().optional(),
```

No serializer change: neither field contains a `Date`, so SSR seed and JSON
stay byte-identical.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0, and
`pnpm --filter @degommix/web exec vitest run src/lib/api-payloads.test.ts` → passes.

### Step 8: Produce `souffreDouleur` on both Classement feeds

The SSR page and the JSON route must send the same object (byte-identity
contract, `api-payloads.ts:6-12`).

`apps/web/src/app/(tabs)/classement/page.tsx`:

```ts
import { getRivalrySpotlight, getSouffreDouleur } from '@/lib/queries/rivalries'
...
  const [leaderboard, rivalry, souffreDouleur] = await Promise.all([
    getLeaderboard(user.id),
    getRivalrySpotlight(user.id),
    getSouffreDouleur(user.id),
  ])

  return (
    <LeaderboardScreen viewerId={user.id} initialData={{ ...leaderboard, rivalry, souffreDouleur }} />
  )
```

`apps/web/src/app/api/leaderboard/route.ts` — same third call, same spread
(keep the 401 guard, `PRIVATE_HEADERS`, and the `period` handling exactly as
they are; `getSouffreDouleur` is all-time in both period views, like
`getRivalrySpotlight`):

```ts
  const [leaderboard, rivalry, souffreDouleur] = await Promise.all([
    getLeaderboard(session.user.id, { from }),
    getRivalrySpotlight(session.user.id),
    getSouffreDouleur(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry, souffreDouleur }
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 9: « Souffre-douleur du village » tile on the Classement

Create `apps/web/src/components/stats/souffre-douleur-tile.tsx`, modeled on
`top-degommeur-tile.tsx` (plain server-compatible component, no `'use client'`;
no `.lb-fleau`/`.lb-rays` — the bronze ceremony stays unique to the Fléau):

```tsx
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { RivalryPeer } from '@/lib/queries/rivalries'

interface SouffreDouleurTileProps {
  peer: RivalryPeer | null
}

/** « 1 dégommage subi » / « 4 dégommages subis » (same rule as rivalry-tile). */
function sufferedLabel(count: number): string {
  const s = count > 1 ? 's' : ''
  return `${count} dégommage${s} subi${s}`
}

/** Taken-side twin of the « Fléau des Gaules »: who gets hit the most. */
export function SouffreDouleurTile({ peer }: SouffreDouleurTileProps) {
  if (peer === null) return null
  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Souffre-douleur du village</p>
      <div className="flex items-center gap-3">
        <PlayerAvatar username={peer.username} size={40} avatarId={peer.avatarId ?? null} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold">{peer.username}</p>
          <p className="m-0 text-xs text-ink-soft">{sufferedLabel(peer.count)}</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold text-bronze">
          <Icon name="pawn" size={18} />
          {peer.count}
        </span>
      </div>
    </Card>
  )
}
```

Wire it in `apps/web/src/components/stats/leaderboard-screen.tsx`: import
`SouffreDouleurTile` and render, directly after the `TopDegommeurTile` line
(line 58) and before `<RivalryTile …>`:

```tsx
      <SouffreDouleurTile peer={leaderboard.souffreDouleur ?? null} />
```

The `?? null` guards the `.optional()` wire field. Leave the
`friendCount === 0` branch and everything else untouched.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 10: Per-character block on `/profil` and the friend profile, subis tile

Create `apps/web/src/components/stats/per-character-block.tsx`:

```tsx
import { CharacterWinrateBars } from './character-winrate-bars'
import type { CharacterStat } from '@/lib/character-stats'

interface PerCharacterBlockProps {
  perCharacter: CharacterStat[]
}

/**
 * One player's winrate per character, rendered with the classement's bars.
 * Characters without a village_reached game are hidden (`winrate === null`,
 * the small-sample guard of buildPerCharacter).
 */
export function PerCharacterBlock({ perCharacter }: PerCharacterBlockProps) {
  const winrates = perCharacter.flatMap((stat) =>
    stat.winrate === null
      ? []
      : [{ character: stat.character, winrate: stat.winrate, games: stat.villageGames }]
  )

  if (winrates.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="sec-label">Victoires par personnage</p>
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Les winrates par personnage apparaîtront après les premières parties menées au village.
        </p>
      </div>
    )
  }
  return <CharacterWinrateBars winrates={winrates} />
}
```

(`CharacterWinrateBars` accepts exactly `{ character, winrate, games }[]` —
`apps/web/src/components/stats/character-winrate-bars.tsx:6-11` — and brings
its own « Victoires par personnage » label; do not modify it.)

Edit `apps/web/src/app/(tabs)/profil/page.tsx` — the page's first stats block:

1. Imports: `import { getPlayerCharacterStats } from '@/lib/queries/stats'`
   and `import { PerCharacterBlock } from '@/components/stats/per-character-block'`.
2. Fetch in parallel with the existing avatar query (replace line 18):

   ```ts
   const [avatarId, perCharacter] = await Promise.all([
     getAvatarId(session.user.id),
     getPlayerCharacterStats(session.user.id),
   ])
   ```

3. Render `<PerCharacterBlock perCharacter={perCharacter} />` directly after
   `</header>` (line 41), before the « Pseudo » section.

Edit `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`:

1. Imports: `getDegommagesTaken` from `@/lib/queries/rivalries` (extend the
   existing import), `getPlayerCharacterStats` from `@/lib/queries/stats`,
   `PerCharacterBlock` from `@/components/stats/per-character-block`.
2. Extend the existing `Promise.all` (lines 44–48) — both fetches run for self
   and friend views (the friends-only guard above already gates access; do not
   move or weaken it):

   ```ts
   const [stats, headToHead, sharedResult, taken, perCharacter] = await Promise.all([
     getPlayerStats(userId),
     isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
     isSelf ? Promise.resolve(null) : getSharedGames(me.id, userId),
     getDegommagesTaken(userId),
     getPlayerCharacterStats(userId),
   ])
   ```

3. Add a fourth tile inside the existing `<div className="stat-row">`
   (lines 71–75), after the « Dégommages » tile:

   ```tsx
   <StatTile icon="pawn" label="Subis" value={taken} />
   ```

   (`pawn` is in the closed `IconName` union; label « Subis » keeps the
   uppercase `.stat-lbl` short enough for four tiles in the flex row — the
   full phrase « Dégommages subis » would not fit.)
4. Render `<PerCharacterBlock perCharacter={perCharacter} />` directly after
   the fetish-character `</section>` (line 101), before the
   `{isSelf ? null : (…Vos parties ensemble…)}` block.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.
**Verify**: `pnpm --filter @degommix/web exec eslint src` → exit 0.

### Step 11: Full verification pass

From the repo root, in order:

1. `pnpm typecheck` → exit 0.
2. `pnpm lint` → exit 0.
3. `pnpm --filter @degommix/web test` → all pass; **28 test files / 326 tests**
   (baseline 27/315 + 5 in rivalries.test.ts + 6 in character-stats.test.ts).
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0 (skip with a note in
   your report if Docker is unavailable).
5. `pnpm test:e2e` → all pass; the `ranking-row-*` assertions of
   `happy-path.spec.ts:134-136` are unaffected by the new tiles.
6. `git status --porcelain` → only in-scope files.

## Test plan

- `apps/web/src/lib/rivalries.test.ts` (+5 cases, Step 2): per-target counts
  across games; UNDO exclusion; UNDO exclusion scoped per game; self/null rows
  ignored; empty input. Reuse that file's existing row factory.
- `apps/web/src/lib/character-stats.test.ts` (new, 6 cases, Step 5): grouping
  + rounding; null-winrate small-sample guard; sort order with tie-breaks;
  null character skipped; user independence; empty input. Model structure on
  `apps/web/src/lib/rivalries.test.ts`.
- No DB-backed unit test is added, on purpose: `apps/web` has no DB test
  harness (its vitest env has no database and no env vars — plan 003
  documents this), which is exactly why the risky logic (UNDO cancellation,
  winrate guard/ordering) lives in pure, fully tested modules while the query
  wrappers stay thin, typechecked shells.
- Optional manual cross-check against a populated dev DB: for any user, the
  sum over opponents of `aggregatePairCounts(...).taken` (already rendered on
  head-to-head cards) must equal `getDegommagesTaken(userId)` — both flow
  through `undoneKeys`, so a mismatch means a wiring bug.
- Verification: `pnpm --filter @degommix/web test` → 326 tests pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 with 326 tests (11 new)
- [ ] `grep -n "aggregateTakenCounts" apps/web/src/lib/rivalries.ts apps/web/src/lib/queries/rivalries.ts` → at least one match in each file
- [ ] `grep -cn "count(" apps/web/src/lib/queries/rivalries.ts` returns `0` —
      no SQL aggregate was added to the rivalry query layer (the UNDO-aware
      pure path is the only counter)
- [ ] `grep -n "souffreDouleur" apps/web/src/lib/api-payloads.ts apps/web/src/app/api/leaderboard/route.ts "apps/web/src/app/(tabs)/classement/page.tsx" apps/web/src/components/stats/leaderboard-screen.tsx` → at least one match in each of the four files
- [ ] `grep -n "Souffre-douleur du village" apps/web/src/components/stats/souffre-douleur-tile.tsx` → 1 match
- [ ] `grep -n "perCharacter" apps/web/src/lib/queries/stats.ts apps/web/src/lib/api-payloads.ts` → at least one match in each
- [ ] `grep -n "getPlayerCharacterStats" "apps/web/src/app/(tabs)/profil/page.tsx" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"` → at least one match in each
- [ ] `grep -n 'label="Subis"' "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"` → 1 match
- [ ] The friends-only guard in `amis/[userId]/page.tsx` (the `areFriends`
      call and the « Profil réservé aux amis » branch, lines 28–42) is
      unchanged (`git diff` shows no hunk touching it)
- [ ] `git status --porcelain` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated (unless the dispatching reviewer
      owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `596863e`) — in particular if `undoneKeys`/`aggregatePairCounts` changed
  shape in `apps/web/src/lib/rivalries.ts`, or `characterRows` in
  `getLeaderboard` already selects a wins aggregate.
- **Performance / index**: `getSouffreDouleur` scans the DEGOMMAGE/UNDO rows
  of every finished circle game — a superset of what `getRivalrySpotlight`
  already loads per request, with no time window. If this appears materially
  heavier in your environment (slow `/classement` or `/api/leaderboard`,
  sequential scans on `game_events`), check that the `game_id IN (...)`
  predicate of `loadRivalryEvents` is served by the existing
  `game_events_game_seq` btree index on `(game_id, seq)`
  (`packages/db/drizzle/0000_fixed_monster_badoon.sql:136`,
  `packages/db/src/schema/games.ts:95`) — e.g. `EXPLAIN` the query against
  your dev DB. If you conclude a new index (on `target_id`, `type`, or
  anything else) or any migration is needed, **STOP and report** — do NOT add
  one; `packages/db` is out of scope.
- You find yourself writing a SQL `count(*)` (or any SQL aggregate) over
  `game_events` to produce a `taken` number — that violates the
  UNDO-cancellation constraint; report instead.
- `db.selectDistinct` does not exist on the Drizzle instance after one check
  against current drizzle-orm docs — report rather than deduplicating with a
  raw SQL `distinct`.
- Adding the payload fields appears to require touching
  `apps/web/src/hooks/use-tab-data.ts` or the websocket invalidation code —
  it must not (invalidation is prefix-matched); report instead of widening
  scope.
- A step's verification fails twice after a reasonable fix attempt.
- Baseline typecheck/lint/test commands fail BEFORE your first edit.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Concurrent plans**: plans 021, 026 and 027 also touch
  `apps/web/src/lib/api-payloads.ts`, `/api/leaderboard/route.ts` and the
  classement components. Whichever plan lands second rebases on the first —
  the merge is textual (adjacent fields/tiles), but the payload byte-identity
  invariant must be re-verified after every rebase (SSR page and route must
  produce identical objects).
- **Reviewer focus**: (1) every `taken` number flows through
  `loadRivalryEvents` + `aggregateTakenCounts` — no SQL count over
  `game_events` anywhere; (2) `souffreDouleur` is produced by **both** the SSR
  page and the route, and `getSouffreDouleur` filters through
  `getCircleMemberIds`, so a stranger who joined by code is never named;
  (3) per-character winrate uses `villageGames` as denominator with the null
  guard — never `played`; (4) the friends-only guard on the profile page was
  not touched.
- **Three event scans per `/api/leaderboard` request** now
  (`getRivalrySpotlight`, `getSouffreDouleur`, plus the leaderboard
  aggregates). `getSouffreDouleur`'s circle-wide load is a superset of the
  spotlight's viewer-only load; if this ever matters, compute both from one
  `loadRivalryEvents(circleGameIds)` pass — deliberately deferred to keep the
  two functions independent at friends-circle volume.
- **`perCharacter` on the leaderboard rows is data-complete but not yet
  rendered on the Classement** — the profile pages read the same shape via
  `getPlayerCharacterStats`. A future per-player drill-down on the classement
  can consume it without a payload change; if it never does, the field can be
  dropped from `LeaderboardRow` (keep `getPlayerCharacterStats`).
- **Follow-up deliberately deferred**: deriving `favoriteCharacter` from
  `perCharacter[0]` (the ordering matches the favorites loop) would delete
  ~15 lines in `stats.ts` — safe but out of scope here to keep the diff
  reviewable.
- The two `.optional()` wire fields can be tightened to required once every
  deployed PWA shell predates this feature by a few weeks (same lifecycle as
  `currentStreak` / `lastSeenAt`).
