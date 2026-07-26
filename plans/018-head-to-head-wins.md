# Plan 018: Show the pair win record on the head-to-head card

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8890290..HEAD -- apps/web/src/lib/shared-games.ts apps/web/src/lib/shared-games.test.ts apps/web/src/lib/queries/shared-games.ts 'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' apps/web/src/components/stats/head-to-head-card.tsx apps/web/src/lib/queries/rivalries.ts apps/web/src/lib/api-payloads.ts apps/web/src/lib/api-payloads.test.ts 'apps/web/src/app/(tabs)/classement/page.tsx' apps/web/src/app/api/leaderboard/route.ts apps/web/src/components/stats/rivalry-tile.tsx apps/web/src/components/stats/leaderboard-screen.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S (steps 1–4) / M (with optional step 5)
- **Risk**: LOW
- **Depends on**: none (builds on shipped plans 003 and 006; no plan file is pending)
- **Category**: direction
- **Planned at**: commit `8890290`, 2026-07-26

## Why this matters

The friend-profile page (`/amis/[userId]`) already shows a « Face à face » card,
but it only reports dégommages exchanged (« X t’a dégommé 3 fois »). Playtesters
naturally ask the next question — *who actually wins between us?* — and the data
to answer it is already loaded in memory on that exact page: the shared-games
query selects `games.winnerId` for every finished game the pair played together.
Completing the card with a win record (« 12 parties ensemble — tu en as gagné 7,
Obélix en a gagné 4 ») turns a half-stat into the rivalry summary players
expect, at the cost of a pure reduce over rows we already fetch. No new SQL, no
new endpoint, no schema change for the core deliverable.

## Current state

All excerpts below were read at commit `8890290`. Line numbers are exact at
that commit.

### Relevant files

- `apps/web/src/lib/queries/rivalries.ts` — db query layer for « qui dégomme
  qui »; exports `HeadToHead`, `sharedFinishedGameIds`, `getHeadToHead`,
  `getRivalrySpotlight`.
- `apps/web/src/lib/queries/shared-games.ts` — db query for « Vos parties
  ensemble » on the friend profile; already selects `games.winnerId`.
- `apps/web/src/lib/shared-games.ts` — the PURE, db-free helpers behind that
  query (`filterSharedGames`, `resolveMyResult`, `durationSeconds`). New pure
  logic goes here so it is unit-testable.
- `apps/web/src/lib/shared-games.test.ts` — co-located vitest tests for the
  above; the structural model for the new tests.
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — server component of the
  friend profile; calls `getHeadToHead` and `getSharedGames` side by side.
- `apps/web/src/components/stats/head-to-head-card.tsx` — renders the two
  dégommage sentences; gains the win-record line.
- (optional step 5 only) `apps/web/src/lib/api-payloads.ts`,
  `apps/web/src/app/api/leaderboard/route.ts`,
  `apps/web/src/app/(tabs)/classement/page.tsx`,
  `apps/web/src/components/stats/rivalry-tile.tsx`,
  `apps/web/src/components/stats/leaderboard-screen.tsx`,
  `apps/web/src/lib/api-payloads.test.ts`.

### `getHeadToHead` returns only dealt/taken

`apps/web/src/lib/queries/rivalries.ts:13-18` and `:106-112`:

```ts
export interface HeadToHead {
  /** Non-undone degommages the viewer dealt to the other player. */
  dealt: number
  /** Non-undone degommages the other player dealt to the viewer. */
  taken: number
}
// ...
export async function getHeadToHead(viewerId: string, opponentId: string): Promise<HeadToHead> {
  const gameIds = await sharedFinishedGameIds(viewerId, opponentId)
  const rows = await loadRivalryEvents(gameIds)
  const found = aggregatePairCounts(rows, viewerId).find((p) => p.opponentId === opponentId)

  return { dealt: found?.dealt ?? 0, taken: found?.taken ?? 0 }
}
```

Do NOT modify this function or interface. The win record comes from the
shared-games query, not from here.

### `getSharedGames` already has `winnerId` in memory — but caps at 20

