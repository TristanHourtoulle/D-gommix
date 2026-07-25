# Plan 006: Add « Vos parties ensemble » to the friend profile and make leaderboard rows tappable

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
>   apps/web/src/lib/queries/home.ts \
>   apps/web/src/lib/queries/stats.ts \
>   'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' \
>   apps/web/src/components/stats/ranking-table.tsx \
>   apps/web/src/components/home/game-history-item.tsx \
>   'apps/web/src/app/(tabs)/profil/page.tsx' \
>   e2e/happy-path.spec.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (composes cleanly with `plans/003-rivalry-stats.md`, which
  touches the same profile page — see Maintenance notes)
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

The game-detail page `/parties/[id]` is already authorized for participants **and
their friends** (`getGameDetail`, `apps/web/src/lib/queries/stats.ts:315-328`),
but the only link into it anywhere in the app is the viewer's own history list on
the Accueil screen. A friend's profile is three aggregate tiles and a fetish
character; there is no way to answer « on a joué combien de parties ensemble, et
lesquelles ? », which is the core social loop of a private friends-circle app
(« Le classement officieux de vos parties … qui dégomme qui, qui tient le
village », `SPECS.md:3`). Likewise, the Classement lists every member of your
circle but the rows are inert `div`s — the profile pages they should lead to
already exist.

This plan adds one new query (finished games where **both** the viewer and the
friend held a seat) plus two navigation affordances. It deliberately does **not**
widen who can see what: every game listed is a game the viewer played, so the
existing authorization on `/parties/[id]` already covers it.

## Current state

### Files that matter

- `apps/web/src/lib/queries/home.ts` — `getLastGames` (lines 118–188): the
  history query to model the new one on. Parameterized by `userId` but only ever
  called with the session user's id (`apps/web/src/app/(tabs)/page.tsx` →
  `/api/home`). Hard cap `limit(20)`, no pagination.
- `apps/web/src/lib/queries/stats.ts` — `getGameDetail` (lines 287–373); the
  authorization block is lines 315–328.
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — the friend profile page
  (server component) to extend.
- `apps/web/src/components/home/game-history-item.tsx` — the row component to
  reuse; it already links to `/parties/[id]`.
- `apps/web/src/components/stats/ranking-table.tsx` — the leaderboard rows to make
  tappable.
- `apps/web/src/app/(tabs)/profil/page.tsx` — **account settings**, not a stats
  page (pseudo form, theme switch, sign-out). Verified lines 11–41. Relevant to
  the "where does the viewer's own row link?" decision below.
- `e2e/happy-path.spec.ts:135-136` — Playwright assertions that read the ranking
  rows by `data-testid`.

### `getLastGames` — the shape to reuse (`apps/web/src/lib/queries/home.ts:118-188`)

```ts
/** My 20 most recent finished games, newest first, for the home history list. */
export async function getLastGames(userId: string): Promise<HomeGame[]> {
  const gameRows = await db
    .select({
      id: games.id,
      outcome: games.outcome,
      winnerId: games.winnerId,
      winnerUsername: user.username,
      format: games.format,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .leftJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
      ),
    )
    .orderBy(sql`${games.endedAt} desc nulls last`)
    .limit(20)

  if (gameRows.length === 0) return []

  const gameIdList = sql.join(
    gameRows.map((row) => sql`${row.id}`),
    sql`, `,
  )
  const participantRows = await db
    .select({ gameId: gamePlayers.gameId, username: user.username, character: gamePlayers.character })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        sql`${gamePlayers.gameId} in (${gameIdList})`,
        sql`${gamePlayers.status} in ('joined', 'left')`,
      ),
    )
    .orderBy(sql`${gamePlayers.joinedAt} asc nulls last`)

  const participantsByGame = new Map<string, HomeGameParticipant[]>()
  for (const row of participantRows) { /* push { username: row.username ?? '?', character } */ }

  return gameRows.map((row) => {
    const durationSec =
      row.startedAt && row.endedAt
        ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000))
        : null
    const wonOrLost: HomeGameResult = row.winnerId === userId ? 'won' : 'lost'

    return {
      id: row.id,
      myResult: row.outcome === 'aborted' ? 'aborted' : wonOrLost,
      winnerUsername: row.winnerUsername,
      format: toGameFormat(row.format),
      durationSec,
      endedAt: row.endedAt,
      participants: participantsByGame.get(row.id) ?? [],
    }
  })
}
```

