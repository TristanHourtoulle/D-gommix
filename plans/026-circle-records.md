# Plan 026: Add the « Palmarès » all-time records card to the Classement screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 596863e..HEAD -- apps/web/src/lib/queries/game-filters.ts apps/web/src/lib/queries/streaks.ts apps/web/src/lib/queries/streaks.test.ts apps/web/src/lib/queries/stats.ts apps/web/src/lib/api-payloads.ts apps/web/src/lib/api-payloads.test.ts apps/web/src/components/stats/leaderboard-screen.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `596863e`, 2026-07-26

## Decision points — resolved by the owner, do NOT revisit

1. **Records ride the existing leaderboard fetch, not a new endpoint.**
   `getCircleRecords(memberIds, …)` is a new query module, but it is *called
   from inside `getLeaderboard`* (as one more member of its existing
   `Promise.all`) and its result becomes a `records` field on the `Leaderboard`
   return type. Why: `getLeaderboard` already fetches `memberIds` once, the
   route (`/api/leaderboard/route.ts`) and the SSR page
   (`classement/page.tsx`) both build the payload by spreading the
   `getLeaderboard` result (`{ ...leaderboard, rivalry }`), so the new field
   flows to both **with zero changes to either file** and the SSR/JSON
   byte-identity contract of `api-payloads.ts` holds for free. A standalone
   `getCircleRecords` called from the route would re-fetch `memberIds` and
   force edits to two files that otherwise need none.
2. **Records are ALL-TIME, always.** They are NOT affected by the plan-019
   month window. The only place the window predicate exists is
   `endedInWindow(range)` in `apps/web/src/lib/queries/stats.ts:84-87`; that
   helper (and `range` generally) must **never** appear in the new
   `records.ts`. `getCircleRecords` deliberately does not accept a
   `LeaderboardRange` parameter, so the mistake is unrepresentable. Precedent:
   the current-streak query inside `getLeaderboard` (stats.ts:244-262) is
   already all-time inside the otherwise-windowed function, with a comment
   saying so. Consequence: the card renders identically under both positions
   of the « Toujours / Ce mois-ci » toggle — this is intended, not a bug.
3. **Duration records filter on `outcome = 'village_reached'`.** The exact
   predicate is `eq(games.outcome, 'village_reached')`, the same one the
   `seatRows` and streak queries already use (stats.ts:236, 257). Reason: a
   game nobody touched for 24 h is auto-closed by the zombie sweep with
   `outcome: 'aborted'` (`apps/ws-server/src/zombie-job.ts:64`, excerpt
   below) — a ~24 h zombie must never be crowned « la partie la plus longue »,
   and abandoned games have no meaningful "race to the village" duration
   either way.
4. **The « plus gros carton » does NOT filter on outcome.** SPECS.md:126:
   « **Parties abandonnées** : les dégommages comptent, mais la partie est
   **exclue du dénominateur du winrate**. » A record carton scored in a game
   that was later abandoned still counts. The carton query filters
   finished + started only (plus `degommages > 0` so an empty circle yields
   `null`, not a zero-count "record").
5. **Longest-streak record needs ≥ 2 wins; ties break alphabetically (fr).**
   A « série » of one is just a win — same ≥ 2 threshold the streak chip
   already uses (`podium.tsx:93`). A tie between players goes to
   `username.localeCompare(other, 'fr')`, matching the leaderboard's own last
   tiebreaker (`compareStandings`, stats.ts:104-111). Game-record ties
   (identical durations, identical carton counts) go to the **earliest**
   `ended_at` — the first player to set a record keeps it.
6. **One-game circle: the « Marathon » line hides.** When the fastest and
   longest village game are the same game, only « Partie éclair » renders —
   a single game is trivially both extremes and showing it twice is noise.
   This is a display rule in the card, not a server rule (the payload still
   carries both).
7. **`inList` moves to `game-filters.ts`.** `records.ts` needs the
   parameterized-IN helper currently private to stats.ts (stats.ts:60-66), and
   stats.ts will import from records.ts — keeping `inList` in stats.ts would
   create a stats ↔ records import cycle. `game-filters.ts` is already the
   shared home of query predicates (`gameStarted`) and stats.ts already
   imports from it. The helper moves verbatim, no duplication.

## Why this matters

The Classement answers « qui est le meilleur ? » but nothing on the app
answers « quel est le record ? » — the game night's most retold stories (the
5-minute blitz win, the 90-minute marathon, the 4-win streak, the game where
someone dégommé'd everything that moved) evaporate after the endgame screen.
Every ingredient is already persisted per game (`started_at`/`ended_at`,
`game_players.degommages`, the all-time win/loss list) but **no aggregate
exists anywhere** — duration is only ever computed per-game for display. A
« Palmarès » card under the podium turns those rows into permanent bragging
rights, with no schema change and no ws-server change.

## Current state

All excerpts verified at commit `596863e`.

### Files and their roles

- `packages/db/src/schema/games.ts` — schema; every ingredient already exists.
- `apps/ws-server/src/finalize.ts` — stamps `endedAt` and denormalizes
  `degommages` when a game closes.
- `apps/ws-server/src/zombie-job.ts` — the 24 h auto-close (the trap for
  Decision 3).