`apps/web/src/lib/queries/shared-games.ts:8-9` and `:17-46`:

```ts
/** Newest-first cap, mirroring the home history list (design §5.2, « mes 20 dernières parties »). */
const SHARED_GAMES_LIMIT = 20
// ...
export async function getSharedGames(viewerId: string, friendId: string): Promise<HomeGame[]> {
  const sharedIds = await sharedFinishedGameIds(viewerId, friendId)
  if (sharedIds.length === 0) return []

  // The viewer's finished games, newest first — same filters as getLastGames.
  const viewerRows = await db
    .select({
      id: games.id,
      outcome: games.outcome,
      winnerId: games.winnerId,
      // ... winnerUsername, format, startedAt, endedAt
    })
    // ... joins + where: gamePlayers.status in ('joined','left'),
    //     games.status = 'finished', gameStarted
    .orderBy(sql`${games.endedAt} desc nulls last`)

  const shared = filterSharedGames(viewerRows, new Set(sharedIds), SHARED_GAMES_LIMIT)
  if (shared.length === 0) return []
```

**Critical detail**: `viewerRows` is uncapped (every finished game of the
viewer), and `sharedIds` is the full shared set. The 20-game cap is applied by
`filterSharedGames` only for the *displayed list*. The win record MUST be
computed over the FULL shared set (uncapped), otherwise records silently freeze
at 20 games. Both inputs are already in memory before the cap — compute the
record there.

### The pure-helper convention (and the aborted-games convention)

`apps/web/src/lib/shared-games.ts:1-37` (excerpt):

```ts
/**
 * Pure pieces of the « Vos parties ensemble » query, kept db-free so they are
 * unit-testable (apps/web/vitest.config.ts runs with no database, no env vars).
 */

/** Keeps, in input order, the rows whose game is also one of `otherGameIds`, capped at `limit`. */
export function filterSharedGames<T extends { id: string }>(
  rows: readonly T[],
  otherGameIds: ReadonlySet<string>,
  limit: number
): T[] { /* ... */ }

/** Result of a finished game from `viewerId`'s point of view. */
export function resolveMyResult(
  outcome: 'village_reached' | 'aborted' | null,
  winnerId: string | null,
  viewerId: string
): HomeGameResult {
  if (outcome === 'aborted') return 'aborted'
  return winnerId === viewerId ? 'won' : 'lost'
}
```

Aborted-games convention for this feature: aborted games appear in the shared
list (with an `aborted` badge) and are counted in « parties ensemble », but
count as a win for nobody — exactly `resolveMyResult`'s semantics. Reuse
`resolveMyResult` for the record so both stay in lockstep. (For contrast, the
*dégommage* counters deliberately include aborted games — see the doc comment
on `finishedGameIdsFor` in `apps/web/src/lib/queries/rivalries.ts:42-47`:
« toutes parties finies confondues, abandons inclus ». Do not conflate the two
conventions.)

### The friend-profile page calls both queries side by side

`apps/web/src/app/(tabs)/amis/[userId]/page.tsx:44-48` and `:76-78`:

```tsx
  const [stats, headToHead, sharedGames] = await Promise.all([
    getPlayerStats(userId),
    isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
    isSelf ? Promise.resolve([]) : getSharedGames(me.id, userId),
  ])
// ...
      {headToHead ? (
        <HeadToHeadCard username={profile.username} headToHead={headToHead} />
      ) : null}
```

The friends-only gate lives just above (`:27-42`): `if (!isSelf && !(await
areFriends(me.id, userId)))` renders an `EmptyState` and returns early. Do NOT
touch that gate.

This page is a plain server component — it is NOT one of the TanStack-cached
tab payloads. `apps/web/src/lib/api-payloads.ts:5-11` documents the rule:

```ts
/**
 * Wire shapes of the tab data endpoints (`/api/home`, `/api/invites`,
 * `/api/friends`, `/api/leaderboard`). They mirror the server query return
 * types with every `Date` flattened to an ISO string, so the JSON a client
 * query receives is byte-identical to the `initialData` the server component
 * seeds it with.
 */
```