Types it exports (`home.ts:5-33`): `HomeGameResult = 'won' | 'lost' | 'aborted'`,
`HomeGameParticipant`, `HomeGame`. `toGameFormat` (lines 35–38) is currently
module-private:

```ts
function toGameFormat(value: number): GameFormat {
  if (value === 2 || value === 3 || value === 4) return value
  throw new Error(`Invalid game format: ${value}`)
}
```

### The authorization that already holds (`apps/web/src/lib/queries/stats.ts:315-328`)

```ts
  const isParticipant = playerRows.some((row) => row.userId === viewerId)
  if (!isParticipant) {
    const pairChecks = playerRows.map((row) => {
      const [low, high] = canonicalPair(row.userId, viewerId)
      return and(eq(friendships.userLow, low), eq(friendships.userHigh, high))
    })
    if (pairChecks.length === 0) return null
    const friendRows = await db
      .select({ low: friendships.userLow })
      .from(friendships)
      .where(or(...pairChecks))
      .limit(1)
    if (friendRows.length === 0) return null
  }
```

Every game this plan lists is a game the **viewer** played, so `isParticipant`
is true and the friendship branch is never even reached. **No new authorization
reasoning is introduced.** This matches the design doc,
`docs/superpowers/specs/2026-07-25-degommix-design.md:309`:
« **Détail partie** (`/parties/[id]`) | Même récap + **journal complet** … .
Accessible aux participants et à leurs amis. »

### The friends-only guard that must survive (`apps/web/src/app/(tabs)/amis/[userId]/page.tsx:16-38`)

```tsx
export default async function FriendProfilePage({ params }: FriendProfilePageProps) {
  const { userId } = await params
  const { user: me } = await requireOnboardedSession()

  const profile = await getPublicUser(userId)
  if (!profile) notFound()

  const isSelf = userId === me.id
  if (!isSelf && !(await areFriends(me.id, userId))) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Accès réservé">Profil</SectionTitle>
        <EmptyState
          icon="users"
          title="Profil réservé aux amis"
          description="Envoie-lui une demande d'ami pour découvrir ses stats."
        />
        <Link href="/amis" className="helper-text">
          Retour aux amis
        </Link>
      </main>
    )
  }
```

`SPECS.md:86`: « **Profil et stats visibles par les amis uniquement.** » and
design doc line 304: « **Profil ami** | Stats (…), accessibles **aux amis
uniquement** (403 sinon). » Keep this block exactly as it is; add content only
**after** it.

The page's tail, where the new section goes (`page.tsx:62-89`):

```tsx
      <div className="stat-row">
        <StatTile icon="trophy" label="Victoires" value={stats.wins} />
        <StatTile icon="flag" label="Winrate" value={winrateLabel} />
        <StatTile icon="sword" label="Dégommages" value={stats.degommages} />
      </div>

      <section className="card flex items-center gap-3 p-5">
        {/* fetish character, or « Pas encore de personnage fétiche — aucune partie jouée. » */}
      </section>

      <Link href="/amis" className="helper-text">
        Retour aux amis
      </Link>
```

### The leaderboard rows today (`apps/web/src/components/stats/ranking-table.tsx:13-53`)

```tsx
export function RankingTable({ rows, viewerId }: RankingTableProps) {
  return (
    <Card className="px-4 py-1">
      {rows.map((row, index) => (
        <div
          key={row.userId}
          data-testid={`ranking-row-${row.username}`}
          className={`flex items-center gap-2.5 py-2.5 ${index > 0 ? 'border-t border-parchment-line/60' : ''}`}
        >
          <span className="w-5 shrink-0 text-center font-mono text-sm font-bold text-bronze">{row.rank}</span>
          <PlayerAvatar username={row.username} size={32} />
          <span className={`min-w-0 flex-1 truncate text-sm ${row.userId === viewerId ? 'font-bold' : 'font-medium'}`}>
            {row.username}
          </span>
          {/* wins · winrate, sword + degommages, character badge or dashed placeholder */}
        </div>
      ))}
    </Card>
  )
}
```

