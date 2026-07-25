# Plan 002: Make « Rejouer » reachable from a finished game's detail page (and, optionally, the home history)

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
>   apps/web/src/components/live/summary.tsx \
>   'apps/web/src/app/(tabs)/parties/[gameId]/page.tsx' \
>   apps/web/src/components/home/home-screen.tsx \
>   apps/web/src/components/home/game-history-item.tsx \
>   apps/web/src/lib/realtime-types.ts \
>   apps/ws-server/src/handlers/game.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-durable-invitations.md` (SOFT — this plan works and ships without 001; see "Why this matters")
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

The product spec makes « Rejouer » a first-class loop: `SPECS.md:97` —
"**« Rejouer »** = un nouveau lobby avec les mêmes joueurs ré-invités ; l'host
est celui qui tape le bouton." The server already implements it generically for
*any* finished game the caller played in, but the button exists in exactly one
place: the inline end-of-game summary. The moment a player taps the summary's
visually primary CTA (« Voir le classement », which is a one-way `router.push`),
the rematch is unreachable forever — the history rows on Accueil and the game
detail page have no action at all. So the cheapest, highest-intent moment to
start another game ("we just finished, again!") is lost to a mistap.

This plan extracts the existing rematch call into one shared client component
and renders it where finished games are already being looked at. No server work,
no new command, no schema change.

Soft dependency on plan 001: the server rejects a rematch with `ALREADY_IN_GAME`
when the caller still holds a seat (`invited` or `joined`) in any non-finished
game. Surfacing the button in more places therefore surfaces that French toast
(« Tu as déjà une partie en cours ») more often. That is acceptable and
intended — it is a truthful error. Plan 001 removes the worst cause of it
(stale `invited` seats that never expire), so this plan lands a better
experience *after* 001, but it does not need 001 to be correct.

## Current state

Files that matter, and their role:

- `apps/ws-server/src/handlers/game.ts` — the `replay:create` ws command
  (lines 62–94). Already generic; **do not modify it**.
- `apps/web/src/lib/realtime-types.ts` — typed client→server command map;
  `replay:create` is declared at lines 145–148.
- `apps/web/src/components/live/summary.tsx` — the inline end-of-game recap;
  today it is the **only** call site of `replay:create` (line 53).
- `apps/web/src/components/live/live-screen.tsx` — renders `Summary` only in the
  `state.status === 'finished'` branch (lines 98–108), i.e. only for a player
  who is still on `/partie/[gameId]` when the game ends.
- `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx` — server component; recap
  + journal of a finished game, **no action buttons at all**.
- `apps/web/src/components/home/game-history-item.tsx` — one home history row,
  a `<Link href="/parties/{id}">` wrapping the whole row.
- `apps/web/src/components/home/home-screen.tsx` — client shell of Accueil,
  renders the history rows.
- `apps/web/src/app/(tabs)/layout.tsx` — already wraps every tab route in
  `QueryProvider` → `SocketProvider` → `ToastProvider`, so a client component
  under `/parties/[gameId]` can use `useSocket`, `useToast` and
  `useInvalidateTabData` with no extra provider.

### The server command (read-only context) — `apps/ws-server/src/handlers/game.ts:62-94`

```ts
  socket.on(
    'replay:create',
    withAck(replaySchema, async ({ finishedGameId }) => {
      const [finished] = await db.select().from(games).where(eq(games.id, finishedGameId))
      if (!finished || finished.status !== 'finished') throw new CommandError('NOT_FOUND')
      const mySeat = await getSeat(db, finishedGameId, userId)
      if (!mySeat) throw new CommandError('NOT_MEMBER')
      await assertNotInGame(db, userId)
```

…then it rebuilds a lobby at the same format, re-invites every former player,
and returns `{ ok: true, gameId, code }` (line 92). `assertNotInGame`
(`apps/ws-server/src/lobby-shared.ts:33-36`) throws `ALREADY_IN_GAME` when the
caller sits as `invited` or `joined` in any non-finished game.

Covered by an integration test that must keep passing untouched:
`apps/ws-server/test/resilience.test.ts:152` —
`it('replay:create opens a new lobby and re-invites the former players', …)`.

### The only current call site — `apps/web/src/components/live/summary.tsx:36-63`

```tsx
export function Summary({ gameId, state, names, startedAt, endedAt }: SummaryProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const [replaying, setReplaying] = useState(false)
```

```tsx
  const replay = async (): Promise<void> => {
    if (!socket || replaying) return
    setReplaying(true)
    const ack = await emitWithAck(socket, 'replay:create', { finishedGameId: gameId })
    if (ack.ok) {
      // The rematch lobby becomes the resume banner on Accueil and the lobby
      // the Amis screen can invite into.
      invalidate('home', 'friends')
      router.push(`/lobby/${ack.gameId}`)
      return
    }
    setReplaying(false)
    toast(ackErrorMessage(ack), 'error')
  }
```

and its CTAs — `apps/web/src/components/live/summary.tsx:138-149`:

```tsx
      <div className="mt-auto flex flex-col gap-2">
        <Button onClick={() => router.push('/classement')}>Voir le classement</Button>
        <Button
          variant="ghost"
          disabled={replaying}
          onClick={() => {
            void replay()
          }}
        >
          Rejouer
        </Button>
      </div>
```

### The game detail page — `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx:51-58` and `108-116`

```tsx
export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { gameId } = await params
  if (!UUID_PATTERN.test(gameId)) notFound()

  const { user } = await requireOnboardedSession()
  const detail = await getGameDetail(gameId, user.id)
  if (!detail || detail.status === 'lobby') notFound()
  if (detail.status === 'active') redirect(`/partie/${gameId}`)
```

```tsx
      <div className="flex flex-col gap-2">
        <p className="sec-label m-0">Récap par joueur</p>
        {detail.players.map((player) => (
          <PlayerRecapRow key={player.userId} player={player} />
        ))}
      </div>

      <GameJournal entries={detail.journal} />
    </main>
```

Because of the two guards above, by the time the JSX renders,
`detail.status === 'finished'` is guaranteed. You do **not** need to re-check it.

### How to know the viewer is a participant (important — the finding was imprecise)

`getGameDetail` intentionally also serves **friends of participants**: see
`apps/web/src/lib/queries/stats.ts:282-287` and `315-328`. It computes
`isParticipant` internally at `apps/web/src/lib/queries/stats.ts:315`:

```ts
  const isParticipant = playerRows.some((row) => row.userId === viewerId)
  if (!isParticipant) {
```

but **it does not return that flag** — the `GameDetail` interface
(`apps/web/src/lib/queries/stats.ts:207-218`) has no such field. Do **not** add
one. Derive it in the page from the data you already have, because
`detail.players` contains exactly the `joined`/`left` seats:

```ts
const isParticipant = detail.players.some((player) => player.userId === user.id)
```

A non-participant friend viewing the page must not see the button (the server
would reject them with `NOT_MEMBER` anyway — this is a UI-honesty fix, not a
security boundary).

### Repo conventions that apply

- **French user-facing copy, English identifiers and comments.** Never translate
  identifiers; never write English in a visible string.
- Ws error toasts always go through `ackErrorMessage(ack)` from
  `apps/web/src/lib/ws-errors.ts:40-43`. `ALREADY_IN_GAME` maps to
  « Tu as déjà une partie en cours » (`apps/web/src/lib/ws-errors.ts:12`).
- Ack'd commands are sent with `emitWithAck(socket, name, payload)` from
  `apps/web/src/lib/socket.ts:79`; it resolves (never rejects) and returns a
  timeout ack after the deadline.
- After a command changes lobby/game membership, invalidate the affected
  TanStack Query payloads with `useInvalidateTabData()`
  (`apps/web/src/hooks/use-tab-data.ts:66-76`). Valid keys: `'home'`,
  `'friends'`, `'leaderboard'`.
- The CTA component is `Button` (`apps/web/src/components/ui/button.tsx`),
  props `variant?: 'primary' | 'ghost'`, `disabled`, `onClick`, `helper`.
  It is full-width by default.
- Cross-feature single-file client components live at the top of
  `apps/web/src/components/` (see `sign-out-button.tsx`, `tab-bar.tsx`,
  `connection-banner.tsx`). Feature folders are `live/`, `home/`, `stats/`,
  `friends/`, `lobby/`, `ui/`.
- TS is strict with `noUncheckedIndexedAccess` — indexing an array yields
  `T | undefined` and must be guarded.

## Commands you will need

| Purpose            | Command                                                     | Expected on success            |
|--------------------|-------------------------------------------------------------|--------------------------------|
| Install            | `pnpm install`                                              | exit 0                         |
| Typecheck (web)    | `pnpm --filter @degommix/web typecheck`                      | exit 0, no errors              |
| Typecheck (all)    | `pnpm typecheck`                                            | exit 0                         |
| Lint (all)         | `pnpm lint`                                                 | exit 0                         |
| Unit tests (web)   | `pnpm --filter @degommix/web test`                           | exit 0 (7 existing files pass) |
| Test DB (for ws)   | `docker compose -f docker-compose.test.yml up -d`            | container running              |
| All tests, serial  | `pnpm exec turbo run test --concurrency=1`                   | all pass                       |
| ws replay test     | `pnpm --filter @degommix/ws-server test`                     | all pass (needs the test DB)   |

Run everything from the repo root. Node ≥ 22, pnpm 11.13.1.

## Suggested executor toolkit

- Reference docs already in the repo: `SPECS.md` (§ « Créer / rejoindre une
  partie », line 97) and `README.md` lines 53–79 (local startup).
- If a `next-best-practices` / React-19 skill is available, use it to confirm the
  server-component → client-component boundary in step 3 (a `'use client'` leaf
  imported by an `async` server page is the correct pattern here).

## Scope

**In scope** (the only files you may modify or create):
- `apps/web/src/components/rematch-button.tsx` (create)
- `apps/web/src/components/live/summary.tsx` (modify)
- `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx` (modify)
- `apps/web/src/components/home/home-screen.tsx` (modify — **only** in the
  optional step 5)

**Out of scope** (do NOT touch, even though they look related):
- `apps/ws-server/**` — the `replay:create` command is already generic and
  tested; changing it invalidates `apps/ws-server/test/resilience.test.ts:152`
  for no gain.
- `apps/web/src/lib/realtime-types.ts` — the command's payload/result types are
  already correct.
- `apps/web/src/lib/queries/stats.ts` — do **not** add an `isParticipant` field
  to `GameDetail`; derive it in the page (see "Current state").
- `apps/web/src/components/home/game-history-item.tsx` — the whole row is an
  `<a>`; nesting a `<button>` inside it is invalid HTML and would break the
  row's tap target. If step 5 is done, the button goes in `home-screen.tsx` as a
  **sibling** of the row.
- The order/prominence of the summary's two CTAs. Making « Rejouer » primary and
  « Voir le classement » secondary is a separate product call — leave both
  exactly as they are.
- Any French copy other than reusing the existing word « Rejouer ».

## Git workflow

- Branch: `feat/rematch-from-history` (repo convention: `type/short-slug`).
- One commit per logical unit, Conventional Commits in English. Example from
  `git log`: `feat(web): arcade-style segmented controls with raised selected key`.
  Suggested messages:
  - `refactor(web): extract the rematch button from the game summary`
  - `feat(web): offer a rematch from the finished game detail page`
- Do **NOT** push and do **NOT** open a PR unless the operator explicitly asks.

## Steps

### Step 1: Create the shared `RematchButton` client component

Create `apps/web/src/components/rematch-button.tsx` with exactly this behavior —
it is a straight lift of `summary.tsx:50-63` plus a `variant` passthrough. Keep
the English comment; keep the French label « Rejouer ».

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage } from '@/lib/ws-errors'

interface RematchButtonProps {
  /** A finished game the viewer played in (SPECS.md §« Rejouer »). */
  finishedGameId: string
  variant?: 'primary' | 'ghost'
}

/**
 * « Rejouer » — asks the server for a fresh lobby at the same format with every
 * former player re-invited, then lands the caller in it as host.
 */
export function RematchButton({ finishedGameId, variant = 'ghost' }: RematchButtonProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const [pending, setPending] = useState(false)

  const rematch = async (): Promise<void> => {
    if (!socket || pending) return
    setPending(true)
    const ack = await emitWithAck(socket, 'replay:create', { finishedGameId })
    if (ack.ok) {
      // The rematch lobby becomes the resume banner on Accueil and the lobby
      // the Amis screen can invite into.
      invalidate('home', 'friends')
      router.push(`/lobby/${ack.gameId}`)
      return
    }
    setPending(false)
    toast(ackErrorMessage(ack), 'error')
  }

  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() => {
        void rematch()
      }}
    >
      Rejouer
    </Button>
  )
}
```

Note the deliberate asymmetry, matching the current code: on success `pending`
stays `true` (the navigation unmounts the component); only failure re-enables it.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0, no errors.

### Step 2: Make the summary use the shared component

In `apps/web/src/components/live/summary.tsx`:

1. Replace the second CTA (lines 140–148 in the excerpt above) with
   `<RematchButton finishedGameId={gameId} variant="ghost" />`. Leave
   « Voir le classement » untouched, still first and still primary.
2. Delete the now-dead `replay` function and the `replaying` state.
3. Delete the imports that became unused: `useState` (from `react`), `useSocket`,
   `useToast`, `useInvalidateTabData`, `emitWithAck`, `ackErrorMessage`.
   **Keep** `useRouter` — it is still used by « Voir le classement ».
4. Add `import { RematchButton } from '@/components/rematch-button'` in the
   existing import block, alphabetically among the `@/components/...` imports.
5. Do not change the `SummaryProps` interface or anything else in the file.

**Verify** — all three must hold:

```bash
grep -rn "replay:create" apps/web/src
```
→ exactly two lines: `apps/web/src/components/rematch-button.tsx` and
`apps/web/src/lib/realtime-types.ts` (the type declaration). No hit in
`summary.tsx`.

```bash
pnpm --filter @degommix/web typecheck
```
→ exit 0.

```bash
pnpm lint
```
→ exit 0 (this is what catches a leftover unused import).

### Step 3: Render the rematch button on `/parties/[gameId]`

In `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx`:

1. Add `import { RematchButton } from '@/components/rematch-button'` to the
   import block.
2. After the `if (detail.status === 'active') redirect(...)` guard and next to
   the existing `durationSeconds` / `isVictory` computations, derive:

   ```ts
   const isParticipant = detail.players.some((player) => player.userId === user.id)
   ```
3. In the JSX, immediately **after** `<GameJournal entries={detail.journal} />`
   and still inside `<main className="tab-page">`, render:

   ```tsx
   {isParticipant ? <RematchButton finishedGameId={detail.id} variant="primary" /> : null}
   ```

   `variant="primary"` is deliberate: on this page it is the only action, so it
   should read as the page's CTA (unlike in the summary, where « Voir le
   classement » owns the primary slot).
4. Change nothing else — keep `export const dynamic = 'force-dynamic'`, keep the
   `notFound()` / `redirect()` guards, keep `PlayerRecapRow` as is.

This page lives under `apps/web/src/app/(tabs)/`, whose layout already provides
`QueryProvider`, `SocketProvider` and `ToastProvider`
(`apps/web/src/app/(tabs)/layout.tsx:14-21`), so the client component's hooks
resolve. Do not add providers.

**Verify**:

```bash
pnpm --filter @degommix/web typecheck && pnpm lint
```
→ both exit 0.

```bash
grep -n "RematchButton" "apps/web/src/app/(tabs)/parties/[gameId]/page.tsx"
```
→ 2 lines (the import and the render).

### Step 4: Full verification gate

```bash
docker compose -f docker-compose.test.yml up -d
pnpm typecheck
pnpm lint
pnpm exec turbo run test --concurrency=1
```

Expected: `pnpm typecheck` exit 0, `pnpm lint` exit 0, all test tasks pass —
including `apps/ws-server/test/resilience.test.ts` whose `replay:create` test
must still pass **unchanged** (you did not touch the server).

If the ws-server tests fail with a connection/DB error rather than an
assertion error, the Postgres container is not ready — wait and re-run once
before treating it as a failure.

### Step 5 (OPTIONAL — do it only if steps 1–4 are green and you have budget)

Surface a rematch on the most recent home history entry. This is explicitly
optional: skip it and the plan is still complete. If you skip it, say so in your
report.

In `apps/web/src/components/home/home-screen.tsx` (already a `'use client'`
component, with `const { stats, activeGame } = data` and
`const lastGames = useMemo(...)` at lines 33–34):

1. Add `import { RematchButton } from '@/components/rematch-button'`.
2. Inside the `<section>` that renders the history (lines 79–90), after the
   `lastGames.map(...)` expression, add:

   ```tsx
   {activeGame === null && lastGames[0] ? (
     <RematchButton finishedGameId={lastGames[0].id} variant="ghost" />
   ) : null}
   ```

   Two guards, both cheap and both meaningful: `activeGame === null` avoids
   offering an action the server is guaranteed to reject with `ALREADY_IN_GAME`
   while a lobby/game is already open, and `lastGames[0]` is required because
   `noUncheckedIndexedAccess` types it `HomeGame | undefined`.
3. Do **not** put the button inside `GameHistoryItem` — that component's root is
   a `<Link>` (`apps/web/src/components/home/game-history-item.tsx:41-63`) and a
   `<button>` inside an `<a>` is invalid HTML.

**Verify**: `pnpm --filter @degommix/web typecheck && pnpm lint` → both exit 0.

### Step 6: Manual verification (required — there is no component test infra)

Start the stack (from `README.md:53-73`):

```bash
docker compose -f docker-compose.test.yml up -d
cp .env.example apps/web/.env.local            # skip if it already exists
export DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test
pnpm --filter @degommix/db db:migrate
pnpm dev                                        # Next.js on :3000, ws-server on :4001
```

Then, with two browser profiles (two accounts, A and B, already friends):

1. A: `/jouer` → « Créer la partie » (format 1v1) → invite B → B accepts →
   both pick a character → A: « Lancer la partie ».
2. Both: play one tap, then A: « Fin de partie » → « village atteint » → validate
   so the game reaches `finished`. Both land on the inline summary.
3. On the summary, tap « Voir le classement » (the exit that used to lose the
   rematch), then go to the Accueil tab.
   - Expected with step 5 done: a « Rejouer » button under « Historique récent ».
   - Expected without step 5: no button here; continue.
4. Tap the most recent history row → `/parties/<id>`.
   - **Expected**: the recap, the journal, and a primary « Rejouer » button at
     the bottom.
5. Tap « Rejouer ».
   - **Expected**: navigation to `/lobby/<newGameId>` where A is host at the same
     format, B appears as `invited`, and B's Accueil shows the invite banner
     « <A> t'invite ».
6. Escape hatch check: in the new lobby, A taps « Quitter le lobby » → back on
   `/jouer`. Then A reopens `/parties/<oldId>` and taps « Rejouer » again →
   a new lobby is created again (no `ALREADY_IN_GAME`).
7. `ALREADY_IN_GAME` check: with a lobby still open, A opens `/parties/<oldId>`
   and taps « Rejouer ».
   - **Expected**: red toast « Tu as déjà une partie en cours », no navigation,
     the button becomes tappable again.
8. Non-participant check: log in as C, a friend of A who did **not** play that
   game, and open `/parties/<oldId>`.
   - **Expected**: the recap and journal render, and **no** « Rejouer » button.

Record the outcome of each numbered step in your report.

## Test plan

**Fact to know before you plan tests** (verified at commit `094ddfd`): the web
app has **no component-test infrastructure**. `apps/web/vitest.config.ts` sets
`environment: 'node'` and `include: ['src/**/*.test.ts']` — `.tsx` files are not
even collected, and there is no `jsdom`, no `@testing-library/react` and no
`@vitejs/plugin-react` in `apps/web/package.json`. The seven existing web test
files are pure-logic unit tests (`apps/web/src/lib/ws-errors.test.ts`,
`apps/web/src/components/live/finish-guard.test.ts`, …).

Consequently:

- **Do NOT add a testing-library / jsdom dependency** to satisfy this plan.
  Introducing component-test infra is a separate decision, out of scope here.
- **Do NOT add a new test file.** This change extracts an existing component and
  mounts it in two more places; it contains no new branching logic worth a
  pure-unit test. `RematchButton`'s only logic is the ack branch, which is a
  verbatim lift of already-shipped code.
- The behavior of the underlying command stays covered server-side by
  `apps/ws-server/test/resilience.test.ts:152`
  (`replay:create opens a new lobby and re-invites the former players`) — it must
  keep passing untouched.
- Regression safety for this plan therefore comes from: `pnpm typecheck` +
  `pnpm lint` + the existing suites (step 4) + the manual script (step 6).
- Deferred on purpose: extending `e2e/happy-path.spec.ts` (Playwright, real
  browsers, `pnpm test:e2e`) with a rematch-from-detail leg. Do not attempt it in
  this plan — it needs a second finished game and would double the spec's
  runtime.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/web/src/components/rematch-button.tsx` exists and exports
      `RematchButton`
- [ ] `grep -rn "replay:create" apps/web/src` returns exactly 2 lines
      (`components/rematch-button.tsx`, `lib/realtime-types.ts`)
- [ ] `grep -rn "emitWithAck\|useSocket" apps/web/src/components/live/summary.tsx`
      returns no matches
- [ ] `grep -c "RematchButton" "apps/web/src/app/(tabs)/parties/[gameId]/page.tsx"`
      returns 2
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 (test DB up)
- [ ] `git status --porcelain` lists only files from the "In scope" list
- [ ] Step 6 manual script executed, with the result of each numbered item
      reported (steps 4, 5, 7 and 8 are the load-bearing ones)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code — in particular if
  `apps/web/src/components/live/summary.tsx` no longer contains
  `emitWithAck(socket, 'replay:create', { finishedGameId: gameId })`, or if
  `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx` already renders any action
  button.
- `getGameDetail`'s `GameDetail` interface has gained an `isParticipant`-style
  field (someone else did this work): reuse it instead of deriving, and report
  the deviation.
- `apps/ws-server/test/resilience.test.ts` fails **on an assertion** after your
  change. You did not touch the server, so this means something unexpected —
  do not "fix" the server.
- Making the button work seems to require touching `apps/ws-server/**`,
  `apps/web/src/lib/queries/stats.ts`, or adding a test dependency to
  `apps/web/package.json`.
- The assumption "every tab route already has `SocketProvider` +
  `ToastProvider` + `QueryProvider` from `apps/web/src/app/(tabs)/layout.tsx`"
  turns out to be false (e.g. a runtime error "useSocket must be used within
  SocketProvider" on `/parties/[gameId]`).
- A verification command fails twice after one reasonable fix attempt.

## Maintenance notes

For whoever owns this code next:

- `RematchButton` is now the single call site of `replay:create`. Any change to
  that command's payload/result (`apps/web/src/lib/realtime-types.ts:145-148`)
  touches exactly one client file.
- A reviewer should scrutinize: (a) that `summary.tsx` lost *all* of the
  now-dead imports and state and nothing else, (b) that the participant guard on
  `/parties/[gameId]` really is `detail.players.some(...)` and not a re-derived
  friendship check — `getGameDetail` deliberately also serves friends of
  participants (`apps/web/src/lib/queries/stats.ts:315-328`), and (c) that no
  `<button>` ended up nested inside the history row's `<Link>`.
- Deliberately deferred: swapping the summary's CTA prominence (« Rejouer »
  primary, « Voir le classement » ghost). That is a product call, not a
  refactor; do it as its own change so it can be judged on its own.
- Deliberately deferred: an e2e leg for rematch-from-detail (see "Test plan"),
  and any component-test infrastructure for `apps/web`.
- Interaction with plan 001 (durable invitations): once stale `invited` seats
  expire, `ALREADY_IN_GAME` on this button becomes rare. If 001 also introduces
  an explicit "expire my pending invites" path, consider whether the button
  should offer that as a recovery action instead of only a toast.