- `apps/web/src/lib/queries/stats.ts` — `getLeaderboard` + helpers; the file
  the records feature plugs into.
- `apps/web/src/lib/queries/streaks.ts` — `computeCurrentStreaks`; gains a
  `computeLongestStreaks` sibling.
- `apps/web/src/lib/queries/game-filters.ts` — shared query predicates
  (`gameStarted`); receives `inList`.
- `apps/web/src/lib/api-payloads.ts` — zod wire schemas; header comment is the
  payload contract to honor.
- `apps/web/src/app/api/leaderboard/route.ts` and
  `apps/web/src/app/(tabs)/classement/page.tsx` — payload producers;
  **unchanged by this plan** (Decision 1).
- `apps/web/src/components/stats/leaderboard-screen.tsx` — client shell where
  the card mounts.
- `apps/web/src/components/stats/head-to-head-card.tsx` — the design exemplar
  for a text-rows stat card.
- `apps/web/src/components/stats/format.ts` — `formatDurationProse`.

### Schema: everything needed is already persisted

`packages/db/src/schema/games.ts:46-50`:

```ts
    outcome: gameOutcome('outcome'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
```

`packages/db/src/schema/games.ts:68` (per-player, per-game — the carton
source): `degommages: integer('degommages').notNull().default(0),`

`apps/ws-server/src/finalize.ts:16-24` stamps `endedAt` on every close:

```ts
  await tx
    .update(games)
    .set({
      status: 'finished',
      outcome: state.outcome,
      winnerId: state.winnerId,
      endedAt: new Date(),
    })
    .where(eq(games.id, gameId))
```

`apps/ws-server/src/zombie-job.ts:64` — the auto-close that must never win a
duration record: `.set({ status: 'finished', outcome: 'aborted', endedAt: now() })`

### Duration is only ever computed per-game — no aggregate exists

Verified with `grep -rn "extract(epoch" apps/web/src apps/ws-server/src`: the
only hit is `stats.ts:216` (`max(started_at)` for the favorite-character
tiebreak, not a duration). Per-game display computations:

- `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx:61-64`:

  ```ts
  const durationSeconds =
    detail.startedAt && detail.endedAt
      ? Math.max(0, Math.round((detail.endedAt.getTime() - detail.startedAt.getTime()) / 1000))
      : null
  ```

- `apps/web/src/components/home/game-history-item.tsx:50`:
  `const meta = [formatWhen(game.endedAt), formatDuration(game.durationSec)]`
- `apps/web/src/lib/shared-games.ts:74-77` — `durationSeconds(startedAt, endedAt)`
  helper, same per-game shape.

### stats.ts — the structure the records plug into

`apps/web/src/lib/queries/stats.ts:60-66` — the helper to move (Decision 7):

```ts
/** Parameterized `column IN (...)` for a non-empty string list. */
function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}
```

`stats.ts:79-87` — the plan-019 window that records must NOT use (Decision 2):

```ts
export interface LeaderboardRange {
  /** Count only games with `ended_at >= from`. Omit for all-time. */
  from?: Date
}

/** `ended_at` window filters for a leaderboard range (empty for all-time). */
function endedInWindow(range: LeaderboardRange) {
  return range.from === undefined ? [] : [sql`${games.endedAt} >= ${range.from}`]
}
```

`stats.ts:53-58` — the return type that gains `records`:

```ts
export interface Leaderboard {
  rows: LeaderboardRow[]
  friendCount: number
  topDegommeur: TopDegommeur | null
  characterWinrates: CharacterWinrate[]
}
```

`stats.ts:200-263` (abridged) — `getLeaderboard`'s `Promise.all`, whose last
member is the all-time streak query this plan extracts into `records.ts` (as
`queryVillageResults`, with a `user` join added for holder identity):

```ts
export async function getLeaderboard(
  userId: string,
  range: LeaderboardRange = {}
): Promise<Leaderboard> {
  const memberIds = await getCircleMemberIds(userId)

  const finishedStarted = circleFinishedStarted(memberIds, range)

  const [members, statRows, characterRows, seatRows, streakRows] = await Promise.all([
    queryCircleMembers(memberIds),
    queryCircleStats(memberIds, range),
    /* characterRows … */
    /* seatRows: where(and(inList(...), eq(games.status,'finished'),
       eq(games.outcome,'village_reached'), gameStarted,
       player status in ('joined','left'), character not null, ...endedInWindow(range))) */
    // Streak source: deliberately NOT windowed — the current streak is a
    // now-anchored, all-time property (plan 019, decision 3).
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
  ])
```

`stats.ts:283-290` — where the streaks are consumed and rows assembled;
`stats.ts:317` — the return: `return { rows, friendCount: memberIds.length - 1, topDegommeur, characterWinrates }`.

`apps/web/src/lib/queries/game-filters.ts:12` — the phantom-lobby predicate
every stats query includes: `export const gameStarted = sql\`${games.startedAt} is not null\``

### streaks.ts — the sibling pattern

`apps/web/src/lib/queries/streaks.ts:13-27`:

```ts
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

It consumes the full all-time newest-first win/loss list `getLeaderboard`
already loads but stops at the *current* streak — the longest-ever streak is
the same array with a second accumulator (current run + best run per user).
`StreakGameResult` is `{ userId: string; won: boolean }` (streaks.ts:1-4).
Its co-located test file `streaks.test.ts` (6 tests) is the structural
exemplar for the new tests.

### Payload contract

`apps/web/src/lib/api-payloads.ts:6-12`:

```ts
/**
 * Wire shapes of the tab data endpoints (`/api/home`, `/api/invites`,
 * `/api/friends`, `/api/leaderboard`). They mirror the server query return
 * types with every `Date` flattened to an ISO string, so the JSON a client
 * query receives is byte-identical to the `initialData` the server component
 * seeds it with.
 */
```

Fields added after launch use the `.optional()` convention because a
PWA-precached SSR page can replay an old-shaped `initialData` into new JS —
exemplar at `api-payloads.ts:121-122` inside `leaderboardPayloadSchema.rows`:

```ts
      /** Optional for old PWA-cached SSR payloads (same convention as lastSeenAt). */
      currentStreak: z.number().optional(),
```

The records payload deliberately contains **no Date** (`durationSec` is a
number computed in SQL), so byte-identity between `NextResponse.json` and the
SSR-seeded object needs no serializer helper.

The existing test `apps/web/src/lib/api-payloads.test.ts:119-127`
(« accepts an empty leaderboard payload ») is the legacy-cache guarantee: it
must keep passing after the schema gains `records` — which it does only if
`records` is `.optional()`.

### Payload producers — unchanged by this plan (Decision 1)

`apps/web/src/app/api/leaderboard/route.ts:32-37`:

```ts
  const [leaderboard, rivalry] = await Promise.all([
    getLeaderboard(session.user.id, { from }),
    getRivalrySpotlight(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry }
```

`apps/web/src/app/(tabs)/classement/page.tsx:10-15`:

```ts
  const [leaderboard, rivalry] = await Promise.all([
    getLeaderboard(user.id),
    getRivalrySpotlight(user.id),
  ])

  return <LeaderboardScreen viewerId={user.id} initialData={{ ...leaderboard, rivalry }} />
```

Both spread the `getLeaderboard` result, so a new `records` field on
`Leaderboard` reaches the wire and the SSR seed automatically.

### The screen and the design idiom

`apps/web/src/components/stats/leaderboard-screen.tsx:52-64` — where the card
mounts (directly under the podium):

```tsx
      <SectionTitle sub="Toute la tribu, du premier au dernier">Lauriers</SectionTitle>

      <PeriodSegmented value={period} onChange={setPeriod} />

      {leaderboard.topDegommeur ? <TopDegommeurTile top={leaderboard.topDegommeur} /> : null}

      <RivalryTile rivalry={leaderboard.rivalry} />

      <Podium rows={podiumRows} viewerId={viewerId} />

      {tableRows.length > 0 ? <RankingTable rows={tableRows} viewerId={viewerId} /> : null}
```

Design exemplar — `apps/web/src/components/stats/head-to-head-card.tsx:22-35`
(a `Card` with a `sec-label` heading and icon-led text rows):

```tsx
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Face à face</p>
      …
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="flag" size={14} />
```

Available icon names (from `apps/web/src/components/icons.tsx`): `bell`,
`check`, `chevron-down`, `chevron-right`, `close`, `copy`, `crown`, `exit`,
`flag`, `home`, `moon`, `pawn`, `play`, `search`, `settings`, `sun`, `sword`,
`timer`, `trophy`, `undo`, `user-add`, `users`.

Duration formatter — `apps/web/src/components/stats/format.ts:17-22`:

```ts
/** "18 min 47 s" style duration for prose. */
export function formatDurationProse(seconds: number): string {
```

### Documented scope and vocabulary

- SPECS.md:122 (§4 Fonctionnalités › Classement & stats): « Classement des
  joueurs **scopé au cercle d'amis (+ soi)**, jamais global à l'app » — the
  records are circle-scoped exactly like every other stat: every query filters
  `inList(gamePlayers.userId, memberIds)`.
- SPECS.md:126: « **Parties abandonnées** : les dégommages comptent, mais la
  partie est **exclue du dénominateur du winrate**. » (Decision 4.)
- French UI text, English code/comments, TS strict
  (`noUncheckedIndexedAccess` is on — `rows[0]` is `T | undefined`).

### E2E contract that must keep passing

`e2e/happy-path.spec.ts:134-136`:

```ts
    await p1.goto('/classement')
    await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
    await expect(p1.getByTestId(`ranking-row-${J1.username}`)).toContainText('0 v')
```

The records card adds new content but no `ranking-row-*` testid, so these
assertions are unaffected.

### Baselines at `596863e` (verified by running them)

- `pnpm typecheck` → 5/5 tasks successful.
- `pnpm lint` → 5/5 tasks successful.
- `pnpm --filter @degommix/web test` → **27 files / 315 tests, all passing**.

## Commands you will need

All from the repo root; verified against this repo (README.md:92-99 documents
the integration-test requirements).

| Purpose              | Command                                                        | Expected on success                 |
|----------------------|----------------------------------------------------------------|-------------------------------------|
| Install              | `pnpm install`                                                 | exit 0                              |
| Typecheck            | `pnpm typecheck`                                               | exit 0, 5/5 tasks                   |
| Lint                 | `pnpm lint`                                                    | exit 0, 5/5 tasks                   |
| Web unit tests only  | `pnpm --filter @degommix/web test`                             | all pass (baseline 315)             |
| One test file        | `pnpm --filter @degommix/web test -- src/lib/queries/records.test.ts` | that file passes             |
| Test DB (integration)| `docker compose -f docker-compose.test.yml up -d`              | postgres-test on port 54329         |
| Full test suite      | `pnpm exec turbo run test --concurrency=1`                     | all workspaces pass                 |
| E2E                  | `pnpm test:e2e`                                                | happy-path passes unchanged         |

`--concurrency=1` is mandatory for the full suite: two workspaces must not hit
the shared test database at once (README.md:99). `pnpm test` without it is the
same turbo pipeline but unserialized — do not use it while the DB-backed
integration tests run.

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/lib/queries/game-filters.ts` — receives `inList`
- `apps/web/src/lib/queries/streaks.ts` — add `computeLongestStreaks`
- `apps/web/src/lib/queries/streaks.test.ts` — new describe block
- `apps/web/src/lib/queries/records.ts` (create)
- `apps/web/src/lib/queries/records.test.ts` (create)
- `apps/web/src/lib/queries/stats.ts` — wire records into `getLeaderboard`
- `apps/web/src/lib/api-payloads.ts` — `records` schema
- `apps/web/src/lib/api-payloads.test.ts` — two new cases
- `apps/web/src/components/stats/records-card.tsx` (create)
- `apps/web/src/components/stats/leaderboard-screen.tsx` — mount the card

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/api/leaderboard/route.ts` and
  `apps/web/src/app/(tabs)/classement/page.tsx` — unchanged by design
  (Decision 1); if you find yourself editing them, you took a wrong turn.
- `packages/db/**` — no schema change, no migration, no new index; every
  record reads existing columns.
- `apps/web/src/hooks/use-tab-data.ts`, `apps/web/src/lib/query-keys.ts` —
  the payload type flows through the existing hook untouched.
- `apps/web/src/components/stats/podium.tsx`, `ranking-table.tsx`,
  `period-segmented.tsx` — neighbors, not participants.
- `apps/web/src/app/globals.css` — reuse `Card`, `.sec-label`, text utilities;
  no new CSS.
- `apps/ws-server/**`, `e2e/**`, `SPECS.md`.

## Git workflow

- Branch: `git checkout -b feat/026-circle-records` (repo convention
  `type/short-description`).
- Conventional commits, `feat(web): …` — exemplar from `git log`:
  `feat(web): month-to-date leaderboard window and win-streak chips (#47)`.
  One commit per step or logical unit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move `inList` into `game-filters.ts`

In `apps/web/src/lib/queries/game-filters.ts`, add (below `gameStarted`), the
helper moved verbatim from stats.ts — now exported:

```ts
/**
 * Parameterized `column IN (...)` for a non-empty string list. Shared by the
 * stats and records queries (moved out of stats.ts so records.ts can use it
 * without a stats ↔ records import cycle).
 */
export function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}
```

In `apps/web/src/lib/queries/stats.ts`: delete the local `inList` definition
(lines 60-66) and extend the existing import:

```ts
import { gameStarted, inList, isPhantomLobbyGame } from './game-filters'
```

**Verify**: `pnpm typecheck` → exit 0, 5/5 tasks.
**Verify**: `pnpm --filter @degommix/web test` → 315 tests pass (pure move).

### Step 2: Add `computeLongestStreaks` to streaks.ts, with tests

Append to `apps/web/src/lib/queries/streaks.ts`:

```ts
/**
 * Longest-ever win streak per player over the same newest-first
 * `village_reached` result list `computeCurrentStreaks` consumes. Aborted
 * games never reach this function (the caller filters on outcome), so they
 * are neutral here too. A run of consecutive wins reads the same in either
 * direction, so newest-first input needs no reversal: walk the list keeping
 * the running streak and the best streak seen per player.
 */
export function computeLongestStreaks(
  resultsNewestFirst: StreakGameResult[]
): Map<string, number> {
  const current = new Map<string, number>()
  const longest = new Map<string, number>()
  for (const result of resultsNewestFirst) {
    if (result.won) {
      const run = (current.get(result.userId) ?? 0) + 1
      current.set(result.userId, run)
      if (run > (longest.get(result.userId) ?? 0)) longest.set(result.userId, run)
    } else {
      current.set(result.userId, 0)
    }
  }
  return longest
}
```

Extend `apps/web/src/lib/queries/streaks.test.ts` with a
`describe('computeLongestStreaks', …)` block (same style as the existing
`computeCurrentStreaks` block). Cases (input arrays are newest-first):

1. Empty input → empty map.
2. Single win → longest 1.
3. Keeps a past run that beats the current one:
   `[{a,won},{a,lost},{a,won},{a,won},{a,won}]` → a: 3.
4. Keeps the current run when it is the best:
   `[{a,won},{a,won},{a,lost},{a,won}]` → a: 2.
5. Reports the shared max when past and current runs tie:
   `[{a,won},{a,won},{a,lost},{a,won},{a,won}]` → a: 2.
6. Player with only losses is absent from the map.
7. Interleaved users tracked independently:
   `[{a,won},{b,lost},{a,won},{b,won}]` → a: 2, b: 1.

**Verify**: `pnpm --filter @degommix/web test -- src/lib/queries/streaks.test.ts`
→ 13 tests pass (6 existing + 7 new).

### Step 3: Create `records.ts` — queries, assembly, and the pure holder picker

Create `apps/web/src/lib/queries/records.ts`:

```ts
import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { gameStarted, inList } from './game-filters'
import { computeLongestStreaks, type StreakGameResult } from './streaks'

/**
 * All-time « Palmarès » records of the friends circle (design §4: every stat
 * is circle-scoped, never app-global). Deliberately range-free: records must
 * NEVER carry the plan-019 month window — `LeaderboardRange` and
 * `endedInWindow` (stats.ts) must not appear in this file.
 */

export interface RecordHolder {
  userId: string
  username: string
  avatarId?: string | null
}

export interface GameRecord {
  gameId: string
  /** Whole seconds between started_at and ended_at, rounded in SQL. */
  durationSec: number
  /** The game's winner (a village_reached game always has one). */
  holder: RecordHolder
}

export interface CountRecord {
  holder: RecordHolder
  count: number
  /** Game that set the record, when a single game did (biggest carton). */
  gameId?: string
}

export interface CircleRecords {
  fastestVillage: GameRecord | null
  longestVillage: GameRecord | null
  longestStreak: CountRecord | null
  biggestCarton: CountRecord | null
}

/** One row of the circle's all-time village_reached history, newest first. */
export interface VillageResultRow extends StreakGameResult {
  username: string | null
  avatarId: string | null
}

/**
 * All-time win/loss list of the circle's village_reached games, newest first
 * by ended_at. Single source for the current-streak chips (stats.ts) and the
 * longest-streak record, so the table is scanned once per leaderboard load.
 */
export function queryVillageResults(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      avatarId: user.avatarId,
      won: sql`${games.winnerId} = ${gamePlayers.userId}`.mapWith(Boolean),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
    .orderBy(sql`${games.endedAt} desc`)
}

const durationSec = sql`round(extract(epoch from (${games.endedAt} - ${games.startedAt})))`

/**
 * Extreme-duration village_reached game of the circle, winner joined for the
 * holder identity. `outcome = 'village_reached'` is load-bearing: a 24 h
 * zombie auto-close (outcome 'aborted', ws-server/src/zombie-job.ts) must
 * never be « la partie la plus longue ». Ties go to the earliest ended_at —
 * the first game to set a record keeps it. The gamePlayers join fans out one
 * row per circle participant, but every selected column is game- or
 * winner-level, so the duplicate rows are identical and limit 1 is safe.
 */
function queryVillageGameByDuration(memberIds: string[], direction: 'asc' | 'desc') {
  return db
    .select({
      gameId: games.id,
      durationSec: durationSec.mapWith(Number),
      userId: user.id,
      username: user.username,
      avatarId: user.avatarId,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .innerJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        eq(games.outcome, 'village_reached'),
        gameStarted,
        sql`${games.endedAt} is not null`,
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
    .orderBy(
      direction === 'asc' ? sql`${durationSec} asc` : sql`${durationSec} desc`,
      sql`${games.endedAt} asc`
    )
    .limit(1)
}

/**
 * Biggest single-game dégommage count. No outcome filter on purpose: design
 * §5.3, « les dégommages comptent » even in abandoned games — only the
 * winrate denominator excludes them. `> 0` keeps an all-zero circle at null.
 */
function queryBiggestCarton(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      avatarId: user.avatarId,
      degommages: gamePlayers.degommages,
      gameId: gamePlayers.gameId,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        inList(gamePlayers.userId, memberIds),
        eq(games.status, 'finished'),
        gameStarted,
        sql`${gamePlayers.status} in ('joined', 'left')`,
        sql`${gamePlayers.degommages} > 0`
      )
    )
    .orderBy(sql`${gamePlayers.degommages} desc`, sql`${games.endedAt} asc`)
    .limit(1)
}

/**
 * Record holder of the longest-ever win streak. Requires at least 2 wins —
 * a « série » of one is just a win (same threshold as the podium streak
 * chip). Ties break on French alphabetical order of usernames, like the
 * leaderboard's own last tiebreaker (compareStandings, stats.ts).
 */
export function pickLongestStreakHolder(
  longestByUser: Map<string, number>,
  rows: VillageResultRow[]
): CountRecord | null {
  const usernameOf = (userId: string): string =>
    rows.find((row) => row.userId === userId)?.username ?? 'Inconnu'

  let best: { userId: string; count: number } | null = null
  for (const [userId, count] of longestByUser) {
    if (count < 2) continue
    const beats =
      best === null ||
      count > best.count ||
      (count === best.count &&
        usernameOf(userId).localeCompare(usernameOf(best.userId), 'fr') < 0)
    if (beats) best = { userId, count }
  }
  if (best === null) return null

  const winner = best
  const holderRow = rows.find((row) => row.userId === winner.userId)
  return {
    holder: {
      userId: winner.userId,
      username: holderRow?.username ?? 'Inconnu',
      avatarId: holderRow?.avatarId ?? null,
    },
    count: winner.count,
  }
}

/**
 * The four all-time records. `villageResults` is the promise getLeaderboard
 * already kicked off (queryVillageResults) so the shared scan runs once;
 * passing the promise (not the awaited rows) keeps everything parallel.
 */
export async function getCircleRecords(
  memberIds: string[],
  villageResults: VillageResultRow[] | PromiseLike<VillageResultRow[]>
): Promise<CircleRecords> {
  const [fastestRows, longestRows, cartonRows, results] = await Promise.all([
    queryVillageGameByDuration(memberIds, 'asc'),
    queryVillageGameByDuration(memberIds, 'desc'),
    queryBiggestCarton(memberIds),
    villageResults,
  ])

  const toGameRecord = (
    row: Awaited<ReturnType<typeof queryVillageGameByDuration>>[number] | undefined
  ): GameRecord | null =>
    row === undefined
      ? null
      : {
          gameId: row.gameId,
          durationSec: row.durationSec,
          holder: {
            userId: row.userId,
            username: row.username ?? 'Inconnu',
            avatarId: row.avatarId ?? null,
          },
        }

  const carton = cartonRows[0]
  return {
    fastestVillage: toGameRecord(fastestRows[0]),
    longestVillage: toGameRecord(longestRows[0]),
    longestStreak: pickLongestStreakHolder(computeLongestStreaks(results), results),
    biggestCarton:
      carton === undefined
        ? null
        : {
            holder: {
              userId: carton.userId,
              username: carton.username ?? 'Inconnu',
              avatarId: carton.avatarId ?? null,
            },
            count: carton.degommages,
            gameId: carton.gameId,
          },
  }
}
```

Create `apps/web/src/lib/queries/records.test.ts` (model on
`streaks.test.ts`; no DB harness exists in this repo, so only the pure
`pickLongestStreakHolder` is unit-tested — the SQL is covered by typecheck
and e2e). A small row factory keeps cases short:

```ts
import { describe, expect, it } from 'vitest'
import { pickLongestStreakHolder, type VillageResultRow } from './records'

function row(userId: string, username: string | null): VillageResultRow {
  return { userId, username, avatarId: null, won: true }
}
```

Cases:

1. Empty map → `null`.
2. Best streak of 1 → `null` (below the « série » threshold).
3. `Map([['a', 3]])` with `[row('a', 'Obelix')]` → holder username `Obelix`,
   count 3.
4. Tie `Map([['a', 2], ['b', 2]])`, usernames `Zoé` (a) and `Édith` (b) →
   holder is `Édith` (French collation puts É before Z).
5. `Map([['a', 2]])` with no matching row → holder username `Inconnu`.

**Verify**: `pnpm --filter @degommix/web test -- src/lib/queries/records.test.ts`
→ 5 tests pass.
**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Wire records into `getLeaderboard`

Edit `apps/web/src/lib/queries/stats.ts`:

1. Import the new module:

   ```ts
   import { getCircleRecords, queryVillageResults, type CircleRecords } from './records'
   ```

2. Extend the `Leaderboard` interface (stats.ts:53-58):

   ```ts
   export interface Leaderboard {
     rows: LeaderboardRow[]
     friendCount: number
     topDegommeur: TopDegommeur | null
     characterWinrates: CharacterWinrate[]
     /** All-time « Palmarès » — never windowed by `range` (plan 026). */
     records: CircleRecords
   }
   ```

3. In `getLeaderboard`, replace the inline streak query (the last
   `Promise.all` member, stats.ts:244-262, quoted in "Current state") with the
   shared query, and add the records fetch. Start the shared promise once,
   before the `Promise.all`:

   ```ts
   // Single all-time scan feeding both the current-streak chips and the
   // longest-streak record (plan 026). Never windowed by `range`.
   const villageResults = queryVillageResults(memberIds)

   const [members, statRows, characterRows, seatRows, streakRows, records] =
     await Promise.all([
       queryCircleMembers(memberIds),
       queryCircleStats(memberIds, range),
       /* characterRows query — unchanged */,
       /* seatRows query — unchanged */,
       villageResults,
       getCircleRecords(memberIds, villageResults),
     ])
   ```

   `computeCurrentStreaks(streakRows)` keeps working unchanged:
   `VillageResultRow` structurally extends `StreakGameResult`.

4. Extend the return (stats.ts:317):

   ```ts
   return { rows, friendCount: memberIds.length - 1, topDegommeur, characterWinrates, records }
   ```

Note a drizzle promise is a thenable query builder: awaiting `villageResults`
in two `Promise.all`s does not run the SQL twice only if the same promise
object is reused — which is exactly what passing the variable does. Do NOT
call `queryVillageResults` twice.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web test` → all pass (327 at this point:
315 + 7 streaks + 5 records).

### Step 5: Extend the wire schema

Edit `apps/web/src/lib/api-payloads.ts`. Above `leaderboardPayloadSchema`
(next to `rivalryPeerSchema`), add:

```ts
const recordHolderSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: z.string().nullable().optional(),
})

const gameRecordSchema = z.object({
  gameId: z.string(),
  /** Whole seconds, computed in SQL — no Date crosses the wire. */
  durationSec: z.number(),
  holder: recordHolderSchema,
})

const countRecordSchema = z.object({
  holder: recordHolderSchema,
  count: z.number(),
  /** Game that set the record, when a single game did (biggest carton). */
  gameId: z.string().optional(),
})
```

Inside `leaderboardPayloadSchema`, after `characterWinrates`, add:

```ts
  /**
   * All-time « Palmarès » records — never affected by `?period=` (plan 026).
   * Optional for old PWA-cached SSR payloads (same convention as
   * currentStreak / lastSeenAt).
   */
  records: z
    .object({
      fastestVillage: gameRecordSchema.nullable(),
      longestVillage: gameRecordSchema.nullable(),
      longestStreak: countRecordSchema.nullable(),
      biggestCarton: countRecordSchema.nullable(),
    })
    .optional(),
```

Extend `apps/web/src/lib/api-payloads.test.ts` with two cases (model on the
existing leaderboard cases at lines 130-146):

1. « accepts a leaderboard payload carrying the palmarès records » — a payload
   with all four records populated (one holder omitting `avatarId`, the carton
   carrying its `gameId`) round-trips through `parse` unchanged.
2. « accepts a palmarès with every record still null » — `records` present,
   all four fields `null`, `safeParse(...).success` is `true`.

The existing « accepts an empty leaderboard payload » test (line 119) must
keep passing untouched — it is the proof that old cached payloads without
`records` still parse.

**Verify**: `pnpm --filter @degommix/web test -- src/lib/api-payloads.test.ts`
→ all pass (2 new).
**Verify**: `pnpm typecheck` → exit 0 (this is also the proof that the server
`CircleRecords` shape is assignable to the schema's inferred type through
`LeaderboardPayload` in route.ts and page.tsx, both untouched).

### Step 6: The « Palmarès » card

Create `apps/web/src/components/stats/records-card.tsx` (design idiom of
`head-to-head-card.tsx`: `Card` + `sec-label` + icon-led rows; no new CSS):

```tsx
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/icons'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { formatDurationProse } from './format'

type CircleRecordsPayload = NonNullable<LeaderboardPayload['records']>

interface RecordsCardProps {
  records: CircleRecordsPayload
}

interface RecordLine {
  icon: IconName
  label: string
  holder: string
  value: string
}

/**
 * « Palmarès du village » — all-time records under the podium. The card never
 * follows the period toggle (records are all-time by design, plan 026). When
 * fastest and longest are the same single game, only « Partie éclair »
 * renders — one game is trivially both extremes.
 */
export function RecordsCard({ records }: RecordsCardProps) {
  const lines: RecordLine[] = []
  if (records.fastestVillage) {
    lines.push({
      icon: 'timer',
      label: 'Partie éclair',
      holder: records.fastestVillage.holder.username,
      value: formatDurationProse(records.fastestVillage.durationSec),
    })
  }
  if (
    records.longestVillage &&
    records.longestVillage.gameId !== records.fastestVillage?.gameId
  ) {
    lines.push({
      icon: 'timer',
      label: 'Marathon gaulois',
      holder: records.longestVillage.holder.username,
      value: formatDurationProse(records.longestVillage.durationSec),
    })
  }
  if (records.longestStreak) {
    lines.push({
      icon: 'crown',
      label: 'Série légendaire',
      holder: records.longestStreak.holder.username,
      value: `${records.longestStreak.count} victoires d’affilée`,
    })
  }
  if (records.biggestCarton) {
    lines.push({
      icon: 'sword',
      label: 'Plus gros carton',
      holder: records.biggestCarton.holder.username,
      value: `${records.biggestCarton.count} dégommage${records.biggestCarton.count > 1 ? 's' : ''} en une partie`,
    })
  }
  if (lines.length === 0) return null

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Palmarès du village</p>
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <p key={line.label} className="m-0 flex items-center gap-2 text-sm">
            <Icon name={line.icon} size={14} className="text-bronze" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{line.label}</span> — {line.holder}
            </span>
            <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>
              {line.value}
            </span>
          </p>
        ))}
      </div>
    </Card>
  )
}
```

Edit `apps/web/src/components/stats/leaderboard-screen.tsx`: import
`RecordsCard` (alphabetical position among the `./` imports) and render it
directly under the podium, before the ranking table:

```tsx
      <Podium rows={podiumRows} viewerId={viewerId} />

      {leaderboard.records ? <RecordsCard records={leaderboard.records} /> : null}

      {tableRows.length > 0 ? <RankingTable rows={tableRows} viewerId={viewerId} /> : null}
```

The outer `leaderboard.records ?` guard covers the `.optional()` wire field
(old PWA cache replaying a pre-026 payload); the inner `lines.length === 0`
guard covers a circle with no finished game (all four records null): in both
cases the screen renders exactly as today.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `pnpm lint` → exit 0.

### Step 7: Full verification pass

From the repo root, in order:

1. `pnpm typecheck` → exit 0, 5/5 tasks.
2. `pnpm lint` → exit 0, 5/5 tasks.
3. `pnpm --filter @degommix/web test` → **28 files / 329 tests**
   (baseline 27/315 + 7 streaks + 5 records + 2 payloads).
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → every workspace passes
   (the ws-server integration suite needs the test postgres on port 54329).
5. `pnpm test:e2e` → `happy-path.spec.ts` passes unchanged (its classement
   assertions target `ranking-row-*` testids, which the card does not touch).
6. `git status --porcelain` → only files from the in-scope list.

## Test plan

- `apps/web/src/lib/queries/streaks.test.ts` — 7 new `computeLongestStreaks`
  cases (Step 2 list): empty, single win, past-run-beats-current,
  current-run-is-best, past/current tie, all-losses absent, interleaved users.
- `apps/web/src/lib/queries/records.test.ts` (new) — 5
  `pickLongestStreakHolder` cases (Step 3 list): empty, below-threshold,
  holder identity, French-collation tie-break, missing-row fallback.
- `apps/web/src/lib/api-payloads.test.ts` — 2 new cases (Step 5 list), plus
  the untouched legacy-cache test as the regression guard.
- No DB-backed unit test exists in this repo for query functions and none is
  added (same position as plan 019): the SQL is exercised by typecheck and the
  e2e run.
- Verification: `pnpm --filter @degommix/web test` → 329 tests pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 with 329 tests (14 new)
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 (test DB up)
- [ ] `pnpm test:e2e` exits 0, happy-path unchanged
- [ ] `grep -n "getCircleRecords" apps/web/src/lib/queries/stats.ts apps/web/src/lib/queries/records.ts` → at least one match in each file
- [ ] `grep -n "endedInWindow\|LeaderboardRange" apps/web/src/lib/queries/records.ts` → **no match** (records are never windowed — Decision 2)
- [ ] `grep -c "village_reached" apps/web/src/lib/queries/records.ts` → at least 2 (duration + streak predicates — Decision 3)
- [ ] `grep -n "records:" apps/web/src/lib/api-payloads.ts` → matches inside `leaderboardPayloadSchema`, with `.optional()`
- [ ] `grep -n "Palmarès du village" apps/web/src/components/stats/records-card.tsx` → matches
- [ ] `grep -n "inList" apps/web/src/lib/queries/game-filters.ts` → matches, and `grep -c "function inList" apps/web/src/lib/queries/stats.ts` → 0
- [ ] `git diff --stat 596863e..HEAD -- "apps/web/src/app/api/leaderboard/route.ts" "apps/web/src/app/(tabs)/classement/page.tsx" packages/db` → empty (Decision 1 / out of scope)
- [ ] `git status --porcelain` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `596863e`) — in particular if `getLeaderboard`'s `Promise.all` no longer
  ends with the inline streak query, or `Leaderboard` already has a `records`
  field (someone landed a variant of this plan).
- Satisfying typecheck appears to require editing `route.ts`,
  `classement/page.tsx`, `use-tab-data.ts`, or `query-keys.ts` — by Decision 1
  they must stay untouched; needing them means the payload shape went wrong.
- The composed drizzle fragment (`durationSec` reused inside `orderBy`) fails
  typecheck or produces invalid SQL after one reasonable fix attempt — report
  rather than falling back to string-interpolated SQL.
- A runtime/test error mentions a circular import between `stats.ts` and
  `records.ts` — Step 1 (the `inList` move) was skipped or `records.ts`
  imported something from `stats.ts`.
- You are tempted to pass `range` or any date bound into `getCircleRecords`
  or `queryVillageResults` — that violates Decision 2; if some requirement
  seems to demand it, stop.
- The e2e classement assertions (quoted in "Current state") fail — the card
  must be purely additive.
- Baseline commands (typecheck, lint, web tests) fail BEFORE your first edit.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Reviewer focus**: (1) no window predicate anywhere in `records.ts` — the
  grep in Done criteria is the check; (2) the duration queries carry
  `eq(games.outcome, 'village_reached')` and the carton query deliberately
  does not; (3) `route.ts` and `page.tsx` diffs are empty; (4) the
  `villageResults` promise is created once and shared — not two calls to
  `queryVillageResults`.
- **Payload/screen collision with sibling plans**: plans 021 (rivalry pairs),
  027 (season archive) and 028 (personal stats) also touch
  `apps/web/src/lib/api-payloads.ts`, `/api/leaderboard` and the classement
  components. Whichever lands second **rebases on the first and adopts its
  payload and layout decisions** rather than re-deciding them; the
  `leaderboardPayloadSchema` field order and the card order under the podium
  are first-lander's choice.
- The three record queries each scan the circle's finished games per
  leaderboard load. At friends-circle scale this is trivial (same position as
  plan 019's streak query); if the app ever outgrows it, fold the two duration
  extremes into one query with window functions and add an index on
  `games (outcome, ended_at)` — deliberately deferred.
- Record lines are display-only. Linking « Partie éclair »/« Plus gros
  carton » to `/parties/[gameId]` (the payload already carries `gameId`) and
  the streak holder to `/amis/[userId]` is an easy follow-up, deferred to keep
  this card static like `head-to-head-card`.
- The card shows all-time records even under « Ce mois-ci » with no explicit
  label saying so — accepted trade-off (Decision 2). If playtesters find it
  confusing, add « tous les temps » to the `sec-label`, do not window the
  data.
- The `.optional()` on `records` can be tightened to required once every
  deployed PWA shell predates this feature by a few weeks (same lifecycle as
  `currentStreak` and `lastSeenAt`).