It is rendered by the client component
`apps/web/src/components/stats/leaderboard-screen.tsx:47`, so `next/link` works
there without any change to the data flow.

`e2e/happy-path.spec.ts:135-136` depends on the `data-testid` staying on the
outermost element of each row:

```ts
    await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
    await expect(p1.getByTestId(`ranking-row-${J1.username}`)).toContainText('0 v')
```

### Repo conventions that apply here

- **Query layer**: `apps/web/src/lib/queries/*.ts`, `db` from `@/lib/db`, Drizzle
  helpers from `@degommix/db`, exported `interface` result types, JSDoc on
  exported functions. Parameterized `IN (…)` built with `sql.join` (see the
  `gameIdList` excerpt above) — never string concatenation, and never with an
  empty array (invalid SQL).
- **Pure helpers with co-located unit tests**: `apps/web/src/lib/chrono.ts` +
  `chrono.test.ts`. `apps/web/vitest.config.ts` runs `src/**/*.test.ts` in a plain
  `node` env with **no database and no env vars**, so a unit-tested module must
  never (even transitively) import `@/lib/db`: `apps/web/src/lib/env.ts:10` runs
  `schema.parse(process.env)` at module load and would throw. `import type { … }`
  is erased at compile time and is therefore safe.
- **Links**: `next/link` with `className="… no-underline"` and
  `style={{ color: 'inherit' }}` — see
  `apps/web/src/components/home/game-history-item.tsx:41-45` and
  `apps/web/src/components/friends/friend-row.tsx:50-54` (which already links to
  `/amis/${friendId}`).
- **Empty states**: `EmptyState` from `@/components/ui/empty-state` with
  `icon` / `title` / `description`, French copy — see
  `apps/web/src/components/home/home-screen.tsx:82-86`.
- **Section headers**: `<p className="sec-label">…</p>` inside
  `<section className="flex flex-col gap-2">` (`home-screen.tsx:79-90`).
- French user-facing copy, English identifiers and comments; typographic
  apostrophe `’` in strings, `&apos;` in JSX text.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (whole repo) | `pnpm typecheck` | exit 0, no errors |
| Lint (whole repo) | `pnpm lint` | exit 0 |
| Web unit tests only | `pnpm --filter @degommix/web test` | exit 0 |
| One web test file | `pnpm --filter @degommix/web exec vitest run src/lib/shared-games.test.ts` | exit 0 |
| Test DB (needed by `packages/db` + `apps/ws-server` suites only) | `docker compose -f docker-compose.test.yml up -d` | container running |
| Full test suite (serialized — the DB suites share one database) | `pnpm exec turbo run test --concurrency=1` | exit 0 |

Node ≥ 22, pnpm 11.13.1, Turborepo. Do **not** run the Playwright suite
(`pnpm test:e2e`) unless the operator gave you a running app + database; it needs
both. Verify the e2e contract by grep instead (see Step 5).

## Suggested executor toolkit

- Invoke `superpowers:verification-before-completion` before claiming done: real
  command output, not assertions.
- For Drizzle query-builder details (`sql` template, `orderBy`, `leftJoin`), fetch
  current docs via Context7 (`resolve-library-id` → `query-docs` for
  `drizzle-orm`) instead of guessing.
- Repo docs worth skimming: `SPECS.md` §Amis, and
  `docs/superpowers/specs/2026-07-25-degommix-design.md` §5.2 (lines 302–310).

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/lib/shared-games.ts` (create) — pure helpers, no db import
- `apps/web/src/lib/shared-games.test.ts` (create) — unit tests
- `apps/web/src/lib/queries/shared-games.ts` (create) — the db-backed query
- `apps/web/src/lib/queries/home.ts` (edit — **only** to add `export` to
  `toGameFormat`)
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` (edit — add the new section
  after the existing guard)
