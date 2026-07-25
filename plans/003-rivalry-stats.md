# Plan 003: Surface rivalry stats — « qui dégomme qui » — on the friend profile and the Classement

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 094ddfd..HEAD -- \
>   apps/web/src/lib/queries/stats.ts \
>   apps/web/src/lib/api-payloads.ts \
>   apps/web/src/app/api/leaderboard/route.ts \
>   'apps/web/src/app/(tabs)/classement/page.tsx' \
>   'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' \
>   apps/web/src/components/stats \
>   apps/web/src/components/live \
>   apps/ws-server/src/finalize.ts \
>   apps/ws-server/src/game-manager.ts \
>   packages/game-core/src
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

Dégommix is pitched, in its own spec, as « Le classement officieux de vos parties
de petits chevaux Astérix — **qui dégomme qui**, qui tient le village »
(`SPECS.md:3`). The database already records *who dégommed whom*: every
`DEGOMMAGE` row in `game_events` carries both `actor_id` and `target_id`. But
nothing in the product ever reads the target side — every surfaced number is
"dégommages **dealt**". The half of the tagline that makes a private
friends-circle app fun (rivalries, "ma bête noire") is stored and thrown away.

This plan adds one read-only aggregation over existing data (no schema change, no
new write path) and two small surfaces: a « Face à face » card on a friend's
profile, and a « Rivalités » tile on the Classement. Nothing about game play,
scoring or authorization changes.

## Current state

### Files that matter

- `packages/db/src/schema/games.ts` — Drizzle schema. `game_events` holds
  `actorId` + `targetId` (lines 78–97).
- `apps/web/src/lib/queries/stats.ts` — leaderboard + game-detail queries. The
  **only** place in the whole web app that reads `gameEvents` (lines 330–341,
  inside `getGameDetail`, to render the per-game journal). Verified with
  `grep -rn "gameEvents" apps/web/src` → matches only in this file.
- `apps/web/src/lib/queries/friends.ts` — `getPlayerStats` (lines 163–216):
  wins / winrate / degommages / favorite character. All dealt-side.
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — friend profile page (server
  component): friendship guard, 3 stat tiles, fetish character, back link.
- `apps/web/src/components/stats/leaderboard-screen.tsx` — client shell of the
  Classement, fed by the `leaderboard` TanStack query.
- `apps/ws-server/src/finalize.ts` — writes the per-seat aggregate
  `game_players.degommages` at close. **This plan's aggregation must agree with
  it.**
- `packages/game-core/src/reducer.ts` — the reducer that produces the numbers
  `finalize.ts` persists.

### How `game_players.degommages` is computed today (the rule to mirror)

`apps/ws-server/src/finalize.ts:11-31` — the closing transaction copies the
reducer's in-memory counter, it does not run any SQL aggregation:

```ts
export async function finalizeGame(
  tx: DbTransaction,
  gameId: string,
  state: GameState
): Promise<void> {
  await tx.update(games).set({ status: 'finished', outcome: state.outcome, ... })
  for (const player of Object.values(state.players)) {
    await tx
      .update(gamePlayers)
      .set({ degommages: player.degommages })
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, player.userId)))
  }
}
```

That counter comes from `packages/game-core/src/reducer.ts:40-69`:

```ts
    case 'DEGOMMAGE': {
      const actor = state.players[event.actorId]
      if (!actor) return base
      return { ...base,
        players: { ...state.players, [event.actorId]: { ...actor, degommages: actor.degommages + 1 } },
        degommageLog: [...state.degommageLog, { seq: event.seq, actorId: event.actorId, targetId: event.targetId }],
      }
    }
    case 'UNDO': {
      const targetSeq = event.payload.targetSeq
      const entry = state.degommageLog.find((d) => d.seq === targetSeq)
      if (!entry || state.undoneSeqs.has(targetSeq)) return base
      const actor = state.players[entry.actorId]
      if (!actor) return base
      return { ...base, undoneSeqs: new Set([...state.undoneSeqs, targetSeq]),
        players: { ...state.players, [entry.actorId]: { ...actor, degommages: actor.degommages - 1 } } }
    }
```

`packages/game-core/src/types.ts:26` — an `UNDO` event points at the undone
degommage by sequence number: `payload: { targetSeq: number }`.

**Therefore the exclusion rule this plan must implement is:**

> A `DEGOMMAGE` row at `(game_id = G, seq = S)` counts **unless** there exists an
> `UNDO` row in the **same game** `G` whose `payload->>'targetSeq'` equals `S`.

That is exactly equivalent to the reducer, because the server never persists a
useless `UNDO`: `apps/ws-server/src/game-manager.ts:248-253` resolves the target
before writing, and refuses when there is nothing to undo —

```ts
    case 'undo': {
      const targetSeq = resolveUndoTarget(state)
      if (targetSeq === null) throw new CommandError('NOTHING_TO_UNDO')
      return [
        { seq: next(), createdAt, type: 'UNDO', actorId, targetId: null, payload: { targetSeq } },
      ]
    }
```

