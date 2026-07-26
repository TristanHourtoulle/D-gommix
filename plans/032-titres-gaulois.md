# Plan 032: Titres gaulois — an evolving epithet under every pseudo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 08f1da1..HEAD -- \
>   apps/web/src/lib/rivalries.ts \
>   apps/web/src/lib/rivalries.test.ts \
>   apps/web/src/lib/queries/rivalries.ts \
>   apps/web/src/lib/queries/streaks.ts \
>   apps/web/src/lib/queries/streaks.test.ts \
>   apps/web/src/lib/queries/records.ts \
>   apps/web/src/lib/queries/stats.ts \
>   apps/web/src/lib/api-payloads.ts \
>   apps/web/src/app/api/leaderboard/route.ts \
>   'apps/web/src/app/(tabs)/classement/page.tsx' \
>   'apps/web/src/app/(tabs)/profil/page.tsx' \
>   'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' \
>   apps/web/src/components/stats/leaderboard-screen.tsx \
>   apps/web/src/components/stats/podium.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none (composes with the shipped plans 019, 026, 028)
- **Category**: direction
- **Planned at**: commit `08f1da1`, 2026-07-26

## Why this matters

The Classement already knows a lot about each player — games played, biggest
carton, streaks, dégommages dealt and suffered — but every one of those numbers
is rendered as a number. Nothing in the app ever says *what kind of player you
are*, and around a real table that one-word verdict is what people repeat
(« ah bah forcément, t’es Le Berserker »). This plan derives six auto-attributed
epithets from aggregates the database already produces, and prints the one the
player currently wears as a small bronze line under their pseudo — on the
podium, on a friend's profile and on your own. No schema change, no migration,
no new table, no ws-server change: everything is computed at read time from the
existing events and aggregates, exactly like the rest of §5.3.

The design intent is that a title is **evolving and contested**: one title worn
at a time, and when several apply the **rarest** one (fewest current holders in
the circle) is what shows — so a title means something precisely because few
people hold it.

## Current state

All excerpts verified at commit `08f1da1`. Baselines verified passing at that
commit:

- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm --filter @degommix/web test` → **31 files / 382 tests** passing
  (`src/lib/rivalries.test.ts` contributes 26, `src/lib/queries/streaks.test.ts`
  contributes 13, `src/lib/api-payloads.test.ts` contributes 37).

### Owner-validated design decisions (do not renegotiate these)

1. **Six titles, verbatim French labels** — « L’Increvable » (most games
   played), « Le Berserker » (record dégommages in one game), « Le Miraculé »
   (won a game while being the most-dégommé of that game — any game, kept until
   beaten), « Le Pacifiste » (won with the fewest dégommages dealt),
   « Le Revenant » (won right after 3 straight losses), « L’Ombre » (least
   dégommé of the circle).
2. **One title worn at a time.** When several apply to the same player, the
   **rarest wins**: rarity = the smallest number of current holders in the
   circle. Rarity ties break on a fixed documented priority order (Step 3).
3. **Not part of the rotation**: the existing « Fléau des Gaules » tile
   (`components/stats/top-degommeur-tile.tsx`) and « Souffre-douleur du
   village » tile (`components/stats/souffre-douleur-tile.tsx`, plan 028) stay
   exactly as they are — standalone spotlight cards on the Classement. They are
   **not** titles, they never appear under a pseudo, and this plan does not
   touch either file.
4. **Circle-scoped and computed at read time** from existing aggregates. No new
   table, no migration, no new index (STOP condition if one seems needed).
5. **Cold start**: a player with no finished game holds no title, and the
   under-pseudo line simply does not render.
6. **All title strings live in one data module** (`apps/web/src/lib/titles.ts`)
   so retuning the wording after a playtest is an edit to that file only —
   same rationale as `apps/web/src/lib/degommage-messages.ts:22-26`
   (« Data, not code: retuning the mix after a playtest is an edit to these
   numbers »).

### Where each title's data already comes from (derivability, verified)

Nothing below requires a new column, table or index.

| Title | Derived from | Verified at |
|---|---|---|
| L’Increvable | `count(*)` of the member's finished, started seats — the exact aggregate `getPlayerStats` already computes as `gamesPlayed` | `apps/web/src/lib/queries/friends.ts:207-214` |
| Le Berserker | `max(game_players.degommages)` per member — same column `queryBiggestCarton` orders on | `apps/web/src/lib/queries/records.ts:120-143` |
| Le Pacifiste | `min(game_players.degommages)` over the member's **won** games (`games.winner_id = game_players.user_id`) | winner join precedent: `records.ts:97`, `stats.ts:150` |
| Le Miraculé | per-game suffered counts from `game_events` (DEGOMMAGE/UNDO) + `games.winner_id` | `apps/web/src/lib/rivalries.ts:91-102`, `queries/rivalries.ts:89-105` |
| Le Revenant | the ordered win/loss list `queryVillageResults` produces (newest first) — the same rows `computeCurrentStreaks` / `computeLongestStreaks` consume | `apps/web/src/lib/queries/records.ts:52-73`, `queries/streaks.ts:13-52` |
| L’Ombre | total non-undone suffered dégommages per member — `aggregateTakenCounts`, already used by `getSouffreDouleur` | `apps/web/src/lib/rivalries.ts:91-102`, `queries/rivalries.ts:206-234` |

**`winner_id` is non-null if and only if the outcome is `village_reached`** —
verified in `packages/game-core/src/reducer.ts`: `winnerId: pending.designatedWinnerId`
only in the `village` branch (line 105), `winnerId: null` in `abandon_total`
(line 114) and `GAME_AUTO_CLOSED` (line 126), and
`apps/ws-server/src/finalize.ts:21` persists `state.winnerId` as-is. So
`games.winner_id = game_players.user_id` is a sufficient « he won » predicate;
no `outcome` filter is needed on top of it.

### Files and their roles

- `apps/web/src/lib/rivalries.ts` — pure, db-free degommage aggregation.
  `undoneKeys` (lines 40–48) is the UNDO-cancellation rule; `aggregateTakenCounts`
  (lines 91–102) totals suffered hits per player. This plan adds a per-game
  variant next to it.
- `apps/web/src/lib/queries/rivalries.ts` — db wrappers. `finishedGameIdsForMembers`
  (lines 68–83) and `loadRivalryEvents` (lines 89–105) are **private today** and
  must be exported by this plan; `getSouffreDouleur` (206–234) shows the exact
  circle-wide call sequence to mirror.
- `apps/web/src/lib/queries/streaks.ts` — pure, db-free (no `@/lib/db` import).
  `computeCurrentStreaks` / `computeLongestStreaks` both consume a newest-first
  `StreakGameResult[]`. « Le Revenant » is a third consumer of that same list.
- `apps/web/src/lib/queries/records.ts` — `queryVillageResults(memberIds)`
  (lines 52–73) is the all-time, newest-first `village_reached` win/loss list of
  the circle. Already exported.
- `apps/web/src/lib/queries/stats.ts` — `getCircleMemberIds` (78–87) builds the
  circle. **`getLeaderboard` is deliberately NOT modified by this plan** (see
  the import-cycle note in Step 5).
- `apps/web/src/lib/queries/game-filters.ts` — exports `gameStarted` and
  `inList`, the two predicates every circle query reuses.
- `apps/web/src/lib/api-payloads.ts` — zod wire schemas. The invariant is
  documented at lines 6–12: the JSON a client query receives is
  **byte-identical** to the `initialData` the server component seeds.
- `apps/web/src/app/api/leaderboard/route.ts` and
  `apps/web/src/app/(tabs)/classement/page.tsx` — the two feeds that must stay
  byte-identical.
- `apps/web/src/components/stats/leaderboard-screen.tsx` — client shell.
- `apps/web/src/components/stats/podium.tsx` — top-3 podium; the pseudo is
  `<span className="lb-pod-name">` at line 83. **First display surface.**
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — friend profile, title
  « Faits d’armes »; the header card renders the pseudo at lines 66–76.
  **Second display surface.**
- `apps/web/src/app/(tabs)/profil/page.tsx` — own profile « Ta hutte »; the
  header renders `<h1 className="s-title">{username}</h1>` then
  `<p className="s-sub">Ta hutte</p>` (lines 36–46). **Third display surface.**
- `apps/web/src/components/stats/ranking-table.tsx` — rows 4+ of the classement.
  **Out of scope**: the row is already a 7-element flex line (rank, avatar,
  pseudo, TOI pill, « N v · N% », streak chip, dégommages, character badge) and
  a second text line under the pseudo would break its density. Explicitly not a
  display surface for this plan.

### Display surfaces as they exist today

`apps/web/src/components/stats/podium.tsx:78-96` — the pseudo and the chips
inside each podium column (a `<Link>`):

```tsx
            <PlayerAvatar
              username={row.username}
              size={row.rank === 1 ? 56 : 40}
              avatarId={row.avatarId ?? null}
            />
            <span className="lb-pod-name">{row.username}</span>
            <span className="sr-only">{`${row.wins} v · ${row.winrate}%`}</span>
            <span className="lb-chips" aria-hidden>