- `apps/web/src/components/stats/ranking-table.tsx` (edit — rows become links)

**Out of scope** (do NOT touch, even though they look related):

- `getLastGames` itself — do not refactor it to share code with the new query.
  It feeds `/api/home` and the Accueil screen, whose payload shape is pinned by
  `apps/web/src/lib/api-payloads.ts`; a regression there breaks the home tab.
- **Listing the friend's own full game history.** Deliberately excluded: it would
  widen what a profile discloses beyond « stats visibles par les amis uniquement »
  and would surface games the viewer never played (whose `/parties/[id]` access
  then depends on the friend-of-participant branch). Recorded as a deferred
  decision in Maintenance notes.
- `apps/web/src/lib/queries/stats.ts` — `getGameDetail`'s authorization stays
  untouched; this plan produces links only to games the viewer participated in.
- `apps/web/src/lib/api-payloads.ts`, `apps/web/src/hooks/use-tab-data.ts`,
  `apps/web/src/app/api/**` — the profile page is server-rendered; no tab payload,
  no new endpoint, no TanStack query.
- Pagination / "voir plus" on the new list — hard cap of 20, like `getLastGames`.
- `e2e/**` and `packages/**` — no changes.

## Git workflow

- Branch: `feat/friend-profile-shared-games` (repo convention `type/short-slug`;
  branch at planning time was `fix/post-playtest-round-1`).
- Commit per step or per logical unit, Conventional Commits in English. Real
  example from `git log`:
  `feat(web): session-gated json endpoints reusing server query functions`.
  Suggested: `feat(web): shared finished games between two players`,
  `feat(web): tappable leaderboard rows linking to friend profiles`.
- Do NOT push and do NOT open a PR unless the operator explicitly asked.

## Steps

### Step 1: Create the pure module `apps/web/src/lib/shared-games.ts`

This module must not import `@/lib/db` — type-only imports are fine.

```ts
import type { HomeGameResult } from './queries/home' // type-only: erased at build

/**
 * Pure pieces of the « Vos parties ensemble » query, kept db-free so they are
 * unit-testable (apps/web/vitest.config.ts runs with no database, no env vars).
 */

/** Keeps, in input order, the rows whose game is also one of `otherGameIds`, capped at `limit`. */
export function filterSharedGames<T extends { id: string }>(
  rows: readonly T[],
  otherGameIds: ReadonlySet<string>,
  limit: number
): T[] {
  const shared: T[] = []
  for (const row of rows) {
    if (!otherGameIds.has(row.id)) continue
    shared.push(row)
    if (shared.length === limit) break
  }
  return shared
}

/** Result of a finished game from `viewerId`'s point of view. */
export function resolveMyResult(
  outcome: 'village_reached' | 'aborted' | null,
  winnerId: string | null,
  viewerId: string
): HomeGameResult {
  if (outcome === 'aborted') return 'aborted'
  return winnerId === viewerId ? 'won' : 'lost'
}

/** Whole seconds between start and end, null when either timestamp is missing. */
export function durationSeconds(startedAt: Date | null, endedAt: Date | null): number | null {
  if (!startedAt || !endedAt) return null
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
}
```

These three functions reproduce, in testable form, the derivations currently
inlined in `getLastGames` (`home.ts:171-187`). Keep the behaviour identical —
including `Math.max(0, …)` and `outcome === 'aborted'` taking precedence over the
win check.

**Verify**:
```bash
pnpm --filter @degommix/web exec tsc --noEmit          # exit 0
grep -c "@/lib/db" apps/web/src/lib/shared-games.ts    # prints 0
```

### Step 2: Unit-test the pure module in `apps/web/src/lib/shared-games.test.ts`

Model after `apps/web/src/lib/chrono.test.ts`
(`import { describe, expect, it } from 'vitest'`, Arrange–Act–Assert, English
names). Required cases:

1. `filterSharedGames keeps only games present in both sets`
2. `filterSharedGames preserves the input order` (the caller passes rows already
   sorted newest-first, and that order must survive)
3. `filterSharedGames caps the result at the limit`
4. `filterSharedGames returns an empty array when the other set is empty`
5. `resolveMyResult returns aborted whatever the winner is` (including when
   `winnerId === viewerId` with `outcome === 'aborted'`)