and `resolveUndoTarget` (`packages/game-core/src/reducer.ts:137-143`) only ever
returns the seq of an existing, not-yet-undone degommage. Consequences you may
rely on: **at most one `UNDO` per degommage seq**, and every persisted `UNDO`
targets a real `DEGOMMAGE` of the same game. Every command is validated before
persistence (`game-manager.ts:113-119`) and system events are refused once the
game is finished (`game-manager.ts:130`), so no post-close events exist.

### Circle scoping (reuse it, do not invent one)

`SPECS.md:86`: « **Profil et stats visibles par les amis uniquement.** »
Design doc `docs/superpowers/specs/2026-07-25-degommix-design.md:314`:
« **Périmètre du classement** : lignes = moi + mes amis. Un inconnu croisé via
code n'apparaît jamais (mais ses actions restent dans les stats de chaque
partie). »

The leaderboard implements that with a module-private helper —
`apps/web/src/lib/queries/stats.ts:56-65`:

```ts
async function getCircleMemberIds(userId: string): Promise<string[]> {
  const pairs = await db
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))

  const ids = new Set<string>([userId])
  for (const pair of pairs) ids.add(pair.low === userId ? pair.high : pair.low)
  return [...ids]
}
```

Step 3 exports this function and reuses it — **do not write a second friendship
query**. Opponents outside the circle (strangers who joined by code) must never
be named in the new UI.

### Repo conventions that apply here

- **Query layer**: server-only functions in `apps/web/src/lib/queries/*.ts`,
  importing `db` from `@/lib/db` and Drizzle helpers re-exported by
  `@degommix/db`. Exported result types are `interface`s with JSDoc, French-free
  identifiers. Exemplars: `apps/web/src/lib/queries/home.ts:118-188`
  (`getLastGames`) and `stats.ts:68-190` (`getLeaderboard`).
- **Parameterized `IN (...)` list**: the repo builds it with `sql.join`; copy the
  pattern from `apps/web/src/lib/queries/home.ts:144-160`:

  ```ts
  const gameIdList = sql.join(
    gameRows.map((row) => sql`${row.id}`),
    sql`, `,
  )
  // ... .where(and(sql`${gamePlayers.gameId} in (${gameIdList})`, ...))
  ```

  Never string-concatenate ids into SQL. `sql.join` over an **empty** array
  produces invalid SQL — guard with an early return (see Step 3).
- **Tab payloads**: `/api/*` route handlers return the exact shape the server
  component seeds into TanStack Query, validated by a Zod schema in
  `apps/web/src/lib/api-payloads.ts` (`leaderboardPayloadSchema`, lines 73–93).
  Any field added to the leaderboard payload must be added to that schema too,
  or the client refetch will strip it.
- **Pure helpers with co-located unit tests**: `apps/web/src/lib/chrono.ts` +
  `chrono.test.ts`, `apps/web/src/lib/ws-errors.ts` + `ws-errors.test.ts`.
  `apps/web/vitest.config.ts` runs `src/**/*.test.ts` in a plain `node`
  environment with **no** database and **no** env vars. A test file must
  therefore never (even transitively) import `@/lib/db`, because
  `apps/web/src/lib/env.ts:10` does `schema.parse(process.env)` at module load
  and would throw. **This is why the aggregation logic lives in a db-free
  module** (`apps/web/src/lib/rivalries.ts`) and the query wrapper lives
  separately (`apps/web/src/lib/queries/rivalries.ts`).
- **UI**: French user-facing copy, English identifiers/comments. Cards use
  `Card` from `@/components/ui/card` (adds the `card` class) plus Tailwind
  utilities; a small section label uses `<p className="sec-label">`
  (`apps/web/src/app/globals.css:353`). Icon set is closed —
  `apps/web/src/components/icons.tsx:142` (`export type IconName = keyof typeof paths`);
  available names include `sword`, `trophy`, `flag`, `users`, `pawn`, `timer`.
  Exemplar tile to imitate: `apps/web/src/components/stats/top-degommeur-tile.tsx`.
- **Typographic apostrophe**: the codebase writes `’` (U+2019) inside strings
  (`stats.ts:276` « Partie clôturée automatiquement après 24 h d’inactivité »)
  and `&apos;` inside JSX text (`parties/[gameId]/page.tsx:92`). Match that.

### The two surfaces as they exist today

`apps/web/src/app/(tabs)/amis/[userId]/page.tsx:16-66` (guard + tiles):

```tsx
export default async function FriendProfilePage({ params }: FriendProfilePageProps) {
  const { userId } = await params
  const { user: me } = await requireOnboardedSession()

  const profile = await getPublicUser(userId)
  if (!profile) notFound()

  const isSelf = userId === me.id
  if (!isSelf && !(await areFriends(me.id, userId))) {
    return ( /* « Profil réservé aux amis » EmptyState + « Retour aux amis » */ )
  }

  const stats = await getPlayerStats(userId)
  ...
      <div className="stat-row">
        <StatTile icon="trophy" label="Victoires" value={stats.wins} />
        <StatTile icon="flag" label="Winrate" value={winrateLabel} />
        <StatTile icon="sword" label="Dégommages" value={stats.degommages} />
      </div>
```

