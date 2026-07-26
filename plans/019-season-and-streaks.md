# Plan 019: Give the leaderboard a time dimension — month-to-date season window and win-streak chips

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8890290..HEAD -- apps/web/src/lib/queries/stats.ts apps/web/src/lib/api-payloads.ts "apps/web/src/app/api/leaderboard/route.ts" apps/web/src/hooks/use-tab-data.ts apps/web/src/lib/query-keys.ts apps/web/src/components/stats/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8890290`, 2026-07-26

## Decision points — resolved by the owner, do NOT revisit

These four decisions are settled. The executor implements them as written:

1. **Season window = current calendar month, month-to-date, Europe/Paris.**
   A game belongs to the month in which it *ended* (`games.ended_at`). There
   is **no** seasons history, no archives, no rewards, no notifications — the
   month view is simply "the same leaderboard, counting only games with
   `ended_at >= start of the current Paris month`". Europe/Paris is already
   the app's display timezone (see `apps/web/src/components/stats/format.ts`,
   excerpt below).
2. **Aborted games are neutral for streaks.** SPECS.md line 126 says:
   « **Parties abandonnées** : les dégommages comptent, mais la partie est
   **exclue du dénominateur du winrate**. » The same neutrality applies to
   streaks: an aborted game neither extends nor breaks a win streak — it is
   simply skipped. A streak is the run of consecutive `village_reached` wins,
   walking finished games newest-first by `ended_at`, broken by the first
   `village_reached` loss. It does NOT silently break on an aborted game.
3. **The streak is now-anchored and all-time.** "Current streak" is a
   property of the player *now*; it is computed over all finished games and
   rendered identically in both period views. It is never windowed to the
   month (a streak crossing the month boundary must not reset).
4. **Query-key approach: one root, period appended.**
   `queryKeys.leaderboard` stays `['leaderboard']` and becomes the
   *invalidation root*; the data hook uses `['leaderboard', period]`. TanStack
   Query's `invalidateQueries` does prefix (fuzzy) matching by default, so the
   existing `invalidate('leaderboard')` calls invalidate **both** period
   variants with zero changes to `useInvalidateTabData` or to any websocket
   bridge. This was chosen over two separate named keys because it keeps the
   `TabDataKey` union and every existing `invalidate(...)` call site untouched.

## Why this matters

The Classement screen is all-time only: whoever grinds the most games in the
first weeks owns the podium forever, and a newcomer to the friends circle can
never reach it. A « Ce mois-ci » window resets the race every calendar month
without destroying the all-time record, and a visible win-streak chip
(« Série : 3 ») gives the current hot player bragging rights between game
nights. Both are pure read-model features: no schema migration, no ws-server
change, default behavior (all-time) byte-identical to today.

## Current state

All excerpts verified at commit `8890290`.

### Files and their roles

- `apps/web/src/lib/queries/stats.ts` — `getLeaderboard(userId)` builds the
  friends-circle leaderboard; **no date predicate anywhere** (all-time only).
- `packages/db/src/schema/games.ts` — `games` table has
  `startedAt: timestamp('started_at', { withTimezone: true })` (line 48) and
  `endedAt: timestamp('ended_at', { withTimezone: true })` (line 49). No
  schema change needed.
- `apps/web/src/app/api/leaderboard/route.ts` — JSON twin of the Classement
  server component; takes no request parameters today.
- `apps/web/src/app/(tabs)/classement/page.tsx` — SSR page; passes
  `initialData={{ ...leaderboard, rivalry }}` to `LeaderboardScreen`.
- `apps/web/src/components/stats/leaderboard-screen.tsx` — client shell; has
  **no period control**.
- `apps/web/src/components/stats/podium.tsx` — top-3 podium (just redesigned);
  renders a `.lb-chips` row of `.lb-chip` spans per player.
- `apps/web/src/components/stats/ranking-table.tsx` — rows for ranks 4+.
- `apps/web/src/components/lobby/format-segmented.tsx` — the arcade
  `.segmented`/`.segment` control pattern to copy.
- `apps/web/src/hooks/use-tab-data.ts` — TanStack tab-cache hooks; the
  SSR-seeding convention (`initialDataUpdatedAt: 0`) lives here.
- `apps/web/src/lib/query-keys.ts` — one key per screen payload.
- `apps/web/src/lib/api-payloads.ts` — zod wire schemas; its header comment is
  the payload contract this plan must honor.
- `apps/web/src/lib/queries/game-filters.ts` — `gameStarted` predicate
  (excludes phantom never-started lobbies).

### stats.ts — the aggregate predicate and sort (no date window)

`apps/web/src/lib/queries/stats.ts:72-99` (abridged):

```ts
export async function getLeaderboard(userId: string): Promise<Leaderboard> {
  const memberIds = await getCircleMemberIds(userId)

  const finishedStarted = and(
    inList(gamePlayers.userId, memberIds),
    eq(games.status, 'finished'),
    gameStarted,
    sql`${gamePlayers.status} in ('joined', 'left')`
  )

  const [members, statRows, characterRows, seatRows] = await Promise.all([
    // members: user rows for memberIds
    // statRows: wins / villageGames / degommages grouped by userId, where(finishedStarted)
    // characterRows: per-(user, character) counts, where(and(finishedStarted, character not null))
    // seatRows: per-character wins/games, where(inList(...), status='finished',
    //           outcome='village_reached', gameStarted, player status in ('joined','left'), character not null)
```

Sort at `stats.ts:169-176`:

```ts
  unranked.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winrate - a.winrate ||
      b.degommages - a.degommages ||
      a.username.localeCompare(b.username, 'fr')
  )
  const rows: LeaderboardRow[] = unranked.map((row, index) => ({ ...row, rank: index + 1 }))
```

`LeaderboardRow` at `stats.ts:18-29` has `rank, userId, username, avatarId?,
wins, winrate, villageGames, degommages, favoriteCharacter` — no streak field.

Note: `unranked` (`stats.ts:153-167`) maps **all** circle members, so members
with zero games in the window still appear with zeros — the month view never
needs a new empty state (`friendCount` comes from `memberIds.length - 1` and is
structural, not windowed).

### Payload contract (must keep SSR seed and JSON byte-identical)

`apps/web/src/lib/api-payloads.ts:5-11`:

```ts
/**
 * Wire shapes of the tab data endpoints (`/api/home`, `/api/invites`,
 * `/api/friends`, `/api/leaderboard`). They mirror the server query return
 * types with every `Date` flattened to an ISO string, so the JSON a client
 * query receives is byte-identical to the `initialData` the server component
 * seeds it with.
 */
```

The SSR page only ever seeds the **all-time** variant, so the invariant binds
`page.tsx`'s `getLeaderboard(user.id)` to the route's default-period response —
both must call `getLeaderboard` with no window. The existing convention for
fields added after launch is `.optional()` "for old caches" (see
`friendsPayloadSchema`, line 89: `lastSeenAt: z.string().nullable().optional()`)
because a PWA-precached SSR page can replay an old-shaped `initialData` into new
JS. Follow it for the new field.

`leaderboardPayloadSchema` rows (`api-payloads.ts:102-115`) mirror
`LeaderboardRow` exactly (with `avatarId: z.string().nullable().optional()`).

### Tab-cache hook and invalidation

`apps/web/src/hooks/use-tab-data.ts:25` and `:74-83`:

```ts
const STALE_INITIAL_DATA = { initialDataUpdatedAt: 0 } as const
...
export function useLeaderboardData(
  initialData: LeaderboardPayload
): DefinedUseQueryResult<LeaderboardPayload, Error> {
  return useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: () => fetchPayload('/api/leaderboard', leaderboardPayloadSchema),
    initialData,
    ...STALE_INITIAL_DATA,
  })
}
```

`apps/web/src/lib/query-keys.ts:14`: `leaderboard: ['leaderboard'] as const,`

Invalidation call sites (all go through `useInvalidateTabData`, which calls
`queryClient.invalidateQueries({ queryKey: queryKeys[key] })` — prefix match):

- `apps/web/src/components/stats-events-bridge.tsx:23` — `invalidate('home', 'leaderboard')` on `stats:invalidate`
- `apps/web/src/components/live/live-screen.tsx:81` — `invalidate('home', 'leaderboard', 'invites')`
- `apps/web/src/components/friends/friends-screen.tsx:50,85` — `invalidate('friends', 'leaderboard')`

None of these change.

### Endpoint (no params today)

`apps/web/src/app/api/leaderboard/route.ts:15-27`:

```ts
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const [leaderboard, rivalry] = await Promise.all([
    getLeaderboard(session.user.id),
    getRivalrySpotlight(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
```

Query-param exemplar in this repo: `apps/web/src/app/api/friends/search/route.ts:23-31`
(`GET(request: Request)`, `new URL(request.url).searchParams`, zod `safeParse`).

### Segmented control pattern to copy

`apps/web/src/components/lobby/format-segmented.tsx:22-44` renders
`<div className="segmented" role="radiogroup" aria-label="...">` with
`<button type="button" role="radio" aria-checked={selected} className="segment">`
children. CSS lives in `apps/web/src/app/globals.css` (`.segmented` at line
~270, `.segment` at ~276; `.segment.num` is the mono numeric variant — do NOT
use `num` for text labels). No new CSS is needed.

### Chip styling that already exists

`apps/web/src/app/globals.css:1476-1492` defines `.lb-chips` (flex-wrap chip
row) and `.lb-chip` (pill, mono, 0.62rem, nowrap). `podium.tsx:85-93` renders
four `.lb-chip` spans inside `<span className="lb-chips" aria-hidden>`.

### Timezone convention

`apps/web/src/components/stats/format.ts:24-30` — every date formatter pins
`timeZone: 'Europe/Paris'`:

```ts
const dayTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})
```

### E2E contract that must keep passing

`e2e/happy-path.spec.ts:134-136`:

```ts
await p1.goto('/classement')
await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
await expect(p1.getByTestId(`ranking-row-${J1.username}`)).toContainText('0 v')
```

The podium keeps this via a `sr-only` span (`podium.tsx:84`); do not remove it.
The default period stays all-time, so this spec is unaffected.

### Other conventions

- French UI text, English code/comments. Existing UI strings use plain spaces
  around the colon (« Série : 3 » style is consistent with e.g. `format.ts`
  prose helpers).
- Rivalry spotlight (`getRivalrySpotlight`) is a separate query and stays
  all-time in both views — windowing it is out of scope.
- `favoriteCharacter`, `topDegommeur` and `characterWinrates` all derive from
  the windowed queries inside `getLeaderboard`, so in the month view they
  naturally become month-scoped. That is intended.
- zod is v4 (`apps/web/package.json`: `"zod": "^4.4.3"`).
- Unit tests are vitest, co-located (`src/lib/chrono.test.ts`,
  `src/lib/queries/game-filters.test.ts` are exemplars). Baseline at `8890290`:
  **23 files / 283 tests, all passing**.

## Commands you will need

All verified passing at commit `8890290` (from the repo root):

| Purpose        | Command                                             | Expected on success            |
|----------------|-----------------------------------------------------|--------------------------------|
| Install        | `pnpm install`                                      | exit 0                         |
| Typecheck      | `pnpm --filter @degommix/web typecheck`             | exit 0, no output after `tsc`  |
| Unit tests     | `pnpm --filter @degommix/web test`                  | all pass (baseline 283 tests)  |
| One test file  | `pnpm --filter @degommix/web test -- src/lib/season.test.ts` | that file passes      |
| Lint           | `pnpm --filter @degommix/web lint`                  | exit 0                         |

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/lib/season.ts` (create)
- `apps/web/src/lib/season.test.ts` (create)
- `apps/web/src/lib/queries/streaks.ts` (create)
- `apps/web/src/lib/queries/streaks.test.ts` (create)
- `apps/web/src/lib/queries/stats.ts`
- `apps/web/src/lib/api-payloads.ts`
- `apps/web/src/app/api/leaderboard/route.ts`
- `apps/web/src/hooks/use-tab-data.ts`
- `apps/web/src/lib/query-keys.ts` (doc comment only)
- `apps/web/src/components/stats/period-segmented.tsx` (create)
- `apps/web/src/components/stats/leaderboard-screen.tsx`
- `apps/web/src/components/stats/podium.tsx`
- `apps/web/src/components/stats/ranking-table.tsx`

**Out of scope** (do NOT touch, even though they look related):

- `packages/db/**` — no schema change, no migration, no new index. The window
  predicate rides on the existing `ended_at` column.
- `apps/web/src/app/(tabs)/classement/page.tsx` — unchanged: it still calls
  `getLeaderboard(user.id)` with no window (the all-time SSR seed).
- `apps/web/src/lib/queries/rivalries.ts` and `rivalry-tile.tsx` — rivalry
  stays all-time.
- `apps/web/src/components/stats-events-bridge.tsx`,
  `live/live-screen.tsx`, `friends/friends-screen.tsx` — invalidation call
  sites need no change (prefix matching, see Decision 4).
- `apps/web/src/app/globals.css` — reuse `.segmented`, `.segment`, `.lb-chip`;
  no new CSS.
- `apps/ws-server/**`, `e2e/**`, `SPECS.md`, any seasons-archive/rewards/
  notifications work (explicitly rejected by the owner).

## Git workflow

- Branch off the current branch's base: `git checkout -b feat/019-season-and-streaks`
  (repo convention is `type/short-description`, e.g. existing
  `fix/post-playtest-round-1`).
- Conventional commits, `feat(web): ...` style — exemplar from `git log`:
  `feat(web): invalidate home and leaderboard caches when a game finishes`.
  One commit per step or logical unit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the Paris month-start helper

Create `apps/web/src/lib/season.ts`:

```ts
/**
 * Month-to-date « saison » window of the Classement (design decision,
 * plan 019): a game counts for the calendar month — Europe/Paris, the app's
 * display timezone (see components/stats/format.ts) — in which it ended.
 * No archives: the only window ever computed is the current month's start.
 */

const PARIS_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  timeZoneName: 'longOffset',
})

interface ParisStamp {
  year: number
  month: number
  /** e.g. "+01:00" (CET) or "+02:00" (CEST). */
  offset: string
}

function parisStamp(at: Date): ParisStamp {
  const parts = PARIS_PARTS.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  const rawOffset = get('timeZoneName').replace('GMT', '')
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    offset: rawOffset === '' ? '+00:00' : rawOffset,
  }
}

/**
 * Exact UTC instant of 00:00 on the 1st of the current month, Paris time.
 * Two passes because the offset at `now` can differ from the offset at the
 * month boundary when a DST switch happened mid-month (late March / late
 * October); the second pass re-reads the offset at the candidate instant.
 */
export function startOfCurrentMonthParis(now: Date = new Date()): Date {
  const first = parisStamp(now)
  const isoDay = `${first.year}-${String(first.month).padStart(2, '0')}-01T00:00:00`
  const candidate = new Date(`${isoDay}${first.offset}`)
  const second = parisStamp(candidate)
  return new Date(`${isoDay}${second.offset}`)
}
```

Create `apps/web/src/lib/season.test.ts` (model the file structure on
`apps/web/src/lib/chrono.test.ts` — plain `describe`/`it`/`expect` from
vitest, no fake timers needed since `now` is injected):

Cases (assert with `expect(startOfCurrentMonthParis(input).toISOString()).toBe(expected)`):

1. Summer month (CEST): `new Date('2026-07-15T10:00:00Z')` →
   `'2026-06-30T22:00:00.000Z'` (July 1, 00:00 Paris +02:00).
2. Winter month (CET): `new Date('2026-01-20T10:00:00Z')` →
   `'2025-12-31T23:00:00.000Z'` (year rollover).
3. DST spring gap — after the last-Sunday-of-March switch, month started in
   CET: `new Date('2026-03-30T10:00:00Z')` → `'2026-02-28T23:00:00.000Z'`
   (March 1, 00:00 Paris +01:00; this is the case the second pass fixes).
4. DST autumn gap: `new Date('2026-10-27T10:00:00Z')` →
   `'2026-09-30T22:00:00.000Z'` (October 1, 00:00 Paris +02:00).
5. Exact boundary: `new Date('2026-06-30T22:00:00Z')` (= July 1, 00:00 Paris)
   → `'2026-06-30T22:00:00.000Z'` (an instant at the boundary belongs to the
   new month).

**Verify**: `pnpm --filter @degommix/web test -- src/lib/season.test.ts` → 5 tests pass.

### Step 2: Create the pure streak computation

Create `apps/web/src/lib/queries/streaks.ts`:

```ts
export interface StreakGameResult {
  userId: string
  won: boolean
}

/**
 * Current win streak per player from finished `village_reached` games ordered
 * newest first. Aborted games never reach this function (the caller filters
 * on outcome, mirroring design §5.3 where aborted games are excluded from the
 * winrate denominator) — so an aborted game neither extends nor breaks a
 * streak. A streak is broken by the first village_reached loss.
 */
export function computeCurrentStreaks(
  resultsNewestFirst: StreakGameResult[]
): Map<string, number> {
  const streaks = new Map<string, number>()
  const broken = new Set<string>()
  for (const result of resultsNewestFirst) {
    if (broken.has(result.userId)) continue
    if (result.won) {
      streaks.set(result.userId, (streaks.get(result.userId) ?? 0) + 1)
    } else {
      broken.add(result.userId)
    }
  }
  return streaks
}
```

Create `apps/web/src/lib/queries/streaks.test.ts` (model on
`apps/web/src/lib/queries/game-filters.test.ts`). Cases:

1. Empty input → empty map.
2. Single win → streak 1.
3. `[win, win, loss, win]` (newest first) → streak 2 (loss stops the walk;
   the older win is ignored).
4. Newest game is a loss → streak absent from map (UI reads it as 0).
5. Two interleaved users: `[{A,won},{B,lost},{A,won},{B,won}]` → A: 2, B: 0/absent
   (B's newest is a loss, its older win never counts).
6. All losses for a user → absent from map.

**Verify**: `pnpm --filter @degommix/web test -- src/lib/queries/streaks.test.ts` → 6 tests pass.

### Step 3: Parameterize `getLeaderboard` with a window and add `currentStreak`

Edit `apps/web/src/lib/queries/stats.ts` only (callers keep compiling — the
new parameter is optional):

1. Import the streak helper:
   `import { computeCurrentStreaks } from './streaks'`.
2. Add to `LeaderboardRow` (after `degommages`):

   ```ts
   /**
    * Consecutive village_reached wins, newest first by endedAt; aborted games
    * are neutral (design §5.3). Always all-time — never windowed.
    */
   currentStreak: number
   ```

3. Change the signature and predicate:

   ```ts
   export interface LeaderboardRange {
     /** Count only games with `ended_at >= from`. Omit for all-time. */
     from?: Date
   }

   export async function getLeaderboard(
     userId: string,
     range: LeaderboardRange = {}
   ): Promise<Leaderboard> {
     const memberIds = await getCircleMemberIds(userId)

     const endedInWindow =
       range.from === undefined ? [] : [sql`${games.endedAt} >= ${range.from}`]

     const finishedStarted = and(
       inList(gamePlayers.userId, memberIds),
       eq(games.status, 'finished'),
       gameStarted,
       sql`${gamePlayers.status} in ('joined', 'left')`,
       ...endedInWindow
     )
   ```

4. `seatRows` builds its own `where(and(...))` (stats.ts:121-130) instead of
   reusing `finishedStarted` — spread `...endedInWindow` into that `and(...)`
   too. (`statRows` and `characterRows` inherit the window through
   `finishedStarted`; that is correct — favorite character and character
   winrates become month-scoped in the month view by design.)
5. Add a **fifth** query to the `Promise.all` — deliberately WITHOUT
   `endedInWindow` (Decision 3, streak is all-time):

   ```ts
   db
     .select({
       userId: gamePlayers.userId,
       won: sql`${games.winnerId} = ${gamePlayers.userId}`.mapWith(Boolean),
     })
     .from(gamePlayers)
     .innerJoin(games, eq(games.id, gamePlayers.gameId))
     .where(
       and(
         inList(gamePlayers.userId, memberIds),
         eq(games.status, 'finished'),
         eq(games.outcome, 'village_reached'),
         gameStarted,
         sql`${gamePlayers.status} in ('joined', 'left')`
       )
     )
     .orderBy(sql`${games.endedAt} desc`),
   ```

   Destructure it as `streakRows` in the `Promise.all` result.
6. After the favorites loop: `const streaks = computeCurrentStreaks(streakRows)`
   and in the `unranked` map add `currentStreak: streaks.get(member.id) ?? 0,`.
7. Do NOT touch the sort (stats.ts:169-176) — streak is display-only, never a
   tiebreaker.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web test` → all pass (baseline count + 11).

### Step 4: Extend the wire schema

Edit `apps/web/src/lib/api-payloads.ts` — inside `leaderboardPayloadSchema`'s
`rows` object, after `degommages: z.number(),` add:

```ts
/** Optional for old PWA-cached SSR payloads (same convention as lastSeenAt). */
currentStreak: z.number().optional(),
```

Nothing else changes: `LeaderboardRow` from the server includes the field, so
the SSR seed and the JSON stay byte-identical for the default period.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web test -- src/lib/api-payloads.test.ts` → passes.

### Step 5: Accept `?period=` on the endpoint

Edit `apps/web/src/app/api/leaderboard/route.ts`, following the
`friends/search/route.ts` query-param pattern:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getLeaderboard } from '@/lib/queries/stats'
import { getRivalrySpotlight } from '@/lib/queries/rivalries'
import { startOfCurrentMonthParis } from '@/lib/season'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

const querySchema = z.object({ period: z.enum(['all', 'month']).default('all') })

export async function GET(request: Request) {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ period: searchParams.get('period') ?? undefined })
  const period = parsed.success ? parsed.data.period : 'all'
  const from = period === 'month' ? startOfCurrentMonthParis() : undefined

  const [leaderboard, rivalry] = await Promise.all([
    getLeaderboard(session.user.id, { from }),
    getRivalrySpotlight(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
```

Keep (adapt) the existing doc comment about the session gate and circle
scoping; add one line noting `period=month` windows on Paris month start and
an invalid `period` falls back to all-time. Note `getLeaderboard(session.user.id,
{ from: undefined })` for `period=all` is identical to today's call — the SSR
byte-identity invariant holds.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 6: Period-aware query key and hook

Edit `apps/web/src/lib/query-keys.ts` — comment only, on the `leaderboard`
entry:

```ts
/**
 * GET /api/leaderboard — friends-circle ranking and character winrates.
 * Invalidation root: `useLeaderboardData` appends the period ('all' |
 * 'month'); `invalidateQueries` prefix-matches both variants.
 */
leaderboard: ['leaderboard'] as const,
```

Edit `apps/web/src/hooks/use-tab-data.ts`:

1. Extend the react-query import:
   `import { keepPreviousData, useQuery, useQueryClient, type DefinedUseQueryResult, type UseQueryResult } from '@tanstack/react-query'`
2. Replace `useLeaderboardData`:

```ts
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
```

`TabDataKey` and `useInvalidateTabData` stay untouched (Decision 4). The other
three hooks keep `DefinedUseQueryResult`.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0. (The screen still
compiles because `useQuery(...).data` is now `LeaderboardPayload | undefined`
only at the *type* level once the screen is updated in Step 7 — if typecheck
fails here with "possibly undefined" errors in `leaderboard-screen.tsx`, do
Step 7's screen edit in the same commit and re-run.)

### Step 7: Period toggle and streak chips in the UI

Create `apps/web/src/components/stats/period-segmented.tsx` (copy the shape of
`format-segmented.tsx`; text segments, so NO `num` class):

```tsx
'use client'

import type { LeaderboardPeriod } from '@/hooks/use-tab-data'

interface PeriodSegmentedProps {
  value: LeaderboardPeriod
  onChange: (period: LeaderboardPeriod) => void
}

const PERIODS: readonly { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all', label: 'Toujours' },
  { value: 'month', label: 'Ce mois-ci' },
]

/** Arcade `.segmented` toggle between the all-time and month-to-date windows. */
export function PeriodSegmented({ value, onChange }: PeriodSegmentedProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Période du classement">
      {PERIODS.map((period) => {
        const selected = period.value === value
        return (
          <button
            key={period.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onChange(period.value)
            }}
            className="segment"
          >
            {period.label}
          </button>
        )
      })}
    </div>
  )
}
```

Edit `apps/web/src/components/stats/leaderboard-screen.tsx`:

```tsx
import { useState } from 'react'
import { useLeaderboardData, type LeaderboardPeriod } from '@/hooks/use-tab-data'
import { PeriodSegmented } from './period-segmented'
...
export function LeaderboardScreen({ viewerId, initialData }: LeaderboardScreenProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('all')
  const { data } = useLeaderboardData(initialData, period)
  // `keepPreviousData` keeps the previous window during a fetch; the SSR
  // payload is the last-resort fallback and matches the initial 'all' period.
  const leaderboard = data ?? initialData
```

Keep the `friendCount === 0` empty-state branch as-is (before the toggle).
Render `<PeriodSegmented value={period} onChange={setPeriod} />` directly
after `<SectionTitle …>Lauriers</SectionTitle>` in the non-empty branch. The
rest of the JSX is unchanged — podium, table, tiles all render whichever
window `leaderboard` currently holds.

Edit `apps/web/src/components/stats/podium.tsx` — inside the
`<span className="lb-chips" aria-hidden>` block, after the sword/degommages
chip, add:

```tsx
{(row.currentStreak ?? 0) >= 2 ? (
  <span className="lb-chip">Série : {row.currentStreak}</span>
) : null}
```

Edit `apps/web/src/components/stats/ranking-table.tsx` — after the
`{row.wins} v · {row.winrate}%` span, add:

```tsx
{(row.currentStreak ?? 0) >= 2 ? (
  <span className="lb-chip" title={`Série de ${row.currentStreak} victoires`}>
    Série : {row.currentStreak}
  </span>
) : null}
```

Threshold rationale (documented decision): a chip for a single win is noise —
« Série : 1 » would sit on half the rows after every game night; the chip
appears from 2 consecutive wins. The `?? 0` guards the `.optional()` wire
field. Do not remove the podium's `sr-only` « N v · N% » span (e2e contract).

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web lint` → exit 0.

### Step 8: Full verification pass

Run, in order, from the repo root:

1. `pnpm --filter @degommix/web typecheck` → exit 0.
2. `pnpm --filter @degommix/web test` → all pass; **25 test files / 294 tests**
   (baseline 23/283 + season.test.ts (5) + streaks.test.ts (6)).
3. `pnpm --filter @degommix/web lint` → exit 0.
4. `git status --porcelain` → only in-scope files listed under "Scope".

Optional (only if a full stack with a database is already available in your
environment — do not build one for this): `pnpm test:e2e` → `happy-path.spec.ts`
passes unchanged, since the default period is all-time.

## Test plan

- `apps/web/src/lib/season.test.ts` (new, 5 cases listed in Step 1): CEST
  month, CET month with year rollover, spring-DST mid-month gap (the two-pass
  correctness case), autumn-DST gap, exact-boundary instant. Model structure
  on `apps/web/src/lib/chrono.test.ts`.
- `apps/web/src/lib/queries/streaks.test.ts` (new, 6 cases listed in Step 2):
  empty, single win, streak broken by loss, newest-is-loss, interleaved users,
  all-losses. Model structure on `apps/web/src/lib/queries/game-filters.test.ts`.
- No DB-backed unit test exists in this repo for `getLeaderboard` and none is
  added — the SQL window is a one-predicate change verified by typecheck plus
  the pure-function tests around it.
- Verification: `pnpm --filter @degommix/web test` → 294 tests pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @degommix/web typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 with 294 tests (11 new)
- [ ] `pnpm --filter @degommix/web lint` exits 0
- [ ] `grep -n "currentStreak" apps/web/src/lib/queries/stats.ts apps/web/src/lib/api-payloads.ts apps/web/src/components/stats/podium.tsx apps/web/src/components/stats/ranking-table.tsx` → at least one match in each of the four files
- [ ] `grep -n "endedAt" apps/web/src/lib/queries/stats.ts | grep -i "range\|from" ` returns at least one match (the window predicate exists) — or equivalently `grep -n "LeaderboardRange" apps/web/src/lib/queries/stats.ts` matches
- [ ] `grep -n "period=\${period}" apps/web/src/hooks/use-tab-data.ts` returns a match
- [ ] `grep -n "Ce mois-ci" apps/web/src/components/stats/period-segmented.tsx` returns a match
- [ ] `grep -rn "getLeaderboard(user.id)" "apps/web/src/app/(tabs)/classement/page.tsx"` still matches (SSR page untouched, all-time seed)
- [ ] `git status --porcelain` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `8890290`) — in particular if `getLeaderboard` has gained a second
  parameter, or `useLeaderboardData` no longer matches the Step 6 "before"
  shape.
- Spreading `...endedInWindow` into drizzle's `and(...)` fails typecheck after
  one reasonable fix attempt (e.g. the drizzle version rejects the conditional
  spread) — report rather than switching to raw SQL string interpolation.
- `keepPreviousData` is not exported by the installed `@tanstack/react-query`
  (it is in every 5.x — its absence means the dependency drifted).
- Making the change appears to require touching `packages/db`, `e2e/`, or the
  classement `page.tsx` — all out of scope.
- The e2e assertions quoted in "Current state" would need editing to pass —
  the default view must remain byte-identical to today's.
- Baseline test/typecheck/lint commands fail BEFORE your first edit.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Reviewer focus**: (1) the streak query must NOT carry the window predicate
  — window on the aggregates, all-time on the streak; (2) `page.tsx` and the
  route's default period must keep calling `getLeaderboard` identically
  (SSR/JSON byte-identity, doc at the top of `api-payloads.ts`); (3) the sort
  gained no new tiebreaker.
- The streak query scans every `village_reached` game of the circle on each
  leaderboard load. At friends-circle scale this is trivial; if the app ever
  goes beyond that (global boards, hundreds of games per user), cap it with a
  window function (`row_number() over (partition by user_id order by ended_at
  desc)`) or an index on `(ended_at)` — deliberately deferred.
- If seasons ever grow archives ("juin 2026 podium"), `LeaderboardRange`
  already accepts an arbitrary `from`; add a `to` bound and a month picker —
  the owner explicitly rejected that for now, do not build it speculatively.
- If a second screen ever needs the month window, move the `period` state into
  the URL (`?periode=`) instead of duplicating `useState` — deferred because
  /classement is the only consumer today.
- The `.optional()` on `currentStreak` can be tightened to required once every
  deployed PWA shell predates this feature by a few weeks (same lifecycle as
  `lastSeenAt` in `friendsPayloadSchema`).