6. `resolveMyResult returns won when the viewer is the winner`
7. `resolveMyResult returns lost when the winner is someone else or null`
8. `durationSeconds returns null when startedAt or endedAt is missing`
9. `durationSeconds rounds to whole seconds and never goes negative`

**Verify**: `pnpm --filter @degommix/web exec vitest run src/lib/shared-games.test.ts`
→ exit 0, at least 9 tests pass.

### Step 3: Create the query `apps/web/src/lib/queries/shared-games.ts`

First, in `apps/web/src/lib/queries/home.ts` line 35, add one word:

```ts
export function toGameFormat(value: number): GameFormat {
```

Nothing else in `home.ts` changes — in particular, `getLastGames` keeps its exact
current body.

Then create `apps/web/src/lib/queries/shared-games.ts`:

```ts
import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'
import { durationSeconds, filterSharedGames, resolveMyResult } from '@/lib/shared-games'
import { toGameFormat, type HomeGame, type HomeGameParticipant } from './home'

/** Newest-first cap, mirroring the home history list (design doc §5.2, « mes 20 dernières parties »). */
const SHARED_GAMES_LIMIT = 20

/**
 * Finished games where BOTH `viewerId` and `friendId` held a seat, newest first,
 * from the viewer's point of view. Every row is a game the viewer played, so the
 * `/parties/[id]` detail page it links to is already authorized for them
 * (see getGameDetail in ./stats.ts).
 */
export async function getSharedGames(viewerId: string, friendId: string): Promise<HomeGame[]> {
  // 1. The viewer's finished games, newest first — same filters as getLastGames.
  const viewerRows = await db
    .select({
      id: games.id,
      outcome: games.outcome,
      winnerId: games.winnerId,
      winnerUsername: user.username,
      format: games.format,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .leftJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        eq(gamePlayers.userId, viewerId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
      ),
    )
    .orderBy(sql`${games.endedAt} desc nulls last`)

  if (viewerRows.length === 0) return []

  // 2. The friend's finished-game ids, to keep only the games they both held a seat in.
  const friendRows = await db
    .select({ id: games.id })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, friendId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
      ),
    )

  const shared = filterSharedGames(
    viewerRows,
    new Set(friendRows.map((row) => row.id)),
    SHARED_GAMES_LIMIT,
  )
  if (shared.length === 0) return []

  // 3. Participants of those games only — copied from getLastGames.
  const gameIdList = sql.join(shared.map((row) => sql`${row.id}`), sql`, `)
  const participantRows = await db
    .select({ gameId: gamePlayers.gameId, username: user.username, character: gamePlayers.character })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        sql`${gamePlayers.gameId} in (${gameIdList})`,
        sql`${gamePlayers.status} in ('joined', 'left')`,
      ),
    )
    .orderBy(sql`${gamePlayers.joinedAt} asc nulls last`)

  const participantsByGame = new Map<string, HomeGameParticipant[]>()
  // same accumulation as home.ts:164-169, with `row.username ?? '?'`

  return shared.map((row) => ({
    id: row.id,
    myResult: resolveMyResult(row.outcome, row.winnerId, viewerId),
    winnerUsername: row.winnerUsername,
    format: toGameFormat(row.format),
    durationSec: durationSeconds(row.startedAt, row.endedAt),
    endedAt: row.endedAt,
    participants: participantsByGame.get(row.id) ?? [],
  }))
}
```

Non-negotiable details:

- **Both-seats condition**: a game qualifies only when *both* players have a
  `game_players` row with status `joined` **or** `left` (a player who left
  mid-game still played the game — same rule as `getLastGames` and as the
  leaderboard, `stats.ts:75`). Statuses `invited`, `declined`, `kicked` must never
  qualify.
- **Finished only**: `eq(games.status, 'finished')` on both queries. Never list a
  `lobby` or `active` game here — `/parties/[id]` redirects active games to
  `/partie/[id]` (`parties/[gameId]/page.tsx:57-58`) and the friend profile is not
  the place to expose a live game.