`apps/web/src/components/stats/leaderboard-screen.tsx:41-48`:

```tsx
  return (
    <main className="tab-page">
      <SectionTitle sub="Le cercle d'amis au grand complet">Classement</SectionTitle>

      {leaderboard.topDegommeur ? <TopDegommeurTile top={leaderboard.topDegommeur} /> : null}

      <RankingTable rows={leaderboard.rows} viewerId={viewerId} />
```

`apps/web/src/app/(tabs)/classement/page.tsx:7-12` (SSR seed) and
`apps/web/src/app/api/leaderboard/route.ts:14-22` (JSON twin) both hand
`getLeaderboard(userId)` straight through as the payload.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (whole repo) | `pnpm typecheck` | exit 0, no errors |
| Lint (whole repo) | `pnpm lint` | exit 0 |
| Web unit tests only | `pnpm --filter @degommix/web test` | exit 0, all files pass |
| One web test file | `pnpm --filter @degommix/web exec vitest run src/lib/rivalries.test.ts` | exit 0, all tests pass |
| game-core tests only | `pnpm --filter @degommix/game-core test` | exit 0 |
| Test DB (needed by `packages/db` + `apps/ws-server` suites only) | `docker compose -f docker-compose.test.yml up -d` | container running |
| Full test suite (serialized — the DB suites share one database) | `pnpm exec turbo run test --concurrency=1` | exit 0 |

Node ≥ 22, pnpm 11.13.1, Turborepo. If Docker is unavailable in your
environment, run the two filtered suites above instead of the full one and say
so in your report — do **not** try to make the DB-backed suites pass without a
database.

## Suggested executor toolkit

- Invoke `superpowers:verification-before-completion` before claiming done:
  paste real command output, never a summary.
- If a Drizzle API detail is unclear (`sql` template, `inArray`, jsonb access),
  fetch current docs with Context7 (`mcp__context7__resolve-library-id` →
  `query-docs` for `drizzle-orm`) rather than guessing.
- Reference docs already in the repo: `SPECS.md` §Amis / §Stats and
  `docs/superpowers/specs/2026-07-25-degommix-design.md` §5.2–5.3.

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/lib/rivalries.ts` (create) — pure aggregation, no db import
- `apps/web/src/lib/rivalries.test.ts` (create) — unit tests
- `apps/web/src/lib/queries/rivalries.ts` (create) — db-backed query functions
- `apps/web/src/lib/queries/stats.ts` (edit — **only** to add `export` to
  `getCircleMemberIds`)
- `apps/web/src/lib/api-payloads.ts` (edit — add the `rivalry` field to
  `leaderboardPayloadSchema`)
- `apps/web/src/app/api/leaderboard/route.ts` (edit)
- `apps/web/src/app/(tabs)/classement/page.tsx` (edit)
- `apps/web/src/components/stats/rivalry-tile.tsx` (create)
- `apps/web/src/components/stats/leaderboard-screen.tsx` (edit)
- `apps/web/src/components/stats/head-to-head-card.tsx` (create)
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` (edit)
- Step 7 only (OPTIONAL): `apps/web/src/components/live/player-card.tsx`,
  `apps/web/src/components/live/live-screen.tsx`

**Out of scope** (do NOT touch, even though they look related):

- `packages/db/src/schema/games.ts` and `packages/db/drizzle/*` — **no schema
  change, no migration, no new index** in this plan (see Maintenance notes).
- `apps/ws-server/**` (except reading it) — the write path, the reducer and
  `finalize.ts` stay exactly as they are. This plan is read-only over data that
  already exists.
- `packages/game-core/**` — no reducer change, no new event type.
- `apps/web/src/lib/queries/friends.ts` — `getPlayerStats` keeps its current
  shape; the head-to-head numbers arrive through a separate query so nothing
  that already renders can regress.
- `e2e/**` — no Playwright change in this plan.
- The response shape of `/api/home` and `/api/friends`.

## Git workflow

- Branch: `feat/rivalry-stats` (repo convention is `type/short-slug`; current
  branch at planning time was `fix/post-playtest-round-1`).
- Commit per step or per logical unit, Conventional Commits in English. Real
  example from `git log`:
  `feat(web): tanstack query foundation with typed payloads and tab data hooks`.
  Suggested messages: `feat(web): pair-level degommage aggregation helper`,
  `feat(web): head-to-head card on the friend profile`,
  `feat(web): rivalry tile on the leaderboard`.
- Do NOT push and do NOT open a PR unless the operator explicitly asked.

## Steps

### Step 1: Create the pure aggregation module `apps/web/src/lib/rivalries.ts`

This module must import **nothing** from `@/lib/db` (see conventions). Only
type-only imports are allowed.

Target shape:

```ts
/**
 * Pair-level degommage aggregation — the « qui dégomme qui » side of the stats.
 * Pure and db-free on purpose: `apps/web/vitest.config.ts` runs unit tests with
 * no database and no env vars.
 */

/** One `game_events` row, narrowed to what the aggregation needs. */
export interface RivalryEventRow {
  gameId: string
  seq: number
  type: string
  actorId: string | null
  targetId: string | null
  payload: unknown
}

/** Degommages exchanged between the viewer and one opponent. */
export interface PairCount {
  opponentId: string
  /** Non-undone degommages the viewer dealt to this opponent. */
  dealt: number
  /** Non-undone degommages this opponent dealt to the viewer. */
  taken: number
}

/** `{ gameId, seq }` key of every degommage cancelled by an UNDO event. */
function undoneKeys(rows: readonly RivalryEventRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.type !== 'UNDO') continue
    const targetSeq = readTargetSeq(row.payload)
    if (targetSeq !== null) keys.add(`${row.gameId}:${targetSeq}`)
  }
  return keys
}

function readTargetSeq(payload: unknown): number | null {
  if (payload !== null && typeof payload === 'object' && 'targetSeq' in payload) {
    const value = (payload as Record<string, unknown>).targetSeq
    if (typeof value === 'number') return value
  }
  return null
}

/**
 * Counts non-undone degommages between `viewerId` and every other player found
 * in `rows`. Mirrors the reducer exactly: a DEGOMMAGE counts unless an UNDO of
 * the SAME game targets its `seq` (see packages/game-core/src/reducer.ts UNDO
 * case, whose result is what apps/ws-server/src/finalize.ts persists into
 * game_players.degommages). Self-degommages are ignored. Sorted by opponentId
 * for a deterministic result.
 */
export function aggregatePairCounts(
  rows: readonly RivalryEventRow[],
  viewerId: string
): PairCount[] {
  const undone = undoneKeys(rows)
  const byOpponent = new Map<string, PairCount>()
  const entry = (opponentId: string): PairCount => { /* get-or-create */ }

  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    if (actorId === viewerId) entry(targetId).dealt += 1
    else if (targetId === viewerId) entry(actorId).taken += 1
  }

  return [...byOpponent.values()].sort((a, b) => a.opponentId.localeCompare(b.opponentId))
}

/** Opponent who dégommed the viewer the most; null when nobody ever did. */
export function pickNemesis(pairs: readonly PairCount[]): PairCount | null { ... }

/** Opponent the viewer dégommed the most; null when the viewer never did. */
export function pickFavoriteVictim(pairs: readonly PairCount[]): PairCount | null { ... }
```

`pickNemesis` / `pickFavoriteVictim` rules (implement exactly, they are tested):

- Ignore pairs whose relevant counter is `0`; return `null` if none remain.
- Highest counter wins; ties broken by the **other** counter descending, then by
  `opponentId` ascending (so the result is deterministic).

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 2: Unit-test the aggregation in `apps/web/src/lib/rivalries.test.ts`

Model the file after `apps/web/src/lib/ws-errors.test.ts` /
`apps/web/src/lib/chrono.test.ts` (`import { describe, expect, it } from 'vitest'`,
Arrange–Act–Assert, English test names). Write a tiny row factory inside the
test file; do not import anything from `@/lib/db` or `@degommix/db`.

Cases (all required):

1. `counts dealt and taken separately for one game`
2. `excludes a degommage cancelled by an UNDO targeting its seq`
3. `scopes undo exclusion to its own game` — same `seq` number in game `g2` is
   NOT excluded by an UNDO in game `g1` (this is the bug the `${gameId}:${seq}`
   key prevents)
4. `ignores degommages between two other players`
5. `ignores UNDO rows with a malformed payload` (payload `null`, `{}` or
   `{ targetSeq: 'x' }` must not throw and must not exclude anything)
6. `returns an empty array when there are no degommages`
7. `pickNemesis returns null when nobody dégommed the viewer`
8. `pickNemesis picks the highest taken count` and
   `pickFavoriteVictim picks the highest dealt count`
9. `breaks ties deterministically` (two opponents with the same counter → the
   documented tie-break)

**Verify**: `pnpm --filter @degommix/web exec vitest run src/lib/rivalries.test.ts`
→ exit 0, at least 9 tests pass.

### Step 3: Create the query layer `apps/web/src/lib/queries/rivalries.ts`

First make the circle helper reusable — in `apps/web/src/lib/queries/stats.ts`,
line 56, change exactly one word:

```ts
export async function getCircleMemberIds(userId: string): Promise<string[]> {
```

Nothing else in `stats.ts` changes. (Do **not** import anything from
`rivalries.ts` into `stats.ts` — that would create an import cycle.)

Then create `apps/web/src/lib/queries/rivalries.ts`:

```ts
import { and, eq, sql, gameEvents, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { aggregatePairCounts, pickFavoriteVictim, pickNemesis, type PairCount, type RivalryEventRow } from '@/lib/rivalries'
import { getCircleMemberIds } from './stats'

export interface HeadToHead {
  /** Non-undone degommages the viewer dealt to the other player. */
  dealt: number
  /** Non-undone degommages the other player dealt to the viewer. */
  taken: number
}

export interface RivalryPeer {
  userId: string
  username: string
  count: number
}

export interface RivalrySpotlight {
  /** Opponent who dégommed me the most (circle members only). */
  nemesis: RivalryPeer | null
  /** Opponent I dégommed the most (circle members only). */
  favoriteVictim: RivalryPeer | null
}
```

Internal helpers to write:

1. `finishedGameIdsFor(userId: string): Promise<string[]>` — ids of finished
   games where the user held a seat. Copy the join/filter shape of
   `getLastGames` (`apps/web/src/lib/queries/home.ts:118-140`), minus the
   ordering and the `limit`:

   ```ts
   const rows = await db
     .select({ id: games.id })
     .from(games)
     .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
     .where(and(
       eq(gamePlayers.userId, userId),
       sql`${gamePlayers.status} in ('joined', 'left')`,
       eq(games.status, 'finished'),
     ))
   ```

   Per design doc line 318 (« `dégommages` = somme des `DEGOMMAGE` non annulés,
   **toutes parties finies confondues, abandons inclus** ») do **not** filter on
   `games.outcome`: aborted games count for dégommages.

2. `loadRivalryEvents(gameIds: string[]): Promise<RivalryEventRow[]>` — return
   `[]` immediately when `gameIds.length === 0` (an empty `sql.join` produces
   invalid SQL), otherwise:

   ```ts
   const gameIdList = sql.join(gameIds.map((id) => sql`${id}`), sql`, `)
   return db
     .select({
       gameId: gameEvents.gameId,
       seq: gameEvents.seq,
       type: gameEvents.type,
       actorId: gameEvents.actorId,
       targetId: gameEvents.targetId,
       payload: gameEvents.payload,
     })
     .from(gameEvents)
     .where(and(
       sql`${gameEvents.gameId} in (${gameIdList})`,
       sql`${gameEvents.type} in ('DEGOMMAGE', 'UNDO')`,
     ))
   ```

   Both `DEGOMMAGE` **and** `UNDO` rows are required — the UNDO rows are what
   makes the exclusion possible.

Exported functions:

- `getHeadToHead(viewerId: string, opponentId: string): Promise<HeadToHead>`
  — intersect `finishedGameIdsFor(viewerId)` with `finishedGameIdsFor(opponentId)`
  (a `Set` intersection in TS is fine and keeps the SQL trivial), load the events
  of the shared games, run `aggregatePairCounts(rows, viewerId)`, and return the
  entry for `opponentId` or `{ dealt: 0, taken: 0 }`. Returns zeros — never
  `null` — so the caller renders a card with an empty state instead of branching.
- `getRivalrySpotlight(viewerId: string): Promise<RivalrySpotlight>`
  — events of `finishedGameIdsFor(viewerId)`; `aggregatePairCounts(rows, viewerId)`;
  **filter the pairs down to circle members** using
  `await getCircleMemberIds(viewerId)` (a `Set` lookup), so a stranger who joined
  by code is never named (design doc line 314); then `pickNemesis` /
  `pickFavoriteVictim`; resolve usernames with one query
  (`db.select({ id: user.id, username: user.username }).from(user)` restricted to
  the one or two ids you need, `user.username ?? 'Inconnu'` as the fallback —
  same fallback string as `stats.ts:146`). Return
  `{ nemesis: null, favoriteVictim: null }` when there is nothing to show.

Add a JSDoc line above each exported function saying which SPECS/design rule it
implements, matching the style of `getLeaderboard` (`stats.ts:67`).

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0, and
`pnpm --filter @degommix/web exec eslint src/lib/queries/rivalries.ts src/lib/rivalries.ts`
→ exit 0.

### Step 4: Add the « Face à face » card component

Create `apps/web/src/components/stats/head-to-head-card.tsx` — a plain server
component (no `'use client'`), modeled on
`apps/web/src/components/stats/top-degommeur-tile.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import type { HeadToHead } from '@/lib/queries/rivalries'

interface HeadToHeadCardProps {
  /** Username of the profile being viewed (never the viewer). */
  username: string
  headToHead: HeadToHead
}

/** « Qui dégomme qui » between the viewer and the friend whose profile this is. */
export function HeadToHeadCard({ username, headToHead }: HeadToHeadCardProps) { ... }
```

Exact French copy (user-facing strings are French; keep the typographic
apostrophe `’`):

- Section label: `<p className="sec-label">Face à face</p>`
- When `headToHead.dealt === 0 && headToHead.taken === 0`, a single line:
  `Aucun dégommage entre vous pour l’instant.`
  (style it like the empty fetish line of the profile page:
  `className="m-0 text-sm"` with `style={{ color: 'var(--ink-soft)' }}`)
- Otherwise two lines, each prefixed by `<Icon name="sword" size={14} />`:
  - `{username} t’a dégommé {headToHead.taken} fois`
  - `Tu l’as dégommé {headToHead.dealt} fois`
  (`fois` is invariable in French — no pluralization logic.)