Steps 1–4 touch none of those four endpoints, so no payload schema changes are
needed for the core deliverable. Only the optional step 5 (a /classement
surface) enters payload territory — and then the byte-identity rule applies:
the server component's `initialData` and the JSON route must be built from the
same fields, updated together.

### The card as it renders today

`apps/web/src/components/stats/head-to-head-card.tsx:12-36` (full body):

```tsx
export function HeadToHeadCard({ username, headToHead }: HeadToHeadCardProps) {
  const isEmpty = headToHead.dealt === 0 && headToHead.taken === 0

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Face à face</p>
      {isEmpty ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Aucun dégommage entre vous pour l’instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="sword" size={14} />
            {username} t’a dégommé {headToHead.taken} fois
          </p>
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="sword" size={14} />
            Tu l’as dégommé {headToHead.dealt} fois
          </p>
        </div>
      )}
    </Card>
  )
}
```

### FFA semantics — the French label must stay honest

Games are 2–4 player free-for-all. « Une victoire contre X » does not exist:
a game has ONE winner among up to four players. So `winsMine` = shared games
the viewer won, `winsTheirs` = shared games the friend won, and a game won by a
*third* player counts in `played` but in neither win counter (as does an
aborted game). Therefore `winsMine + winsTheirs` may be `< played` — that is
correct, not a bug. The label must state per-player wins, never a head-to-head
score like « 7 victoires à 4 » (which would falsely imply direct duels). The
wording mandated by this plan:

- `played > 0`: « {played} partie(s) ensemble — tu en as gagné {winsMine},
  {username} en a gagné {winsTheirs} »
- `played === 0`: « Aucune partie ensemble pour l’instant. »

(« gagné » stays invariable: with the pronoun « en », the past participle does
not agree.)

### Repo conventions that apply

- French UI strings with typographic apostrophes (`’`) and French quotes
  (`« »`) in comments/labels — see every excerpt above. ALL code (identifiers,
  comments, commit messages) in English.
- Pure logic lives in `apps/web/src/lib/*.ts` with co-located `*.test.ts`;
  `apps/web/vitest.config.ts` runs `environment: 'node'` with no jsdom, no
  database, no env vars — so tests must import only pure functions, never
  `@/lib/db` or React components.
- Conventional commits, e.g. `8890290 feat(web): cap home history at four
  games with a full history page`.

## Commands you will need

Run from the repo root
(`/Users/tristanhourtoulle/.superset/worktrees/c44a0b7e-07e6-44fb-9d63-470bb876c5b7/analyze-specs-characters`
or wherever this repo is checked out — always the directory containing
`pnpm-workspace.yaml`).

| Purpose   | Command                                          | Expected on success            |
|-----------|--------------------------------------------------|--------------------------------|
| Install   | `pnpm install`                                   | exit 0 (only if deps missing)  |
| Typecheck | `pnpm --filter web typecheck`                    | exit 0, no output after `tsc --noEmit` |
| Lint      | `pnpm --filter web lint`                         | exit 0                         |
| Tests     | `pnpm --filter web test`                         | exit 0, all files pass         |
| One file  | `pnpm --filter web test -- src/lib/shared-games.test.ts` | exit 0, that file passes |

(All verified against this repo: the web package is `@degommix/web`, and
`pnpm --filter web typecheck` was run successfully at planning time.)

## Scope

**In scope** (the only files you may modify):