- **Aborted games are included** (they count for dégommages, design doc line 318);
  `resolveMyResult` renders them as « Abandonnée ».
- Guard both early returns (`viewerRows.length === 0`, `shared.length === 0`)
  before building the `sql.join` list — an empty `sql.join` produces invalid SQL.

**Verify**:
```bash
pnpm --filter @degommix/web exec tsc --noEmit                                   # exit 0
pnpm --filter @degommix/web exec eslint src/lib/queries/shared-games.ts src/lib/shared-games.ts  # exit 0
git diff --stat apps/web/src/lib/queries/home.ts   # exactly 1 insertion + 1 deletion (the `export`)
```

### Step 4: Render « Vos parties ensemble » on the friend profile

Edit `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`:

1. Add imports: `getSharedGames` from `@/lib/queries/shared-games`,
   `GameHistoryItem` from `@/components/home/game-history-item`, and
   `EmptyState` is already imported (line 7).
2. Keep the friendship guard exactly as it is. **After** it, fetch the list in
   parallel with the existing stats call, and only when the profile is not the
   viewer's own:

   ```ts
   const [stats, sharedGames] = await Promise.all([
     getPlayerStats(userId),
     isSelf ? Promise.resolve([]) : getSharedGames(me.id, userId),
   ])
   ```

   (`isSelf` already exists at line 23. A « parties ensemble » list against
   yourself is meaningless, hence the empty array.)
3. Render a new section **between** the fetish-character `<section>` (ends
   line 84) and the « Retour aux amis » link (lines 86–88):

   ```tsx
      {isSelf ? null : (
        <section className="flex flex-col gap-2">
          <p className="sec-label">Vos parties ensemble</p>
          {sharedGames.length === 0 ? (
            <EmptyState
              icon="flag"
              title="Aucune partie ensemble"
              description="Invite-le dans un salon pour lancer la première."
            />
          ) : (
            sharedGames.map((game) => <GameHistoryItem key={game.id} game={game} />)
          )}
        </section>
      )}
   ```

   French copy is fixed as written above (`sec-label` « Vos parties ensemble »,
   empty title « Aucune partie ensemble », description
   « Invite-le dans un salon pour lancer la première. »). `GameHistoryItem`
   already renders the result pill, the format/duration/when meta line, the
   participant badges and the chevron, and links to `/parties/${game.id}` — do not
   reimplement or restyle it.

**Verify**:
```bash
pnpm --filter @degommix/web exec tsc --noEmit   # exit 0
pnpm --filter @degommix/web exec eslint src     # exit 0
grep -n "Profil réservé aux amis" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"   # still exactly 1 match
grep -n "Vos parties ensemble" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"      # 1 match
```

### Step 5: Make the leaderboard rows link to the profile

Edit `apps/web/src/components/stats/ranking-table.tsx` only:

- Import `Link from 'next/link'`.
- Replace the row `<div>` with a `<Link>` whose `href` is `/amis/${row.userId}`,
  keeping **every** existing attribute on it: `key={row.userId}`, the
  `data-testid={`ranking-row-${row.username}`}` (the e2e suite reads it,
  `e2e/happy-path.spec.ts:135-136`) and the current `className` string, to which
  you append ` no-underline`, plus `style={{ color: 'inherit' }}` — the same
  treatment as `game-history-item.tsx:41-45`.
- Add `aria-label={`Voir le profil de ${row.username}`}`.
- Change nothing inside the row: rank, `PlayerAvatar`, the `viewerId` bold
  treatment, the wins/winrate span, the sword span and the character badge stay
  byte-identical.

**Link the viewer's own row too.** `/amis/[userId]` already handles the self case
(`page.tsx:23` `const isSelf = userId === me.id`, and `page.tsx:47` renders the
sub-title « Tes stats de dégommeur »), whereas `/profil` is account settings
(username form, theme, sign-out — `apps/web/src/app/(tabs)/profil/page.tsx:11-41`),
not a stats page. So all rows, including the viewer's, link to
`/amis/${row.userId}`. Do not special-case the viewer.