Then wire it into `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`:

- Import `getHeadToHead` from `@/lib/queries/rivalries` and `HeadToHeadCard`.
- **After** the existing friendship guard (do not move, weaken or duplicate that
  guard — it is the `SPECS.md:86` friends-only rule), and only when `!isSelf`,
  fetch the head-to-head. Fetch it in parallel with the existing stats call:

  ```ts
  const [stats, headToHead] = await Promise.all([
    getPlayerStats(userId),
    isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
  ])
  ```

- Render `{headToHead ? <HeadToHeadCard username={profile.username} headToHead={headToHead} /> : null}`
  directly after the `<div className="stat-row">…</div>` block (page.tsx:62-66)
  and before the fetish-character `<section>`.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0, then
`pnpm --filter @degommix/web exec eslint src` → exit 0.

### Step 5: Add `rivalry` to the leaderboard payload

Two call sites feed the Classement and both must send the same object.

1. `apps/web/src/lib/api-payloads.ts` — inside `leaderboardPayloadSchema`
   (lines 73–93), add a `rivalry` field next to `topDegommeur`:

   ```ts
   const rivalryPeerSchema = z.object({
     userId: z.string(),
     username: z.string(),
     count: z.number(),
   })
   // ... inside leaderboardPayloadSchema:
     rivalry: z.object({
       nemesis: rivalryPeerSchema.nullable(),
       favoriteVictim: rivalryPeerSchema.nullable(),
     }),
   ```

   No serializer change is needed: `RivalrySpotlight` contains no `Date`, so the
   JSON is identical to the SSR object (that invariant is documented at
   `api-payloads.ts:5-10`).

2. `apps/web/src/app/(tabs)/classement/page.tsx`:

   ```ts
   const [leaderboard, rivalry] = await Promise.all([
     getLeaderboard(user.id),
     getRivalrySpotlight(user.id),
   ])

   return <LeaderboardScreen viewerId={user.id} initialData={{ ...leaderboard, rivalry }} />
   ```

3. `apps/web/src/app/api/leaderboard/route.ts` — same two calls, same spread:

   ```ts
   const [leaderboard, rivalry] = await Promise.all([
     getLeaderboard(session.user.id),
     getRivalrySpotlight(session.user.id),
   ])
   const payload: LeaderboardPayload = { ...leaderboard, rivalry }
   ```

   Keep the existing 401 guard and `PRIVATE_HEADERS` exactly as they are.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0 (a mismatch
between the Zod schema and the two call sites shows up here as a type error), and
`pnpm --filter @degommix/web test` → exit 0 (`src/lib/api-payloads.test.ts` still
passes).

### Step 6: Render the « Rivalités » tile on the Classement

Create `apps/web/src/components/stats/rivalry-tile.tsx`, again modeled on
`top-degommeur-tile.tsx`:

```tsx
interface RivalryTileProps {
  rivalry: RivalrySpotlight
}

/** « Qui dégomme qui » spotlight: my nemesis and my favourite victim. */
export function RivalryTile({ rivalry }: RivalryTileProps) { ... }
```

- Return `null` when `rivalry.nemesis === null && rivalry.favoriteVictim === null`
  (nothing to say yet — no empty state on this screen).
- Section label: `<p className="sec-label">Rivalités</p>`.
- Nemesis line (only when present): label `Ta bête noire` and text
  `{nemesis.username} · {nemesis.count} dégommages subis`.
- Victim line (only when present): label `Ta victime préférée` and text
  `{favoriteVictim.username} · {favoriteVictim.count} dégommages`.
- Use `PlayerAvatar` (`@/components/ui/player-avatar`, `size={32}`) and
  `<Icon name="sword" size={16} className="text-bronze" />` the way
  `top-degommeur-tile.tsx:15-27` does. No new icon name — `IconName` is a closed
  union (`icons.tsx:142`).

Wire it in `apps/web/src/components/stats/leaderboard-screen.tsx`: import
`RivalryTile` from `./rivalry-tile` and render
`<RivalryTile rivalry={leaderboard.rivalry} />` immediately after the
`{leaderboard.topDegommeur ? … : null}` line (line 45). Leave the
`friendCount === 0` early-return branch untouched.

**Verify**:

```bash
pnpm --filter @degommix/web exec tsc --noEmit   # exit 0
pnpm --filter @degommix/web exec eslint src     # exit 0
pnpm lint && pnpm typecheck                     # exit 0
```

### Step 7 (OPTIONAL — skippable, do it only if steps 1–6 are green and you have budget)

Live "subis" tally on the player cards, with **zero** reducer change.