Core (steps 1–4):
- `apps/web/src/lib/shared-games.ts`
- `apps/web/src/lib/shared-games.test.ts`
- `apps/web/src/lib/queries/shared-games.ts`
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`
- `apps/web/src/components/stats/head-to-head-card.tsx`

Optional step 5 only (skip these entirely if you skip step 5):
- `apps/web/src/lib/queries/rivalries.ts`
- `apps/web/src/lib/api-payloads.ts`
- `apps/web/src/lib/api-payloads.test.ts`
- `apps/web/src/app/(tabs)/classement/page.tsx`
- `apps/web/src/app/api/leaderboard/route.ts`
- `apps/web/src/components/stats/rivalry-tile.tsx`
- `apps/web/src/components/stats/leaderboard-screen.tsx`

Plus the `plans/README.md` status row at the very end.

**Out of scope** (do NOT touch, even though they look related):
- The friends gate in `amis/[userId]/page.tsx` (`areFriends` check, lines
  27–42) — security boundary, must stay byte-identical.
- `getHeadToHead`, the `HeadToHead` interface, `finishedGameIdsFor`,
  `sharedFinishedGameIds`, `loadRivalryEvents` in
  `apps/web/src/lib/queries/rivalries.ts` — the dégommage counters keep their
  own aborted-games convention. (Step 5 ADDS a function to this file; it never
  edits the existing ones.)
- `apps/web/src/lib/rivalries.ts` (`aggregatePairCounts` etc.) — already
  correct and tested; step 5 only calls it.
- `apps/web/src/lib/queries/game-filters.ts` (`gameStarted`) — shared filter.
- `apps/web/src/hooks/use-tab-data.ts`, `apps/web/src/lib/query-keys.ts`, any
  ws invalidation code — the leaderboard hook revalidates the whole payload;
  step 5 rides that for free.
- `/api/home`, `/api/invites`, `/api/friends` payload schemas — untouched even
  in step 5.
- `packages/**` — no game-core or db schema change is needed.

## Git workflow

- Branch off the current branch (`fix/ui-polish-home-history-avatar` at
  planning time) or, if starting fresh, `feat/head-to-head-wins` from `main`.
- One commit per step (or steps 1–2 together), conventional style, e.g.:
  - `feat(web): pair win record computed from shared games`
  - `feat(web): show win record line on the head-to-head card`
  - `feat(web): rivalry pairs list on the leaderboard` (step 5 only)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the pure `computeSharedRecord` helper with tests

In `apps/web/src/lib/shared-games.ts`, add (below `resolveMyResult`, reusing
it — do not duplicate its outcome logic):

```ts
/** Win record of the viewer/friend pair over their shared finished games. */
export interface SharedGamesRecord {
  /** Shared finished games, aborted included. */
  played: number
  /** Shared games the viewer won. */
  winsMine: number
  /** Shared games the friend won. Wins by third players count in neither. */
  winsTheirs: number
}

/**
 * Reduces the viewer's finished-game rows to the pair record, over the FULL
 * shared set (never the 20-row display cap). FFA semantics: one winner per
 * game, so winsMine + winsTheirs can be smaller than played (third-player
 * wins and aborted games count for nobody).
 */
export function computeSharedRecord<
  T extends {
    id: string
    outcome: 'village_reached' | 'aborted' | null
    winnerId: string | null
  },
>(
  rows: readonly T[],
  sharedGameIds: ReadonlySet<string>,
  viewerId: string,
  friendId: string
): SharedGamesRecord {
  let played = 0
  let winsMine = 0
  let winsTheirs = 0
  for (const row of rows) {
    if (!sharedGameIds.has(row.id)) continue
    played += 1
    if (resolveMyResult(row.outcome, row.winnerId, viewerId) === 'won') winsMine += 1
    else if (resolveMyResult(row.outcome, row.winnerId, friendId) === 'won') winsTheirs += 1
  }
  return { played, winsMine, winsTheirs }
}
```

In `apps/web/src/lib/shared-games.test.ts`, add a `describe('computeSharedRecord', ...)`
block modeled on the existing `describe('filterSharedGames', ...)` (same file,
lines 4–38). Cases to cover — see Test plan for the full list.

**Verify**: `pnpm --filter web test -- src/lib/shared-games.test.ts` → exit 0,
new tests listed as passing.
Then `pnpm --filter web typecheck` → exit 0.

### Step 2: Return the record from `getSharedGames`

In `apps/web/src/lib/queries/shared-games.ts`:

1. Import the new pieces: change the `@/lib/shared-games` import to
   `{ computeSharedRecord, durationSeconds, filterSharedGames, resolveMyResult, type SharedGamesRecord }`.
2. Add the result shape and change the signature:

```ts
export interface SharedGamesResult {
  games: HomeGame[]
  record: SharedGamesRecord
}