**Verify**:
```bash
pnpm --filter @degommix/web exec tsc --noEmit                     # exit 0
pnpm --filter @degommix/web exec eslint src                       # exit 0
grep -n "data-testid={\`ranking-row-" apps/web/src/components/stats/ranking-table.tsx   # 1 match
grep -n "href={\`/amis/" apps/web/src/components/stats/ranking-table.tsx                # 1 match
pnpm lint && pnpm typecheck                                       # exit 0
```

## Test plan

- **New unit tests** — `apps/web/src/lib/shared-games.test.ts` (Step 2): the
  both-sets intersection (the "both seats" rule in pure form), order preservation,
  the 20-cap, the empty case, `resolveMyResult`'s aborted-wins-over-victory
  precedence, and `durationSeconds`' null/rounding/clamp behaviour.
  Structural pattern: `apps/web/src/lib/chrono.test.ts`.
- **No query-level DB test is added, on purpose.** Investigated at planning time:
  database-backed test infrastructure exists only in `packages/db`
  (`src/test-utils.ts` — `migrateTestDb`, `truncateAll`, `createTestUser`, used by
  `packages/db/src/schema/friends.test.ts`) and in `apps/ws-server/test/*.test.ts`
  (Socket.IO integration suites, `fileParallelism: false`). `apps/web` has none:
  `apps/web/vitest.config.ts` is a bare `node` environment with no setup file, and
  importing `@/lib/db` triggers `apps/web/src/lib/env.ts:10`
  (`schema.parse(process.env)`), which throws without `DATABASE_URL` /
  `BETTER_AUTH_SECRET`. Building that harness is separate work, out of scope here.
  The both-seats and finished-only conditions are therefore covered by (a) the
  pure intersection tests, (b) typecheck, and (c) the manual SQL check below.
- **Manual verification of the query** (run against a database that has at least
  one finished game with two known players; substitute the two ids):

  ```sql
  -- Games where BOTH players held a seat (what getSharedGames must return, newest first)
  SELECT g.id, g.outcome, g.ended_at
  FROM games g
  JOIN game_players a ON a.game_id = g.id AND a.user_id = '<VIEWER_ID>'
                     AND a.status IN ('joined', 'left')
  JOIN game_players b ON b.game_id = g.id AND b.user_id = '<FRIEND_ID>'
                     AND b.status IN ('joined', 'left')
  WHERE g.status = 'finished'
  ORDER BY g.ended_at DESC NULLS LAST
  LIMIT 20;

  -- Control: must be a strict subset of the viewer's own finished games
  SELECT count(*) FROM games g
  JOIN game_players a ON a.game_id = g.id AND a.user_id = '<VIEWER_ID>'
                     AND a.status IN ('joined', 'left')
  WHERE g.status = 'finished';
  ```

  Then open `/amis/<FRIEND_ID>` and confirm the rendered list matches the first
  query row-for-row, and that tapping a row lands on `/parties/<id>` without a
  404. If a game appears that the viewer did not play, **STOP and report**.
- **Regression guard for the leaderboard rows**: the Playwright assertions at
  `e2e/happy-path.spec.ts:135-136` locate rows by `data-testid` and assert text
  content; both survive turning the row into a `Link` as long as the attribute
  stays on the outermost element. Verify by grep (Step 5). Only run
  `pnpm test:e2e` if the operator provided a running app and database.
- **Verification of the whole suite**: `pnpm exec turbo run test --concurrency=1`
  after `docker compose -f docker-compose.test.yml up -d` → exit 0. Without
  Docker: `pnpm --filter @degommix/web test` → exit 0, and say in your report that
  the DB-backed suites were not run.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0, and
      `apps/web/src/lib/shared-games.test.ts` exists with ≥ 9 passing tests
- [ ] `grep -c "@/lib/db" apps/web/src/lib/shared-games.ts` prints 0
- [ ] `grep -n "export function toGameFormat" apps/web/src/lib/queries/home.ts`
      returns 1 match, and `git diff --stat apps/web/src/lib/queries/home.ts`
      shows exactly one changed line