```

`apps/web/src/app/(tabs)/amis/[userId]/page.tsx:66-76` — the profile header
card:

```tsx
      <section className="card flex items-center gap-3 p-5">
        <PlayerAvatar username={profile.username} size={44} avatarId={profile.avatarId} />
        <div className="min-w-0">
          <p className="m-0 truncate font-bold">{profile.username}</p>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {stats.gamesPlayed} partie{stats.gamesPlayed > 1 ? 's' : ''} jouée
            {stats.gamesPlayed > 1 ? 's' : ''}
          </p>
        </div>
        {isSelf ? null : <FriendProfileActions friendId={userId} />}
      </section>
```

`apps/web/src/app/(tabs)/profil/page.tsx:36-46` — the own-profile header:

```tsx
      <header>
        <DevMenuGesture>
          <PlayerAvatar username={username} size={56} avatarId={avatarId} />
          <div>
            <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
              {username}
            </h1>
            <p className="s-sub">Ta hutte</p>
          </div>
        </DevMenuGesture>
      </header>
```

### The label idiom to match

`apps/web/src/app/globals.css:454-465`:

```css
.s-sub { margin: 0.15rem 0 0; font-size: 0.78rem; color: var(--ink-faint); }

.sec-label {
  margin: 0;
  font-size: 0.68rem;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.helper-text { font-size: 0.7rem; color: var(--bronze-strong); text-align: center; margin: 0; }
```

The title line is the **bronze italic cousin of `.sec-label`**: same ~0.68rem
micro-size and same bold-ish weight, but italic, in `--bronze-strong`, and NOT
uppercased (the labels are proper nouns — « L’Increvable » must keep its
capitalisation). It is built with Tailwind utilities in **one** shared
component, so there is exactly one place that defines the look and
`globals.css` is not touched. The bronze tokens are registered as Tailwind
colors in the `@theme` block (`globals.css:86-88`:
`--color-bronze: var(--bronze); --color-bronze-strong: var(--bronze-strong);`),
so `text-bronze-strong` is a valid utility — it is already used in the repo's
`.helper-text` equivalent styling.

### The UNDO-cancellation rule (hard constraint)

`game_players.degommages` is the reducer's non-undone count copied at close by
`apps/ws-server/src/finalize.ts`. The read-side equivalent lives in
`apps/web/src/lib/rivalries.ts:40-48`:

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

and its use in `aggregateTakenCounts` (`rivalries.ts:91-102`):

```ts
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

**Hard constraint**: every suffered-dégommage number in this plan (Le Miraculé,
L’Ombre) MUST go through `loadRivalryEvents` → a pure aggregate that reuses
`undoneKeys`. Do NOT write a SQL `count(*)` over
`game_events where type = 'DEGOMMAGE'`: undone dégommages stay in the event log
and are only cancelled by a matching `UNDO` row of the same game.

### Payload contract and conventions

`apps/web/src/lib/api-payloads.ts:6-12` documents the byte-identity invariant.
Fields added after launch are `.optional()` so old PWA-cached payloads still
parse — exemplar at `api-payloads.ts:157-161`:

```ts
      /** Optional for old PWA-cached SSR payloads (same convention as lastSeenAt). */
      currentStreak: z.number().optional(),
      favoriteCharacter: characterSchema.nullable(),
      /** Optional for old PWA-cached SSR payloads (same convention as currentStreak). */
      perCharacter: z.array(characterStatSchema).optional(),
```

`zod` is `^4.4.3` (`apps/web/package.json:23`) and `z.enum` is already used on a
readonly const tuple: `const characterSchema = z.enum(CHARACTERS)`
(`api-payloads.ts:14`) — build the title-id schema exactly the same way.

Other conventions: French UI copy with the typographic apostrophe `’`, English
identifiers and comments, TS strict, no `any`, no `console.log`. Pure helpers
live in db-free modules with co-located vitest tests
(`apps/web/vitest.config.ts` runs with no DB and no env; importing `@/lib/db`
transitively throws — this is why `rivalries.ts` is separate from
`queries/rivalries.ts`). When a test must load a module that transitively
imports `@/lib/db`, the repo stubs it — exemplar
`apps/web/src/lib/queries/records.test.ts:1-8`:

```ts
// `records.ts` reaches the database through `@/lib/db`, whose module-level
// `env` parse would throw here (unit tests run without the server env). Only
// the pure picker is under test, and it never touches `db`, so a hollow stub
// is enough to keep the import graph loadable.
vi.mock('@/lib/db', () => ({ db: {} }))
```

**This plan needs no such stub**: every new pure function lives in a module that
imports nothing from `@/lib/db`.

### E2E contract that must keep passing

`e2e/happy-path.spec.ts` asserts on the classement by test id and by accessible
name; the podium column keeps both:

```ts
    await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
    await expect(p1.getByRole('link', { name: `Voir le profil de ${J2.username}` })).toBeVisible()
```

Adding a text line **inside** the podium `<Link>` is safe: `toContainText` is a
substring assertion, and the link's accessible name comes from its explicit
`aria-label`, not from its content.

## Commands you will need

All verified at commit `08f1da1` (from the repo root; Node ≥ 22, pnpm, Turbo):

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (repo) | `pnpm typecheck` | exit 0 |
| Typecheck (web only, fast loop) | `pnpm --filter @degommix/web exec tsc --noEmit` | exit 0 |
| Lint (repo) | `pnpm lint` | exit 0 |
| Lint (web only, fast loop) | `pnpm --filter @degommix/web exec eslint src` | exit 0 |
| Web unit tests | `pnpm --filter @degommix/web test` | all pass (baseline 31 files / 382 tests) |
| One test file | `pnpm --filter @degommix/web exec vitest run src/lib/titles.test.ts` | that file passes |
| Test DB (db/ws suites only) | `docker compose -f docker-compose.test.yml up -d` | container running |
| Full test suite (serialized — DB suites share one database) | `pnpm exec turbo run test --concurrency=1` | exit 0 |
| E2E | `pnpm test:e2e` | all pass |

`pnpm typecheck` / `pnpm lint` are Turbo-cached; if they print `FULL TURBO`
without running, that is a pass.

If Docker is unavailable, run `pnpm --filter @degommix/web test` and
`pnpm --filter @degommix/game-core test` instead of the full suite and say so in
your report.

## Suggested executor toolkit

- Invoke `superpowers:verification-before-completion` before claiming done:
  paste real command output, never a summary.
- If a Drizzle API detail is unclear (`selectDistinct`, `max`/`min` inside
  `sql`), fetch current docs with Context7
  (`mcp__context7__resolve-library-id` → `query-docs` for `drizzle-orm`)
  rather than guessing.
- Reference docs in the repo: `SPECS.md` §Stats (lines 122–128) and
  `docs/superpowers/specs/2026-07-25-degommix-design.md` §5.3 (lines 314–321),
  in particular « Tout est calculé en SQL à la lecture (volumes de petit
  comité) » — the licence for read-time derivation with no new table.

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/lib/titles.ts` (create — the data module + all pure logic)
- `apps/web/src/lib/titles.test.ts` (create)
- `apps/web/src/lib/rivalries.ts` (edit — add `aggregateTakenByGame`)
- `apps/web/src/lib/rivalries.test.ts` (edit — new cases)
- `apps/web/src/lib/queries/streaks.ts` (edit — add `computeComebackWinners`)
- `apps/web/src/lib/queries/streaks.test.ts` (edit — new cases)
- `apps/web/src/lib/queries/rivalries.ts` (edit — export two existing helpers,
  nothing else)
- `apps/web/src/lib/queries/titles.ts` (create — the db layer)
- `apps/web/src/lib/api-payloads.ts` (edit — `titles` wire field)
- `apps/web/src/app/api/leaderboard/route.ts` (edit)
- `apps/web/src/app/(tabs)/classement/page.tsx` (edit)
- `apps/web/src/components/stats/player-title-line.tsx` (create)
- `apps/web/src/components/stats/podium.tsx` (edit)
- `apps/web/src/components/stats/leaderboard-screen.tsx` (edit)
- `apps/web/src/app/(tabs)/profil/page.tsx` (edit)
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` (edit)

**Out of scope** (do NOT touch, even though they look related):

- `packages/db/**` — **no schema change, no migration, no new index** (STOP
  condition if one seems needed). Titles are derived, never stored.
- `apps/ws-server/**`, `packages/game-core/**` — read-only over existing data.
- `apps/web/src/lib/queries/stats.ts` — `getLeaderboard` and `LeaderboardRow`
  keep their shape. Titles ride at the payload top level instead, to avoid an
  import cycle (Step 5 explains).
- `apps/web/src/lib/queries/records.ts` — `queryVillageResults` is reused
  as-is, unchanged.
- `apps/web/src/components/stats/top-degommeur-tile.tsx` (« Fléau des Gaules »)
  and `apps/web/src/components/stats/souffre-douleur-tile.tsx`
  (« Souffre-douleur du village ») — owner decision 3: they stay standalone
  tiles and are not part of the under-pseudo rotation.
- `apps/web/src/components/stats/ranking-table.tsx` — rows 4+ stay
  title-free (density, see "Current state").
- `apps/web/src/app/globals.css` — no new CSS; the title line is Tailwind
  utilities inside one component.
- `apps/web/src/hooks/use-tab-data.ts`, `apps/web/src/lib/query-keys.ts` —
  invalidation is prefix-matched; nothing to change.
- `e2e/**`, `SPECS.md`, docs.

## Git workflow

- Branch: `feat/032-titres-gaulois` (repo convention `type/short-slug`).
- Conventional commits in English, one per step or logical unit — exemplar from
  `git log`: `feat(web): pair win record on the head-to-head card`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the per-game suffered aggregate to `apps/web/src/lib/rivalries.ts`

Add immediately after `aggregateTakenCounts` (keep `undoneKeys` private and
reuse it — do not duplicate the key logic):

```ts
/**
 * Non-undone degommages suffered per target, **grouped by game**. Same
 * cancellation rule as `aggregateTakenCounts`: a DEGOMMAGE counts unless an
 * UNDO of the SAME game targets its `seq`. Self-degommages and rows with a
 * null actor or target are ignored. Games where every hit was undone still
 * appear with an empty inner map only if they had a DEGOMMAGE row; games with
 * no surviving hit at all are simply absent.
 */
export function aggregateTakenByGame(
  rows: readonly RivalryEventRow[]
): Map<string, Map<string, number>> {
  const undone = undoneKeys(rows)
  const byGame = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (row.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = row
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(`${row.gameId}:${row.seq}`)) continue
    const game = byGame.get(row.gameId) ?? new Map<string, number>()
    game.set(targetId, (game.get(targetId) ?? 0) + 1)
    byGame.set(row.gameId, game)
  }
  return byGame
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 2: Unit-test `aggregateTakenByGame` in `apps/web/src/lib/rivalries.test.ts`

Add a `describe('aggregateTakenByGame', …)` block reusing that file's existing
row factory. Cases (all four required):

1. `groups suffered counts per game and per target`
2. `excludes a degommage cancelled by an UNDO targeting its seq`
3. `scopes undo exclusion to its own game` — an UNDO in game `g1` must NOT
   cancel the same `seq` in game `g2` (the `${gameId}:${seq}` key)
4. `ignores self-degommages and rows with a null actor or target, and returns
   an empty map for no degommages`

**Verify**:
`pnpm --filter @degommix/web exec vitest run src/lib/rivalries.test.ts`
→ exit 0, **30 tests** (26 baseline + 4).

### Step 3: Create the pure title module `apps/web/src/lib/titles.ts`

This module must import **nothing** from `@/lib/db` and nothing from the
`queries/` layer — it is the db-free heart of the feature and its test must run
without any stub. It holds (a) every French string, (b) the derivation rules,
(c) the rarity arbitration.

```ts
/**
 * « Titres gaulois »: six auto-attributed epithets, derived at read time from
 * aggregates the circle's finished games already produce. One title is worn at
 * a time; when several apply, the rarest (fewest holders in the circle) wins.
 *
 * Pure and db-free on purpose: `apps/web/vitest.config.ts` runs unit tests with
 * no database and no env vars. Every user-visible string lives in TITLE_META —
 * retuning the wording after a playtest is an edit to this file only (same
 * rationale as lib/degommage-messages.ts).
 */

export const TITLE_IDS = [
  'increvable',
  'berserker',
  'miracule',
  'pacifiste',
  'revenant',
  'ombre',
] as const

export type TitleId = (typeof TITLE_IDS)[number]

export interface TitleMeta {
  /** Worn under the pseudo. Proper noun — never uppercased by the CSS. */
  readonly label: string
  /** One-line « comment on le gagne », shown as the line's tooltip. */
  readonly hint: string
}

/** Owner-validated wording (round 5). Data, not code. */
export const TITLE_META: Record<TitleId, TitleMeta> = {
  increvable: { label: 'L’Increvable', hint: 'Le plus de parties jouées du village' },
  berserker: { label: 'Le Berserker', hint: 'Record de dégommages dans une seule partie' },
  miracule: {
    label: 'Le Miraculé',
    hint: 'A gagné une partie en étant le plus dégommé de la table',
  },
  pacifiste: { label: 'Le Pacifiste', hint: 'A gagné en dégommant le moins' },
  revenant: { label: 'Le Revenant', hint: 'A gagné après trois défaites d’affilée' },
  ombre: { label: 'L’Ombre', hint: 'Le moins dégommé du village' },
}

/**
 * Rarity tie-break, rarest-feeling first. Only consulted when two applicable
 * titles have the SAME number of holders: « Le Miraculé » and « Le Revenant »
 * say the most about a player's table story, « L’Increvable » the least (it is
 * pure volume), so volume loses every tie.
 */
export const TITLE_PRIORITY: readonly TitleId[] = [
  'miracule',
  'revenant',
  'berserker',
  'pacifiste',
  'ombre',
  'increvable',
] as const

/** Consecutive losses that must precede the win for « Le Revenant ». */
export const COMEBACK_LOSSES = 3

/**
 * « L’Ombre » is a minimum over a cumulative counter, so a brand-new member
 * would win it on their first quiet game. Three finished games is the floor
 * that keeps the title meaningful; retune here after a playtest.
 */
export const OMBRE_MIN_GAMES = 3

/** Everything the derivation needs about one circle member. */
export interface TitlePlayerFacts {
  userId: string
  /** Finished, started games this member sat in (aborted games included). */
  gamesPlayed: number
  /** Highest dégommage count in a single game; 0 when they never dégommed. */
  bestCarton: number
  /** Lowest dégommage count among the games they won; null when they never won. */
  quietestWin: number | null
  /**
   * Highest suffered count in a game they won while being (at least tied for)
   * the most-dégommé player of that game; 0 when it never happened.
   */
  bestMiracle: number
  /** Total non-undone dégommages suffered, all-time. */
  taken: number
  /** True when they ever won right after COMEBACK_LOSSES straight losses. */
  hasComeback: boolean
}

/**
 * « Le Miraculé » value per player: the largest suffered count over the games
 * they won while being the most-dégommé of that game. A tie for most-dégommé
 * still counts (the winner did take as many hits as anyone else); a game where
 * the winner was never hit does not. Kept until beaten — that is exactly what
 * taking the maximum means.
 */
export function computeMiracleValues(
  takenByGame: ReadonlyMap<string, ReadonlyMap<string, number>>,
  winners: readonly { gameId: string; winnerId: string }[]
): Map<string, number> {
  const best = new Map<string, number>()
  for (const { gameId, winnerId } of winners) {
    const game = takenByGame.get(gameId)
    if (game === undefined) continue
    const winnerTaken = game.get(winnerId) ?? 0
    if (winnerTaken === 0) continue
    let maxTaken = 0
    for (const count of game.values()) if (count > maxTaken) maxTaken = count
    if (winnerTaken < maxTaken) continue
    if (winnerTaken > (best.get(winnerId) ?? 0)) best.set(winnerId, winnerTaken)
  }
  return best
}

/**
 * Current holders of every title, circle-wide. A title with no holder is
 * absent from the map.
 *
 * Two global rules:
 * - **Cold start**: only members with at least one finished game are eligible;
 *   a member with zero games holds nothing.
 * - **A title everyone holds says nothing**, so it is dropped when its holder
 *   set covers the whole eligible population and that population is 2+. A solo
 *   eligible member keeps their titles (there is nobody to compare them to,
 *   and the village screen shows them their own line).
 */
export function computeTitleHolders(
  facts: readonly TitlePlayerFacts[]
): Map<TitleId, Set<string>> {
  const eligible = facts.filter((f) => f.gamesPlayed > 0)
  const holders = new Map<TitleId, Set<string>>()
  if (eligible.length === 0) return holders

  const put = (id: TitleId, userIds: string[]): void => {
    if (userIds.length > 0) holders.set(id, new Set(userIds))
  }

  const maxOf = (pick: (f: TitlePlayerFacts) => number): number =>
    eligible.reduce((best, f) => Math.max(best, pick(f)), 0)

  const mostGames = maxOf((f) => f.gamesPlayed)
  put('increvable', eligible.filter((f) => f.gamesPlayed === mostGames).map((f) => f.userId))

  const bestCarton = maxOf((f) => f.bestCarton)
  if (bestCarton > 0) {
    put('berserker', eligible.filter((f) => f.bestCarton === bestCarton).map((f) => f.userId))
  }

  const bestMiracle = maxOf((f) => f.bestMiracle)
  if (bestMiracle > 0) {
    put('miracule', eligible.filter((f) => f.bestMiracle === bestMiracle).map((f) => f.userId))
  }

  const winners = eligible.filter((f) => f.quietestWin !== null)
  if (winners.length > 0) {
    const quietest = winners.reduce((best, f) => Math.min(best, f.quietestWin ?? Infinity), Infinity)
    put('pacifiste', winners.filter((f) => f.quietestWin === quietest).map((f) => f.userId))
  }

  put('revenant', eligible.filter((f) => f.hasComeback).map((f) => f.userId))

  const shadows = eligible.filter((f) => f.gamesPlayed >= OMBRE_MIN_GAMES)
  if (shadows.length > 0) {
    const fewest = shadows.reduce((best, f) => Math.min(best, f.taken), Infinity)
    put('ombre', shadows.filter((f) => f.taken === fewest).map((f) => f.userId))
  }

  if (eligible.length >= 2) {
    for (const [id, set] of [...holders]) {
      if (set.size === eligible.length) holders.delete(id)
    }
  }
  return holders
}

/**
 * The single title a player wears: the rarest one they hold (fewest holders),
 * ties broken by TITLE_PRIORITY. Null when they hold none.
 */
export function pickTitle(
  userId: string,
  holders: ReadonlyMap<TitleId, ReadonlySet<string>>
): TitleId | null {
  let best: TitleId | null = null
  let bestCount = Infinity
  for (const id of TITLE_PRIORITY) {
    const set = holders.get(id)
    if (set === undefined || !set.has(userId)) continue
    if (set.size < bestCount) {
      best = id
      bestCount = set.size
    }
  }
  return best
}

/** One member's worn title, as it crosses the wire and the props. */
export interface PlayerTitleEntry {
  userId: string
  title: TitleId
}

/**
 * Worn title of every member who has one, sorted by userId so the SSR seed and
 * the JSON route serialise identically (api-payloads.ts byte-identity rule).
 */
export function buildTitleEntries(facts: readonly TitlePlayerFacts[]): PlayerTitleEntry[] {
  const holders = computeTitleHolders(facts)
  return facts
    .flatMap((f) => {
      const title = pickTitle(f.userId, holders)
      return title === null ? [] : [{ userId: f.userId, title }]
    })
    .sort((a, b) => a.userId.localeCompare(b.userId))
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 4: Add « Le Revenant »'s comeback detector to `apps/web/src/lib/queries/streaks.ts`

This is the third consumer of the newest-first `village_reached` result list.
Add after `computeLongestStreaks`:

```ts
/**
 * Players who ever won a village game immediately after `requiredLosses`
 * consecutive losses — « Le Revenant ». Consumes the same newest-first list as
 * the two streak functions (queryVillageResults orders by ended_at desc), so
 * the per-player sequence is reversed to oldest-first before scanning: unlike a
 * run of wins, « losses THEN a win » is direction-sensitive. Aborted games never
 * reach this function (the caller filters on outcome), so they neither arm nor
 * break a comeback.
 */
export function computeComebackWinners(
  resultsNewestFirst: readonly StreakGameResult[],
  requiredLosses: number
): Set<string> {
  const byUser = new Map<string, boolean[]>()
  for (const result of resultsNewestFirst) {
    const list = byUser.get(result.userId) ?? []
    list.push(result.won)
    byUser.set(result.userId, list)
  }

  const comebacks = new Set<string>()
  for (const [userId, newestFirst] of byUser) {
    let losses = 0
    for (let i = newestFirst.length - 1; i >= 0; i -= 1) {
      if (newestFirst[i] === true) {
        if (losses >= requiredLosses) comebacks.add(userId)
        losses = 0
      } else {
        losses += 1
      }
    }
  }
  return comebacks
}
```

Note `noUncheckedIndexedAccess` is on: compare with `=== true` as written
rather than relying on truthiness of a possibly-`undefined` element.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 5: The db layer — create `apps/web/src/lib/queries/titles.ts`

First, export the two helpers this module needs from
`apps/web/src/lib/queries/rivalries.ts` — change **only** these two signatures,
nothing else in that file:

- line 68: `async function finishedGameIdsForMembers(` →
  `export async function finishedGameIdsForMembers(`
- line 89: `async function loadRivalryEvents(` →
  `export async function loadRivalryEvents(`

Append to each doc comment: `Exported for queries/titles.ts (plan 032).`

**Why titles are NOT computed inside `getLeaderboard`**: `queries/rivalries.ts`
already imports `getCircleMemberIds` from `./stats` (line 13). Making
`stats.ts` import a module that reaches back into `rivalries.ts` would create an
import cycle. So `getCircleTitles` is a sibling query, fetched next to
`getSouffreDouleur` by the two Classement feeds, and rides at the **top level**
of the leaderboard payload — not inside `rows`. `stats.ts` stays untouched.

```ts
import { and, eq, sql, gamePlayers, games } from '@degommix/db'
import { db } from '@/lib/db'
import { aggregateTakenByGame } from '@/lib/rivalries'
import {
  buildTitleEntries,
  computeMiracleValues,
  COMEBACK_LOSSES,
  type PlayerTitleEntry,
  type TitleId,
  type TitlePlayerFacts,
} from '@/lib/titles'
import { gameStarted, inList } from './game-filters'
import { queryVillageResults } from './records'
import { finishedGameIdsForMembers, loadRivalryEvents } from './rivalries'
import { getCircleMemberIds } from './stats'
import { computeComebackWinners } from './streaks'

/**
 * « Titres gaulois » — always all-time and always circle-scoped, never
 * windowed by the plan-019 month range: a title is a standing verdict on a
 * player, not a monthly statistic. Same rule as the Palmarès records.
 */

/** Finished, actually-started seats of the circle (aborted games included). */
function circleSeats(memberIds: string[]) {
  return and(
    inList(gamePlayers.userId, memberIds),
    eq(games.status, 'finished'),
    gameStarted,
    sql`${gamePlayers.status} in ('joined', 'left')`
  )
}

/**
 * Games played and biggest single-game carton per member — « L’Increvable »
 * and « Le Berserker ». `count(*)` mirrors getPlayerStats' gamesPlayed
 * (friends.ts), `max(degommages)` mirrors queryBiggestCarton (records.ts).
 */
function queryVolumeFacts(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      gamesPlayed: sql`count(*)`.mapWith(Number),
      bestCarton: sql`coalesce(max(${gamePlayers.degommages}), 0)`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(circleSeats(memberIds))
    .groupBy(gamePlayers.userId)
}

/**
 * Fewest dégommages dealt in a won game, per member — « Le Pacifiste ».
 * `winner_id = user_id` is a sufficient « he won » predicate: the reducer only
 * ever sets a winner on a village_reached close (game-core reducer.ts).
 */
function queryQuietestWins(memberIds: string[]) {
  return db
    .select({
      userId: gamePlayers.userId,
      quietestWin: sql`min(${gamePlayers.degommages})`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(circleSeats(memberIds), sql`${games.winnerId} = ${gamePlayers.userId}`))
    .groupBy(gamePlayers.userId)
}

/** Circle games that produced a winner, for « Le Miraculé ». */
function queryWonGames(memberIds: string[]) {
  return db
    .selectDistinct({ gameId: games.id, winnerId: games.winnerId })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(and(circleSeats(memberIds), sql`${games.winnerId} is not null`))
}

/**
 * Worn title of every circle member who has one, computed from the viewer's
 * own friends circle (design §5.2: a stranger met via an invite code is never
 * ranked or named). Titles are viewer-scoped by construction — two players in
 * different circles can legitimately see different titles on the same person.
 */
export async function getCircleTitles(viewerId: string): Promise<PlayerTitleEntry[]> {
  const memberIds = await getCircleMemberIds(viewerId)
  if (memberIds.length === 0) return []

  const gameIds = await finishedGameIdsForMembers(memberIds)
  const [volumeRows, quietRows, wonGameRows, eventRows, villageResults] = await Promise.all([
    queryVolumeFacts(memberIds),
    queryQuietestWins(memberIds),
    queryWonGames(memberIds),
    loadRivalryEvents(gameIds),
    queryVillageResults(memberIds),
  ])

  const takenByGame = aggregateTakenByGame(eventRows)
  const takenTotals = new Map<string, number>()
  for (const [, game] of takenByGame) {
    for (const [userId, count] of game) {
      takenTotals.set(userId, (takenTotals.get(userId) ?? 0) + count)
    }
  }

  const winners = wonGameRows.flatMap((row) =>
    row.winnerId === null ? [] : [{ gameId: row.gameId, winnerId: row.winnerId }]
  )
  const miracles = computeMiracleValues(takenByGame, winners)
  const comebacks = computeComebackWinners(villageResults, COMEBACK_LOSSES)

  const volumeById = new Map(volumeRows.map((row) => [row.userId, row]))
  const quietById = new Map(quietRows.map((row) => [row.userId, row.quietestWin]))

  const facts: TitlePlayerFacts[] = memberIds.map((userId) => ({
    userId,
    gamesPlayed: volumeById.get(userId)?.gamesPlayed ?? 0,
    bestCarton: volumeById.get(userId)?.bestCarton ?? 0,
    quietestWin: quietById.get(userId) ?? null,
    bestMiracle: miracles.get(userId) ?? 0,
    taken: takenTotals.get(userId) ?? 0,
    hasComeback: comebacks.has(userId),
  }))

  return buildTitleEntries(facts)
}

/**
 * The one title `subjectId` wears, as seen from `viewerId`'s circle. Thin
 * accessor for the profile pages — and the stable entry point any other
 * surface (e.g. a future gazette) should use rather than re-deriving titles.
 */
export async function getTitleFor(viewerId: string, subjectId: string): Promise<TitleId | null> {
  const entries = await getCircleTitles(viewerId)
  return entries.find((entry) => entry.userId === subjectId)?.title ?? null
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 6: Unit-test the pure logic

**`apps/web/src/lib/titles.test.ts`** (create). Model the structure on
`apps/web/src/lib/character-stats.test.ts` / `rivalries.test.ts`: plain vitest
`describe`/`it`/`expect`, a small facts factory, **no `vi.mock`** (nothing here
reaches `@/lib/db`). Suggested factory:

```ts
function facts(overrides: Partial<TitlePlayerFacts> & { userId: string }): TitlePlayerFacts {
  return {
    gamesPlayed: 5,
    bestCarton: 0,
    quietestWin: null,
    bestMiracle: 0,
    taken: 10,
    hasComeback: false,
    ...overrides,
  }
}
```

Cases (all 14 required):

1. `gives no title to a player with no finished game` (cold start)
2. `gives L’Increvable to the player with the most games played`
3. `shares L’Increvable between players tied on games played`
4. `gives Le Berserker to the highest single-game dégommage count`
5. `awards no Berserker when nobody ever dégommed` (all `bestCarton` 0)
6. `gives Le Pacifiste to the lowest dégommage count in a won game`
7. `ignores players who never won when awarding Le Pacifiste`
8. `gives Le Miraculé from computeMiracleValues, ties for most-dégommé included`
   (drive `computeMiracleValues` directly: a game where the winner took 3 and a
   loser took 3 → 3; a game where the winner took 1 and a loser took 4 → not
   recorded; a game where the winner was never hit → not recorded)
9. `keeps the best miracle across games` (kept until beaten)
10. `gives Le Revenant to every player flagged hasComeback`
11. `requires OMBRE_MIN_GAMES finished games for L’Ombre` (a 1-game newcomer
    with 0 taken must not steal it from a 10-game veteran)
12. `drops a title held by every eligible member` (2 eligible players, both
    tied on everything → that title is absent from the holders map)
13. `pickTitle returns the rarest applicable title` (a title with 1 holder beats
    a title with 3)
14. `pickTitle breaks a rarity tie on TITLE_PRIORITY`, plus a data-integrity
    assertion that every id in `TITLE_IDS` has a non-empty `label` and `hint`
    in `TITLE_META` and appears exactly once in `TITLE_PRIORITY`

**`apps/web/src/lib/queries/streaks.test.ts`** (edit) — add a
`describe('computeComebackWinners', …)` block, 5 cases:

1. `returns an empty set for no games`
2. `flags a win that follows exactly three losses`
3. `flags a win that follows more than three losses`
4. `does not flag a win that follows only two losses`
5. `keeps players independent` (one player's losses never arm another's win)

**Verify**:
- `pnpm --filter @degommix/web exec vitest run src/lib/titles.test.ts` → exit 0,
  14 tests
- `pnpm --filter @degommix/web exec vitest run src/lib/queries/streaks.test.ts`
  → exit 0, **18 tests** (13 baseline + 5)

### Step 7: Extend the wire schema in `apps/web/src/lib/api-payloads.ts`

Import the title ids next to the existing game-core import (line 2):

```ts
import { TITLE_IDS } from '@/lib/titles'
```

Add next to `characterStatSchema` (around line 138):

```ts
const titleIdSchema = z.enum(TITLE_IDS)

const playerTitleSchema = z.object({
  userId: z.string(),
  title: titleIdSchema,
})
```

Add at the **top level** of `leaderboardPayloadSchema`, right after the
`souffreDouleur` field (line 178) — not inside `rows`:

```ts
  /**
   * « Titres gaulois » (plan 032): the worn title of every circle member who
   * has one, all-time and never windowed by `?period=`. Optional for old
   * PWA-cached SSR payloads (same convention as currentStreak).
   */
  titles: z.array(playerTitleSchema).optional(),
```

No serializer change: the field contains no `Date`, so the SSR seed and the
JSON stay byte-identical.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0, and
`pnpm --filter @degommix/web exec vitest run src/lib/api-payloads.test.ts`
→ exit 0, 37 tests (unchanged — the new field is optional).

### Step 8: Produce `titles` on both Classement feeds

Both feeds must send the same object (byte-identity contract,
`api-payloads.ts:6-12`).

`apps/web/src/app/(tabs)/classement/page.tsx` — extend the import and the
existing `Promise.all` (lines 4 and 11–22):

```ts
import { getCircleTitles } from '@/lib/queries/titles'
...
  const [leaderboard, rivalry, souffreDouleur, rivalryPairs, season, titles] = await Promise.all([
    getLeaderboard(user.id),
    getRivalrySpotlight(user.id),
    getSouffreDouleur(user.id),
    getRivalryPairs(user.id),
    getSeasonMeta(user.id),
    getCircleTitles(user.id),
  ])

  return (
    <LeaderboardScreen
      viewerId={user.id}
      initialData={{ ...leaderboard, rivalry, souffreDouleur, rivalryPairs, season, titles }}
    />
  )
```

`apps/web/src/app/api/leaderboard/route.ts` — same sixth call, same key
(keep the 401 guard, `PRIVATE_HEADERS` and the whole `period`/`month` handling
byte-for-byte as they are; `getCircleTitles` is all-time in every period view,
like `getRivalrySpotlight` and `getSouffreDouleur`):

```ts
  const [leaderboard, rivalry, souffreDouleur, rivalryPairs, season, titles] = await Promise.all([
    getLeaderboard(session.user.id, range),
    getRivalrySpotlight(session.user.id),
    getSouffreDouleur(session.user.id),
    getRivalryPairs(session.user.id),
    getSeasonMeta(session.user.id),
    getCircleTitles(session.user.id),
  ])
  const payload: LeaderboardPayload = {
    ...leaderboard,
    rivalry,
    souffreDouleur,
    rivalryPairs,
    season,
    titles,
  }
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 9: The shared display component

Create `apps/web/src/components/stats/player-title-line.tsx` — the single
definition of the look, used by all three surfaces (no `'use client'`: it is a
plain server-compatible component, like `souffre-douleur-tile.tsx`):

```tsx
import { TITLE_META, type TitleId } from '@/lib/titles'

interface PlayerTitleLineProps {
  /** Worn title, or null when the player has none (cold start). */
  titleId: TitleId | null
  /** Podium columns are centred; the two profile headers are left-aligned. */
  align?: 'left' | 'center'
}

/**
 * « Titre gaulois » worn under a pseudo. The bronze italic cousin of
 * `.sec-label` (globals.css): same micro-size and weight, but italic, in
 * bronze, and never uppercased — « L’Increvable » is a proper noun.
 */
export function PlayerTitleLine({ titleId, align = 'left' }: PlayerTitleLineProps) {
  if (titleId === null) return null
  const meta = TITLE_META[titleId]
  return (
    <span
      className={`block max-w-full truncate text-[0.68rem] font-bold italic text-bronze-strong${
        align === 'center' ? ' text-center' : ''
      }`}
      title={meta.hint}
    >
      {meta.label}
    </span>
  )
}
```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.

### Step 10: Render the title on the three surfaces

**`apps/web/src/components/stats/podium.tsx`** — add the titles map to the
props and render the line directly under `.lb-pod-name` (line 83):

```tsx
import type { PlayerTitleEntry } from '@/lib/titles'
import { PlayerTitleLine } from './player-title-line'

interface PodiumProps {
  /** Top 3 leaderboard rows (fewer when the village is smaller). */
  rows: LeaderboardRow[]
  viewerId: string
  /** Worn titles of the circle (plan 032); empty for old cached payloads. */
  titles?: PlayerTitleEntry[]
}
```

Inside the component, before the `return`:

```tsx
  const titleByUser = new Map((titles ?? []).map((entry) => [entry.userId, entry.title]))
```

and in the column body, immediately after the `lb-pod-name` span:

```tsx
            <span className="lb-pod-name">{row.username}</span>
            <PlayerTitleLine titleId={titleByUser.get(row.userId) ?? null} align="center" />
```

Do not touch the `sr-only` span, the testid, the `aria-label`, the chips or the
socle — the e2e assertions depend on them.

**`apps/web/src/components/stats/leaderboard-screen.tsx`** — pass the payload
field through (line 114):

```tsx
          <Podium rows={podiumRows} viewerId={viewerId} titles={leaderboard.titles} />
```

**`apps/web/src/app/(tabs)/amis/[userId]/page.tsx`** — the friend profile
header:

1. Imports: `import { getTitleFor } from '@/lib/queries/titles'` and
   `import { PlayerTitleLine } from '@/components/stats/player-title-line'`.
2. Extend the existing `Promise.all` (lines 48–54) — the friends-only guard
   above already gates access; do not move or weaken it:

   ```ts
   const [stats, headToHead, sharedResult, taken, perCharacter, title] = await Promise.all([
     getPlayerStats(userId),
     isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
     isSelf ? Promise.resolve(null) : getSharedGames(me.id, userId),
     getDegommagesTaken(userId),
     getPlayerCharacterStats(userId),
     getTitleFor(me.id, userId),
   ])
   ```

   (`me.id` is the viewer, `userId` the subject — titles are always computed in
   the **viewer's** circle, so the same viewer sees consistent titles on every
   screen.)
3. Render the line between the pseudo and the « N parties jouées » line
   (inside the `<div className="min-w-0">` of lines 68–74):

   ```tsx
          <p className="m-0 truncate font-bold">{profile.username}</p>
          <PlayerTitleLine titleId={title} />
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
   ```

**`apps/web/src/app/(tabs)/profil/page.tsx`** — own profile:

1. Imports: `import { getTitleFor } from '@/lib/queries/titles'` and
   `import { PlayerTitleLine } from '@/components/stats/player-title-line'`.
2. Extend the existing `Promise.all` (lines 20–23):

   ```ts
   const [avatarId, perCharacter, title] = await Promise.all([
     getAvatarId(session.user.id),
     getPlayerCharacterStats(session.user.id),
     getTitleFor(session.user.id, session.user.id),
   ])
   ```

3. Render the line between the `<h1>` and the « Ta hutte » sub-line
   (lines 40–43):

   ```tsx
            <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
              {username}
            </h1>
            <PlayerTitleLine titleId={title} />
            <p className="s-sub">Ta hutte</p>
   ```

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → exit 0.
**Verify**: `pnpm --filter @degommix/web exec eslint src` → exit 0.

### Step 11: Full verification pass

From the repo root, in order:

1. `pnpm typecheck` → exit 0.
2. `pnpm lint` → exit 0.
3. `pnpm --filter @degommix/web test` → all pass; **32 test files / 405 tests**
   (baseline 31/382 + 4 in `rivalries.test.ts` + 5 in `streaks.test.ts` + 14 in
   the new `titles.test.ts`).
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0 (skip with an explicit
   note in your report if Docker is unavailable).
5. `pnpm test:e2e` → all pass; the `ranking-row-*` and
   `Voir le profil de …` assertions of `happy-path.spec.ts` are unaffected by
   the new line inside the podium link.
6. `git status --porcelain` → only in-scope files.

## Test plan

- `apps/web/src/lib/rivalries.test.ts` (+4 cases, Step 2): per-game grouping;
  UNDO exclusion; UNDO exclusion scoped per game; self/null rows ignored and
  empty input. Reuse that file's existing row factory.
- `apps/web/src/lib/queries/streaks.test.ts` (+5 cases, Step 6): the comeback
  detector, including the direction sensitivity (a win *before* the losses must
  not count) and player independence.
- `apps/web/src/lib/titles.test.ts` (new, 14 cases, Step 6): every title's
  award rule, the cold-start rule, the `OMBRE_MIN_GAMES` floor, the
  everyone-holds-it drop, the rarity pick, the priority tie-break, and the
  `TITLE_META` / `TITLE_PRIORITY` data-integrity check.
- No DB-backed test is added, on purpose: `apps/web` has no DB test harness
  (its vitest env has no database and no env vars), which is exactly why every
  risky rule (UNDO cancellation, comeback direction, rarity arbitration) lives
  in pure modules while `queries/titles.ts` stays a thin, typechecked shell.
- Manual cross-check against a populated dev DB, worth doing once: the holder
  of « Le Berserker » must be the same person as the « Plus gros carton » line
  of the Palmarès card (`records-card.tsx`, plan 026) — both read
  `max(game_players.degommages)` over the same circle. A mismatch means a
  predicate drifted between `queryBiggestCarton` and `queryVolumeFacts`.
- Verification: `pnpm --filter @degommix/web test` → 405 tests pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 with **405 tests** (23 new)
- [ ] `grep -c "" apps/web/src/lib/titles.ts` → the module exists; and
      `grep -n "L’Increvable\|Le Berserker\|Le Miraculé\|Le Pacifiste\|Le Revenant\|L’Ombre" apps/web/src/lib/titles.ts`
      → 6 matches, all six labels present with the typographic apostrophe
- [ ] `grep -rn "L’Increvable\|Le Berserker\|Le Miraculé\|Le Pacifiste\|Le Revenant\|L’Ombre" apps/web/src --include=*.tsx --include=*.ts | grep -v "src/lib/titles"`
      → **no matches**: every title string lives in the data module only
- [ ] `grep -n "aggregateTakenByGame" apps/web/src/lib/rivalries.ts apps/web/src/lib/queries/titles.ts`
      → at least one match in each
- [ ] `grep -n "computeComebackWinners" apps/web/src/lib/queries/streaks.ts apps/web/src/lib/queries/titles.ts`
      → at least one match in each
- [ ] `grep -n "export async function getTitleFor" apps/web/src/lib/queries/titles.ts` → 1 match
- [ ] `grep -n "titles" apps/web/src/lib/api-payloads.ts apps/web/src/app/api/leaderboard/route.ts "apps/web/src/app/(tabs)/classement/page.tsx" apps/web/src/components/stats/leaderboard-screen.tsx`
      → at least one match in each of the four files
- [ ] `grep -n "PlayerTitleLine" apps/web/src/components/stats/podium.tsx "apps/web/src/app/(tabs)/profil/page.tsx" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"`
      → at least one match in each of the three surfaces
- [ ] `git diff --stat 08f1da1..HEAD -- apps/web/src/lib/queries/stats.ts apps/web/src/components/stats/top-degommeur-tile.tsx apps/web/src/components/stats/souffre-douleur-tile.tsx apps/web/src/components/stats/ranking-table.tsx apps/web/src/app/globals.css packages/db`
      → **empty** (none of those files was touched)
- [ ] `git diff -- apps/web/src/lib/queries/rivalries.ts` shows exactly two
      changed declarations (`finishedGameIdsForMembers`, `loadRivalryEvents`
      gaining `export`) plus their doc-comment lines — no logic change
- [ ] The friends-only guard in `amis/[userId]/page.tsx` (the `areFriends` call
      and the « Faits d’armes réservés aux amis » branch, lines 32–46) is
      unchanged (`git diff` shows no hunk touching it)
- [ ] `git status --porcelain` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated (unless the dispatching reviewer
      owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `08f1da1`) — in particular if `undoneKeys` / `aggregateTakenCounts` changed
  shape in `apps/web/src/lib/rivalries.ts`, if `loadRivalryEvents` or
  `finishedGameIdsForMembers` disappeared from `queries/rivalries.ts`, or if
  `queryVillageResults` stopped ordering newest-first.
- **A schema change looks necessary.** It must not be: titles are derived at
  read time. If you conclude a `player_titles` table, a `title` column, a
  materialised view, or any migration or new index is needed, **STOP and
  report** — `packages/db` is out of scope.
- You find yourself writing a SQL `count(*)` (or any SQL aggregate) over
  `game_events` to produce a suffered-dégommage number — that violates the
  UNDO-cancellation constraint; report instead.
- **Performance**: `getCircleTitles` loads the DEGOMMAGE/UNDO rows of every
  finished circle game — the same scan `getSouffreDouleur` already does, so the
  Classement now performs it twice per request, and each profile page performs
  it once. If this is materially slow in your environment (sequential scans on
  `game_events`, a visibly slower `/classement`, `/profil` or
  `/amis/[userId]`), check that the `game_id IN (...)` predicate of
  `loadRivalryEvents` is served by the existing `game_events_game_seq` btree
  index on `(game_id, seq)` (`packages/db/src/schema/games.ts:95`) — e.g.
  `EXPLAIN` it against your dev DB — and **report the measurement rather than
  adding an index**. The intended fix, if one is ever needed, is sharing one
  `loadRivalryEvents` pass between `getSouffreDouleur` and `getCircleTitles`
  (see Maintenance notes), not new DB objects.
- `db.selectDistinct`, or `min`/`max` inside a `sql` template, does not behave
  as written after one check against current drizzle-orm docs — report rather
  than improvising raw SQL.
- Making `titles` reach the podium appears to require modifying
  `apps/web/src/lib/queries/stats.ts` or `apps/web/src/hooks/use-tab-data.ts` —
  it must not (top-level payload field, prefix-matched invalidation); report
  instead of widening scope.
- Any of the six owner-validated titles turns out **not** to be derivable from
  existing data without a schema change — report which one and why, do not
  silently substitute a different rule.
- A step's verification fails twice after a reasonable fix attempt.
- Baseline typecheck/lint/test commands fail BEFORE your first edit.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Concurrent plans — rebase rule**: plan 033 (« sceaux ») also edits
  `apps/web/src/app/(tabs)/profil/page.tsx` and
  `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`, and plan 031 (« gazette »)
  may read this module. Whichever plan lands second rebases on the first; the
  merge is textual (adjacent blocks in the same headers). After **every**
  rebase, re-verify the payload byte-identity invariant: the SSR page
  (`classement/page.tsx`) and the JSON route (`api/leaderboard/route.ts`) must
  build the same object with the same keys. The leaderboard payload has now
  accumulated fields from plans 021, 026, 027, 028 and 032 — they are strictly
  additive and independent, and each one is `.optional()`.
- **Entry point for other surfaces**: consume `getTitleFor(viewerId, subjectId)`
  from `@/lib/queries/titles` (or `getCircleTitles(viewerId)` for a whole
  circle) and render with `PlayerTitleLine`. Never re-derive titles: the rarity
  arbitration is global to the circle, so a locally recomputed title would
  disagree with the podium.
- **Reviewer focus**: (1) no schema change, no new index, no SQL count over
  `game_events`; (2) `titles` is produced by **both** the SSR page and the JSON
  route; (3) `getCircleTitles` goes through `getCircleMemberIds`, so a stranger
  met via an invite code is never given a title nor counted as a holder;
  (4) every French string is in `lib/titles.ts` and nowhere else; (5) the
  friends-only guard on `/amis/[userId]` was not touched; (6) « Fléau des
  Gaules » and « Souffre-douleur du village » are untouched and still render as
  standalone tiles.
- **Retuning knobs**, all in `apps/web/src/lib/titles.ts`: `TITLE_META`
  (wording), `TITLE_PRIORITY` (rarity tie-break), `COMEBACK_LOSSES` (3) and
  `OMBRE_MIN_GAMES` (3). Expect the last two to move after the first real
  playtest — that is why they are named constants with a unit test each.
- **Known cost, deliberately deferred**: `/classement` now performs two
  identical circle-wide `loadRivalryEvents` scans (`getSouffreDouleur` and
  `getCircleTitles`). Consolidating them behind a single pass is a clean
  follow-up; it was left out here to keep the two queries independent and the
  diff reviewable, and the volumes are friends-circle sized (design §5.3:
  « volumes de petit comité »).
- **Titles are viewer-scoped by construction.** Two players in different
  circles can see different titles on the same person, because rarity is
  computed over the viewer's circle. That is intended (every stat in this app
  is circle-scoped, design §4/§5.2), but it is the first place where a *label*
  and not just a *number* depends on who is looking — worth remembering before
  anything caches a title publicly.
- **Follow-up explicitly out of this plan**: showing a title on the ranking
  rows 4+ (density), on the game-detail player rows, in the endgame ceremony,
  and any notion of "title history" or "titles you have lost" (that would need
  the storage this plan deliberately avoids).