1. In `apps/web/src/lib/rivalries.ts`, add a pure selector over the live state:

   ```ts
   import type { GameState } from '@degommix/game-core' // type-only import

   /** Degommages suffered per player in the current game (undone ones excluded). */
   export function takenByTarget(
     state: Pick<GameState, 'degommageLog' | 'undoneSeqs'>
   ): Record<string, number> { ... }
   ```

   `GameState.degommageLog` is `{ seq, actorId, targetId }[]` and
   `GameState.undoneSeqs` is a `ReadonlySet<number>`
   (`packages/game-core/src/types.ts:62-86`) — filter the log on
   `!state.undoneSeqs.has(entry.seq)` and count by `targetId`. Add unit tests for
   it in `rivalries.test.ts` (counts per target; an undone entry is excluded;
   empty log → `{}`).

2. `apps/web/src/components/live/player-card.tsx` — add an optional prop
   `taken?: number` and render, under the existing sword line (lines 34–37), a
   **text-only** line when `taken !== undefined && taken > 0`:
   `{taken} subis`, styled `className="m-0 text-xs"` with
   `style={{ color: 'var(--ink-faint)' }}`.
   Do **not** add a pawn/shield icon: the design doc pins the live card to
   « portrait + compteur de dégommages uniquement (aucun pion) »
   (`docs/superpowers/specs/2026-07-25-degommix-design.md:307`) and the summary to
   « épée = dégommages — pas d'icône pion » (line 308). Keep
   `data-testid="degommage-count"` on the existing dealt counter untouched — the
   e2e suite reads it.
3. `apps/web/src/components/live/live-screen.tsx` — compute
   `const taken = takenByTarget(state)` next to the existing derived values
   (around line 110) and pass `taken={taken[userId] ?? 0}` in the `PlayerCard`
   call at lines 137–142.

**Verify**: `pnpm --filter @degommix/web test` → exit 0 including the new
selector tests; `pnpm typecheck` → exit 0. If anything here is not clean in one
pass, **revert step 7 only** (`git checkout -- <the three files>`) and report it
as skipped — steps 1–6 are the deliverable.

## Test plan

- **New unit tests** — `apps/web/src/lib/rivalries.test.ts` (Step 2), covering:
  dealt/taken split; undo exclusion; undo exclusion scoped per game;
  unrelated-players rows ignored; malformed UNDO payload; empty input;
  `pickNemesis`/`pickFavoriteVictim` null case, max case and tie-break. Plus, if
  Step 7 is done, three `takenByTarget` cases.
  Structural pattern: `apps/web/src/lib/ws-errors.test.ts`.
- **No query-level DB test is added, on purpose.** Investigated at planning time:
  the repo's database-backed test infrastructure lives in `packages/db`
  (`src/test-utils.ts` → `migrateTestDb`, `truncateAll`, `createTestUser`; used by
  `packages/db/src/schema/friends.test.ts`) and in `apps/ws-server/test/*.test.ts`
  (Socket.IO integration suites, `fileParallelism: false`). There is **no**
  DB-backed test harness under `apps/web`: `apps/web/vitest.config.ts` uses the
  `node` environment with no setup file, and importing `@/lib/db` pulls in
  `apps/web/src/lib/env.ts:10` (`schema.parse(process.env)`), which throws without
  `DATABASE_URL`/`BETTER_AUTH_SECRET`. Building that harness is a separate piece
  of work, out of scope here. That is exactly why the risky logic (undo
  exclusion) is extracted into a pure, fully unit-tested module and the query
  wrapper stays a thin, typechecked shell.
- **Manual verification of the aggregation against the denormalized counter**
  (run once against a database that has finished games — your local dev DB or the
  test DB after the ws-server suite has run). The key invariant: the per-actor sum
  of the pair aggregation must equal the sum of `game_players.degommages` over
  finished games, i.e. the numbers this plan derives agree with what
  `finalize.ts` persisted.

  ```sql
  -- A) pair aggregation, undone degommages excluded (the rule from "Current state")
  SELECT e.actor_id, e.target_id, count(*) AS dealt
  FROM game_events e
  JOIN games g ON g.id = e.game_id
  WHERE e.type = 'DEGOMMAGE'
    AND g.status = 'finished'
    AND NOT EXISTS (
      SELECT 1 FROM game_events u
      WHERE u.game_id = e.game_id
        AND u.type = 'UNDO'
        AND (u.payload->>'targetSeq')::int = e.seq
    )
  GROUP BY e.actor_id, e.target_id
  ORDER BY dealt DESC;

  -- B) same totals from the denormalized counter written by finalize.ts
  SELECT p.user_id, sum(p.degommages) AS degommages
  FROM game_players p
  JOIN games g ON g.id = p.game_id
  WHERE g.status = 'finished' AND p.status IN ('joined', 'left')
  GROUP BY p.user_id
  ORDER BY degommages DESC;
  ```

  Per-user, `sum(dealt)` from (A) must equal `degommages` from (B). If it does
  not, the exclusion rule is wrong — **STOP and report** with both result sets.
- **Verification of the whole suite**: `pnpm exec turbo run test --concurrency=1`
  after `docker compose -f docker-compose.test.yml up -d` → exit 0. Without
  Docker: `pnpm --filter @degommix/web test` and
  `pnpm --filter @degommix/game-core test` → exit 0, and say in your report that
  the DB-backed suites were not run.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0, and
      `apps/web/src/lib/rivalries.test.ts` exists with ≥ 9 passing tests