- [ ] `grep -n "Vos parties ensemble" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"`
      returns 1 match, and `grep -n "Profil réservé aux amis"` on the same file
      still returns 1 match
- [ ] `grep -n "data-testid={\`ranking-row-" apps/web/src/components/stats/ranking-table.tsx`
      returns 1 match and `grep -n "href={\`/amis/" apps/web/src/components/stats/ranking-table.tsx`
      returns 1 match
- [ ] `grep -rn "getSharedGames" apps/web/src` shows it called **only** from
      `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`
- [ ] `git status --porcelain` lists only the six in-scope files
- [ ] `plans/README.md` status row updated (unless the dispatching reviewer owns
      the index)
- [ ] Manual SQL check performed, or explicitly reported as not run for lack of a
      populated database

## STOP conditions

Stop and report back (do not improvise) if:

- `getGameDetail`'s authorization block (`stats.ts:315-328`) no longer treats
  participants as authorized — the "zero new authorization reasoning" premise of
  this plan then no longer holds.
- The friendship guard in `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` differs
  from the excerpt in "Current state", or you find yourself modifying it.
- `getLastGames` in `apps/web/src/lib/queries/home.ts` no longer matches the
  excerpt above (your new query is modeled on it).
- `HomeGame` / `HomeGameParticipant` / `HomeGameResult` are no longer exported
  from `apps/web/src/lib/queries/home.ts`, or `GameHistoryItem` no longer accepts
  a `HomeGame` / no longer links to `/parties/[id]`.
- Turning the ranking row into a `Link` breaks typecheck or lint in a way that
  suggests `RankingTable` is rendered outside a Next.js client/server component
  tree.
- The manual check surfaces a listed game the viewer did not play, or a listed
  game whose `/parties/[id]` page 404s.
- A step's verification fails twice after a reasonable fix attempt.
- You conclude the feature needs the friend's full history, a new API endpoint, a
  payload/schema change, or pagination — all explicitly out of scope.

## Maintenance notes

For the human/agent who owns this code next:

- **Deferred on purpose: the friend's full game history.** Listing games the
  viewer never played would widen profile disclosure beyond
  « stats visibles par les amis uniquement » (`SPECS.md:86`) and would rely on
  `getGameDetail`'s friend-of-participant branch for access, which is a different
  (and larger) privacy decision. If it is ever wanted, decide explicitly what a
  friend may see about games with strangers, and add tests for the
  friend-of-participant path first.
- **Deferred: pagination.** Hard cap of 20, matching `getLastGames`. If a
  "voir plus" is added, note that step 1 of `getSharedGames` currently loads
  *all* of the viewer's finished game rows before intersecting — fine at
  private-circle volume, but that is the query to rework first (an `EXISTS`
  subquery or a self-join on `game_players` with `LIMIT` pushed into SQL).
- **Duplicated derivation, on purpose**: `resolveMyResult` / `durationSeconds`
  restate logic that is still inlined in `getLastGames` (`home.ts:171-187`).
  `getLastGames` was left untouched to protect the `/api/home` payload. A safe
  follow-up is to make `getLastGames` call the same two pure helpers — behaviour
  is identical by construction, and the new unit tests then cover both callers.
- **Composition with `plans/003-rivalry-stats.md`**: that plan adds a « Face à
  face » card to the same profile page and also computes the set of finished games
  shared by two players (inside `getHeadToHead`). If both land, extract one shared
  helper (`sharedFinishedGameIds(viewerId, otherId)`) and have both call it.
  Whichever plan lands second should expect a merge conflict in the
  `Promise.all([...])` block of `amis/[userId]/page.tsx` — resolve it by keeping
  both fetches in the same `Promise.all`.
- **What a reviewer should scrutinize**: (1) that the both-seats condition really
  requires a `joined`/`left` row for *both* users — an accidental `or` would leak
  the friend's solo history; (2) that `games.status = 'finished'` is applied to
  both sides, so no live game is ever linked from a profile; (3) that
  `data-testid` stayed on the outermost element of each ranking row
  (`e2e/happy-path.spec.ts:135-136`); (4) that nothing in the ranking row's inner
  markup changed, since the e2e assertions match on its text.