export async function getSharedGames(
  viewerId: string,
  friendId: string
): Promise<SharedGamesResult> {
```

3. Inside the function:
   - The early return for `sharedIds.length === 0` becomes
     `return { games: [], record: { played: 0, winsMine: 0, winsTheirs: 0 } }`.
   - After `viewerRows` is fetched, build the set ONCE and compute the record
     BEFORE the cap:

     ```ts
     const sharedIdSet = new Set(sharedIds)
     const record = computeSharedRecord(viewerRows, sharedIdSet, viewerId, friendId)
     const shared = filterSharedGames(viewerRows, sharedIdSet, SHARED_GAMES_LIMIT)
     if (shared.length === 0) return { games: [], record }
     ```

   - The final `return shared.map((row) => ({...}))` becomes
     `return { games: shared.map((row) => ({ /* unchanged mapping */ })), record }`.
   - Do NOT change the two SQL queries, their filters, or the `HomeGame`
     mapping in any other way.

`getSharedGames` has exactly one caller (verified at planning time with
`grep -rn "getSharedGames" apps/web/src --include="*.ts*"`):
`apps/web/src/app/(tabs)/amis/[userId]/page.tsx`. Re-run that grep; if a second
caller has appeared, STOP (see STOP conditions).

**Verify**: `pnpm --filter web typecheck` → FAILS with an error in
`amis/[userId]/page.tsx` only (the caller still expects `HomeGame[]`). That is
the expected intermediate state; step 3 fixes it. If typecheck reports errors
in any OTHER file, STOP.

### Step 3: Thread the record through the page

In `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`:

1. Rename the third `Promise.all` slot and make the self branch `null`:

```tsx
  const [stats, headToHead, sharedResult] = await Promise.all([
    getPlayerStats(userId),
    isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
    isSelf ? Promise.resolve(null) : getSharedGames(me.id, userId),
  ])
  const sharedGames = sharedResult?.games ?? []
```

2. Pass the record to the card (both `headToHead` and `sharedResult` are null
   exactly when `isSelf`, so guard on both):

```tsx
      {headToHead && sharedResult ? (
        <HeadToHeadCard
          username={profile.username}
          headToHead={headToHead}
          record={sharedResult.record}
        />
      ) : null}
```

3. Leave everything else in the file untouched — in particular the friends
   gate (lines 27–42) and the « Vos parties ensemble » section, which keeps
   consuming `sharedGames` unchanged.

**Verify**: `pnpm --filter web typecheck` → FAILS only on
`head-to-head-card.tsx` not accepting a `record` prop (fixed in step 4), or
already passes if you did step 4 first. No errors elsewhere.

### Step 4: Render the record line in `HeadToHeadCard`

Rewrite `apps/web/src/components/stats/head-to-head-card.tsx` to:

```tsx
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import type { HeadToHead } from '@/lib/queries/rivalries'
import type { SharedGamesRecord } from '@/lib/shared-games'

interface HeadToHeadCardProps {
  /** Username of the profile being viewed (never the viewer). */
  username: string
  headToHead: HeadToHead
  record: SharedGamesRecord
}

/** « 1 partie ensemble » / « 12 parties ensemble ». */
function playedLabel(played: number): string {
  return `${played} partie${played > 1 ? 's' : ''} ensemble`
}

/** « Face à face » card: pair win record plus « qui dégomme qui ». */
export function HeadToHeadCard({ username, headToHead, record }: HeadToHeadCardProps) {
  const noDegommage = headToHead.dealt === 0 && headToHead.taken === 0

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Face à face</p>
      {record.played === 0 ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Aucune partie ensemble pour l’instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="flag" size={14} />
            {playedLabel(record.played)} — tu en as gagné {record.winsMine},{' '}
            {username} en a gagné {record.winsTheirs}
          </p>
          {noDegommage ? (
            <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
              Aucun dégommage entre vous pour l’instant.
            </p>
          ) : (
            <>
              <p className="m-0 flex items-center gap-2 text-sm">
                <Icon name="sword" size={14} />
                {username} t’a dégommé {headToHead.taken} fois
              </p>
              <p className="m-0 flex items-center gap-2 text-sm">
                <Icon name="sword" size={14} />
                Tu l’as dégommé {headToHead.dealt} fois
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
```

Notes:
- The two dégommage sentences are kept CHARACTER-IDENTICAL to today's
  (typographic `’`, same wording, same `sword` icon at size 14).
- `flag` is a valid icon name — it is already used on this very page
  (`<StatTile icon="flag" label="Winrate" ... />` and the shared-games
  `EmptyState icon="flag"`). If TypeScript rejects `"flag"`, STOP.
- Apostrophes in the new strings must be the typographic `’` (U+2019), matching
  the file's existing strings.

**Verify** (this is the core-deliverable gate):
1. `pnpm --filter web typecheck` → exit 0.
2. `pnpm --filter web lint` → exit 0.
3. `pnpm --filter web test` → exit 0, including the new
   `computeSharedRecord` tests.
4. `git status --porcelain` → only the five core in-scope files modified.

### Step 5 (OPTIONAL — SKIPPABLE): « Rivalités » pairs on /classement

**This step is explicitly optional.** The deliverable is complete after step 4.
Skip step 5 if: you are time-boxed, any of its files drifted from the excerpts,
or its payload changes cause any friction. If you skip it, mark it skipped in
your report and in the `plans/README.md` row (e.g. `DONE (step 5 skipped)`).
Do not half-do it — it lands atomically or not at all.

Goal: below the existing two-entry `RivalryTile` spotlight on `/classement`,
list every circle rivalry (dealt/taken per friend), sourced from the
`aggregatePairCounts` matrix that `getRivalrySpotlight` already computes but
throws away.

5a. **Query** — in `apps/web/src/lib/queries/rivalries.ts`, ADD (do not modify
existing functions):

```ts
export interface RivalryPair {
  userId: string
  username: string
  avatarId?: string | null
  dealt: number
  taken: number
}

/**
 * Every circle rivalry, most active first (dealt+taken desc, then username).
 * Same scope rules as getRivalrySpotlight: circle members only.
 */
export async function getRivalryPairs(viewerId: string): Promise<RivalryPair[]> {
  const [gameIds, memberIds] = await Promise.all([
    finishedGameIdsFor(viewerId),
    getCircleMemberIds(viewerId),
  ])
  const rows = await loadRivalryEvents(gameIds)
  const circle = new Set(memberIds)
  const pairs = aggregatePairCounts(rows, viewerId).filter((pair) => circle.has(pair.opponentId))
  const usernames = await loadUsernames(pairs.map((pair) => pair.opponentId))

  return pairs
    .map((pair) => {
      const identity = usernames.get(pair.opponentId)
      return {
        userId: pair.opponentId,
        username: identity?.username ?? 'Inconnu',
        avatarId: identity?.avatarId ?? null,
        dealt: pair.dealt,
        taken: pair.taken,
      }
    })
    .sort(
      (a, b) => b.dealt + b.taken - (a.dealt + a.taken) || a.username.localeCompare(b.username)
    )
}
```

(`finishedGameIdsFor`, `loadRivalryEvents`, `loadUsernames`,
`getCircleMemberIds`, `aggregatePairCounts` all already exist in that file's
scope — reuse them.)

5b. **Payload schema** — in `apps/web/src/lib/api-payloads.ts`, next to the
existing `rivalryPeerSchema` (lines 95–100), add to `leaderboardPayloadSchema`:

```ts
  /** Optional for caches persisted before this field shipped. */
  rivalryPairs: z
    .array(
      z.object({
        userId: z.string(),
        username: z.string(),
        avatarId: z.string().nullable().optional(),
        dealt: z.number(),
        taken: z.number(),
      })
    )
    .optional(),
```

`.optional()` is mandatory — it follows the documented convention for old
caches (see `lastSeenAt` in `friendsPayloadSchema`, `api-payloads.ts:89`, and
the legacy-cache tests around `api-payloads.test.ts:228`).

5c. **Both producers, together (byte-identity rule)** — the server component
and the JSON route must emit the same fields:

- `apps/web/src/app/(tabs)/classement/page.tsx` — extend the `Promise.all` to
  `[getLeaderboard(user.id), getRivalrySpotlight(user.id), getRivalryPairs(user.id)]`
  and pass `initialData={{ ...leaderboard, rivalry, rivalryPairs }}`.
- `apps/web/src/app/api/leaderboard/route.ts` — same three-way `Promise.all`,
  `const payload: LeaderboardPayload = { ...leaderboard, rivalry, rivalryPairs }`.

5d. **UI** — `apps/web/src/components/stats/rivalry-tile.tsx`: add an optional
prop `pairs?: RivalryPair[]` (import the type from
`@/lib/queries/rivalries`). When `pairs` is non-empty, render under the
existing two-column grid a list block: `sec-label` « Rivalités », then one row
per pair — `PlayerAvatar` (size 24, import from `@/components/ui/player-avatar`
— it takes `username`, `size`, `avatarId`, see its use in
`amis/[userId]/page.tsx:60`), bold truncated username, and a right-aligned
`text-xs text-ink-soft` count line « {taken} subi(s) · {dealt} donné(s) »
(pluralize both with `s` when `> 1`). Keep the existing `return null` when
there is no spotlight AND no pairs. In
`apps/web/src/components/stats/leaderboard-screen.tsx:52`, pass
`<RivalryTile rivalry={leaderboard.rivalry} pairs={leaderboard.rivalryPairs} />`.
(`rivalryPairs` is possibly `undefined` from an old cache — the prop is
optional, so that is fine.)

5e. **Payload tests** — in `apps/web/src/lib/api-payloads.test.ts`, extend the
leaderboard cases: a payload WITH `rivalryPairs` parses and round-trips; a
legacy payload WITHOUT it still parses (model on the existing legacy-cache
test at line 228).

**Verify**: `pnpm --filter web typecheck` → exit 0;
`pnpm --filter web lint` → exit 0; `pnpm --filter web test` → exit 0 including
the new api-payloads cases; `git status --porcelain` → only in-scope files.

## Test plan

New tests in `apps/web/src/lib/shared-games.test.ts`,
`describe('computeSharedRecord', ...)`, modeled on the existing
`describe('filterSharedGames', ...)` block in the same file (plain
Arrange-Act-Assert, no mocks — pure functions only; the web vitest config has
no jsdom and no db, so never import components or `@/lib/db` in tests).

Cases (use row literals like
`{ id: 'a', outcome: 'village_reached' as const, winnerId: 'me' }`):

1. Happy path: mixed rows → correct `{ played, winsMine, winsTheirs }`.
2. Rows not in `sharedGameIds` are ignored entirely (not even `played`).
3. A shared game won by a THIRD player increments `played` only (FFA rule).
4. An aborted shared game (`outcome: 'aborted'`, any `winnerId` including
   non-null) increments `played` only — mirrors `resolveMyResult`.
5. Uncapped: 25 shared winning rows → `played: 25`, `winsMine: 25` (proves the
   record ignores the 20-game display cap).
6. Empty rows / empty shared set → `{ played: 0, winsMine: 0, winsTheirs: 0 }`.
7. `outcome: null` with `winnerId: 'me'` → counts as a viewer win
   (resolveMyResult's fallback branch).

If step 5 is done: the two `api-payloads.test.ts` cases from 5e (with-field
round-trip, legacy-cache without-field).

Verification: `pnpm --filter web test` → all pass, including ≥ 7 new
`computeSharedRecord` tests (and the 2 payload tests if step 5 was done).
There is no component-render test — the card is covered by typecheck plus the
pure-function tests, which is this repo's established pattern.

## Done criteria

Machine-checkable. ALL must hold (from the repo root):

- [ ] `pnpm --filter web typecheck` exits 0
- [ ] `pnpm --filter web lint` exits 0
- [ ] `pnpm --filter web test` exits 0; `describe('computeSharedRecord')`
      exists in `apps/web/src/lib/shared-games.test.ts` with ≥ 7 passing cases
- [ ] `grep -n "computeSharedRecord" apps/web/src/lib/queries/shared-games.ts`
      → at least one match (record computed in the query)
- [ ] `grep -n "record" apps/web/src/components/stats/head-to-head-card.tsx`
      → matches (card receives and renders the record)
- [ ] `grep -n "parties ensemble" apps/web/src/components/stats/head-to-head-card.tsx`
      → at least one match (French record line present)
- [ ] `grep -n "areFriends" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"`
      → still exactly one gate call; `git diff 8890290..HEAD -- 'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' | grep -c "areFriends"`
      → 0 (gate untouched)
- [ ] `git status --porcelain` shows no modified files outside the in-scope
      list (core list if step 5 skipped; core + optional list if done)
- [ ] If step 5 was SKIPPED:
      `git diff --name-only 8890290..HEAD -- apps/web/src/lib/api-payloads.ts apps/web/src/app/api/leaderboard/route.ts`
      → empty (no payload drift without its consumers)
- [ ] If step 5 was DONE: `grep -n "rivalryPairs" apps/web/src/lib/api-payloads.ts "apps/web/src/app/(tabs)/classement/page.tsx" apps/web/src/app/api/leaderboard/route.ts`
      → matches in ALL three files (byte-identity: both producers updated)
- [ ] `plans/README.md` status row for 018 updated (note whether step 5 was
      done or skipped)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes in any in-scope file AND the "Current state"
  excerpts no longer match the live code (e.g. `getSharedGames` no longer
  selects `winnerId`, or its return type already changed).
- `grep -rn "getSharedGames" apps/web/src --include="*.ts*"` reveals a caller
  other than `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — the signature
  change in step 2 would break it; the plan assumed a single caller.
- After step 2, `pnpm --filter web typecheck` reports errors in any file other
  than `amis/[userId]/page.tsx` / `head-to-head-card.tsx`.
- TypeScript rejects `icon="flag"` or `name="flag"` — the icon set drifted;
  do not invent a replacement icon.
- Completing the card seems to require editing `getHeadToHead`, the
  `HeadToHead` interface, or the friends gate — all three are out of scope by
  design.
- (Step 5) Any of `leaderboardPayloadSchema`, `LeaderboardScreen`,
  `RivalryTile`, or `/api/leaderboard/route.ts` no longer matches its excerpt,
  or the schema change breaks an existing api-payloads legacy-cache test you
  cannot fix by making the new field `.optional()`. In that case abandon step
  5 cleanly (revert its files), keep steps 1–4, and report.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The 20-game cap trap**: `computeSharedRecord` deliberately runs on the
  UNCAPPED `viewerRows`. If someone later pushes `SHARED_GAMES_LIMIT` into the
  SQL (`limit 20` on the viewer-rows query) to save memory, the record breaks
  silently. Test case 5 guards this at the pure-function level, but the query
  wiring itself is untested (no db in vitest) — a reviewer must check the call
  order in `getSharedGames`: set built once, record computed BEFORE
  `filterSharedGames`.
- **Two aborted-games conventions coexist**: dégommage counters include
  aborted games (« abandons inclus », rivalries.ts §5.3 comment); win records
  exclude them via `resolveMyResult`. Both are intentional. Any future
  « stats » work must pick the right one per metric.
- **Reviewer focus**: the French strings (typographic apostrophes, plural
  rules, the FFA-honest wording — never « X victoires à Y »), and that the
  friends gate diff is empty.
- **Deferred on purpose**: making the friend-profile page a TanStack-cached
  tab payload (it stays a plain server component — fine, it is not a tab);
  linking each « Rivalités » row (step 5) to `/amis/[userId]`; showing the
  record inside the shared-games list header. Revisit only on demand.
- If step 5 was skipped, the finding's optional half remains open — a future
  plan can lift step 5 verbatim; its excerpts will need re-verification first.