- [ ] `grep -n "export async function getCircleMemberIds" apps/web/src/lib/queries/stats.ts`
      returns 1 match (line 56)
- [ ] `grep -rn "from '@/lib/db'" apps/web/src/lib/rivalries.ts` returns **no**
      matches (the pure module stays db-free)
- [ ] `grep -n "rivalry" apps/web/src/lib/api-payloads.ts apps/web/src/app/api/leaderboard/route.ts "apps/web/src/app/(tabs)/classement/page.tsx" apps/web/src/components/stats/leaderboard-screen.tsx`
      returns at least one match in each of the four files
- [ ] `grep -n "Face à face" apps/web/src/components/stats/head-to-head-card.tsx`
      and `grep -n "Rivalités" apps/web/src/components/stats/rivalry-tile.tsx`
      each return 1 match
- [ ] The friends-only guard in `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`
      is byte-identical to the excerpt in "Current state" (`areFriends` call and
      the « Profil réservé aux amis » branch)
- [ ] `git status --porcelain` lists only files from the In-scope list (Step 7
      files only if Step 7 was done)
- [ ] `plans/README.md` status row updated (unless the dispatching reviewer owns
      the index)
- [ ] Manual SQL check (A) vs (B) agrees, or was explicitly reported as not run
      for lack of a populated database

## STOP conditions

Stop and report back (do not improvise) if:

- The `finalize.ts` excerpt no longer copies `player.degommages` from the reducer
  state, or `game-manager.ts` no longer resolves the undo target before
  persisting (`resolveUndoTarget` / `NOTHING_TO_UNDO`) — the whole exclusion rule
  rests on those two facts.
- `packages/game-core/src/types.ts` no longer carries `payload: { targetSeq }` on
  `UNDO`, or `GameState` no longer exposes `degommageLog` / `undoneSeqs`.
- The manual SQL cross-check (A) vs (B) disagrees for any user.
- `leaderboardPayloadSchema` no longer exists in `apps/web/src/lib/api-payloads.ts`,
  or `/api/leaderboard` no longer returns `getLeaderboard`'s object directly.
- Adding the `rivalry` field to the payload appears to require touching the
  websocket invalidation code or `apps/web/src/hooks/use-tab-data.ts` — it should
  not; report instead of widening scope.
- A step's verification fails twice after a reasonable fix attempt.
- You conclude the work needs a schema change, a migration or a new index —
  that is explicitly out of scope (see Maintenance notes).

## Maintenance notes

For the human/agent who owns this code next:

- **No index on `game_events.target_id`.** `packages/db/src/schema/games.ts:93-96`
  defines only `game_events_game_seq_unique` and `game_events_game_seq`. This plan
  never filters on `target_id` (it filters by `game_id` list, which is indexed,
  and aggregates in TS), so no index is needed at private-friends-circle volume.
  If rivalry ever moves into SQL with a `GROUP BY target_id` over the whole table,
  add `index('game_events_target').on(t.targetId)` in a migration first.
- **Alternative considered and deliberately not taken: pure-SQL pair aggregation**
  with the `NOT EXISTS (… UNDO … targetSeq …)` predicate (query (A) of the test
  plan). It is equivalent and would return far fewer rows, but it is not
  unit-testable without a database, and `apps/web` has no DB-test harness today.
  Keep query (A) as the reference implementation to migrate to if event volume
  ever grows; the pure helper's tests then become the specification to match.
- **Alternative considered: reusing `buildGameState` from `@degommix/game-core`**
  per game to derive pairs. Maximum fidelity, but it needs a full event log per
  game (all event types, mapped into `GameEvent`) and would recompute whole games
  just to count pairs. The narrow `DEGOMMAGE`/`UNDO` projection is cheaper and
  provably equivalent given the server-side invariants documented above.
- **Deferred on purpose**: no `game_players`-style denormalized pair counter, no
  new event type, no rivalry data on the live screen unless Step 7 was executed,
  and no rivalry line in the end-of-game `Résumé`
  (`apps/web/src/components/live/summary.tsx`) — that screen's content is pinned
  by design doc line 308.
- **What a reviewer should scrutinize**: (1) the `${gameId}:${seq}` undo key — a
  plain `seq` key would silently cross-cancel degommages between different games,
  since `seq` restarts at 1 per game; (2) that `getRivalrySpotlight` filters
  opponents through `getCircleMemberIds`, so a stranger who joined by code is
  never named (design doc line 314, `SPECS.md:86`); (3) that the friends-only
  guard on the profile page was not touched; (4) that `rivalry` was added to
  **both** the SSR page and the `/api/leaderboard` route — if they diverge, the
  first client refetch changes the UI.
- **Follow-up that will interact with this**: `plans/006-friend-profile-shared-games.md`
  adds a « Vos parties ensemble » list to the same profile page and computes the
  same "shared finished games" set. If both land, factor the shared-games id query
  out of `getHeadToHead` and `getSharedGames` into one helper.
