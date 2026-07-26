# Plan 022: Make the friend profile actionable — presence, one-tap invite and rematch on `/amis/[userId]`

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
>   'apps/web/src/app/(tabs)/amis/[userId]/page.tsx' \
>   apps/web/src/hooks/use-tab-data.ts \
>   apps/web/src/components/friends/friend-profile-actions.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `596863e`, 2026-07-26

## Decision points — resolved by the owner, do NOT revisit

1. **Pure client island, nothing new server-side.** The profile page stays a
   server component; no new query, no new endpoint, no new payload field. The
   island gets `myLobbyId` and the presence seed by riding the **existing**
   `queryKeys.friends` cache (fetching `/api/friends` only on a cold cache —
   the exact pattern of `useInvitesCount`, `use-tab-data.ts:85-91`), and live
   presence from the socket-lifetime `presenceStore`. If that turns out to be
   impossible, it is a STOP condition, not a license to extend the API.
2. **Rematch on the most recent shared game only**, mirroring the Accueil
   history (`home-screen.tsx:150`: `index === 0`). Unlike Accueil, the server
   page cannot read the client's `activeGame` cache, so the button is rendered
   unconditionally on that row; if the viewer already has an open lobby/game,
   `replay:create` is rejected server-side and `RematchButton` surfaces the
   French error toast (`ackErrorMessage`) — same degraded path the Accueil
   comment already documents ("which the server would reject anyway").
3. **Invite hidden while the friend is in game** — same `isFree` rule as the
   friend row (`friend-row.tsx:38`: `presence !== 'in_game'`). The island
   renders nothing at all until the friends payload is in cache (no flash of a
   wrong « hors ligne » and no invite button without a `myLobbyId` source).
4. **Self profile gets neither island nor rematch.** `/amis/[userId]` renders
   the viewer's own stats when `isSelf`; inviting or rematching yourself is
   meaningless. The existing `isSelf` guards already isolate both spots.

## Why this matters

The friend profile `/amis/[userId]` is a dead end: aggregate tiles, a
head-to-head card, a shared-games list, and a single « Retour aux amis » link —
zero actions. Meanwhile the friend **row** that leads to it already shows live
presence and offers a one-tap invite (`friend-row.tsx`), and the Accueil
history renders the very same `GameHistoryItem` with an inline « Revanche » key
(`home-screen.tsx:150-152`). The asymmetry is literal: the screen with the most
context about a friend is the only friends surface where you can do nothing.
This plan closes it by reusing three things that already exist — the
`useInviteFriend` chain, the presence store, and `RematchButton` — behind one
small client island. No schema, endpoint, or ws-server change.

## Current state

All excerpts verified at commit `596863e`.

### Files and their roles

- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` — the friend profile, a
  fully **server-rendered** page (lines 20-123, zero client components of its
  own; `GameHistoryItem` rendered with no `action` prop at line 113).
- `apps/web/src/components/friends/friend-row.tsx` — the friend row on /amis:
  presence dot + one-tap invite + remove (lines 41-104). The interaction
  vocabulary this plan ports to the profile.
- `apps/web/src/hooks/use-invite-friend.ts` — the lobby-reuse-or-create-then-
  invite chain, usable from any client component (signature at line 32).
- `apps/web/src/hooks/use-tab-data.ts` — TanStack tab-cache hooks; contains
  the seedless cache-riding exemplar (`useInvitesCount`, lines 85-91) and the
  module-private `fetchPayload` (lines 34-40).
- `apps/web/src/lib/queries/friends.ts` — `getFriendsPageData` builds the
  friends payload: `initialPresence` and `myLobbyId` **come from this payload**
  (lines 168-176), not from the presence store.
- `apps/web/src/lib/api-payloads.ts` — `friendsPayloadSchema` (lines 73-101)
  already carries everything the island needs; **no new field**.
- `apps/web/src/lib/presence-store.ts` — module-level socket-lifetime store of
  live `presence:update` transitions (app-wide instance at line 101).
- `apps/web/src/hooks/use-presence.ts` — merges an optional per-screen seed
  UNDER the live store map (lines 28-41).
- `apps/web/src/components/ui/presence-dot.tsx` — dot + French label
  (« en ligne » / « en partie » / « hors ligne »).
- `apps/web/src/components/rematch-button.tsx` — « Revanche » client button,
  `compact` variant for inline row use (props at lines 12-18).
- `apps/web/src/components/home/game-history-item.tsx` — the history row;
  `action?: ReactNode` prop at lines 36-45 renders a trailing sibling of the
  row's `<Link>`.
- `apps/web/src/components/home/home-screen.tsx` — passes
  `action={<RematchButton … compact />}` to the same component (lines 143-155).
- `apps/web/src/components/ui/button.tsx` — arcade `Button`
  (`variant`/`size`/`fullWidth`/`disabled`/`onClick`, lines 3-14).

### The dead-end page (`apps/web/src/app/(tabs)/amis/[userId]/page.tsx`)

Header card, lines 60-69 — no presence, no action:

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
      </section>
```

Shared-games rows, lines 103-116 — `GameHistoryItem` without `action`
(line 113):

```tsx
      {isSelf ? null : (
        <section className="flex flex-col gap-2">
          <p className="sec-label">Vos parties ensemble</p>
          {sharedGames.length === 0 ? (
            <EmptyState ... />
          ) : (
            sharedGames.map((game) => <GameHistoryItem key={game.id} game={game} />)
          )}
        </section>
      )}
```

The friends-only guard at lines 27-42 (`isSelf` at line 27, « Profil réservé
aux amis » branch) must survive untouched. The page has no `'use client'`
directive and must keep none — `requireOnboardedSession` (line 22) and
`areFriends` (line 28) are server-only.

### The friend row this plan mirrors (`friend-row.tsx`)

Line 38 — the invite-visibility rule:

```tsx
  const isFree = presence !== 'in_game'
```

Lines 51-58 render `<PresenceDot presence={presence} />` under the username;
lines 87-95 render the invite as a `RoundIconButton` shown only `{isFree ?`,
wired to `onInvite` and disabled while `busy`.

### The invite chain, already client-callable (`use-invite-friend.ts:32`)

```ts
export function useInviteFriend(myLobbyId: string | null): UseInviteFriendResult {
```

It reuses the open lobby when `myLobbyId` is set (lines 47-58), otherwise
creates one and chains `lobby:invite` into it (lines 60-87), handling the
failure paths (abandons the fresh lobby, invalidates `home`/`friends`/
`invites`, toasts) and pushing to `/lobby/[gameId]` on success. Returns
`{ inviteFriend, busyFriendId }`.

### Where `myLobbyId` and presence actually come from (verified)

Both are in the **friends payload**, not the presence store.
`apps/web/src/lib/queries/friends.ts:168-176`:

```ts
    friends: friendRows.map((row) => ({
      id: row.id,
      username: row.username ?? '',
      avatarId: row.avatarId,
      initialPresence: inGameIds.has(row.id) ? ('in_game' as const) : ('offline' as const),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    })),
    myLobbyId: lobbyRows[0]?.gameId ?? null,
```

and the wire schema mirrors it, `api-payloads.ts:90-100` (`initialPresence:
presenceSchema` line 95, `myLobbyId: z.string().nullable()` line 100). The
SSR seed only distinguishes `in_game` vs `offline` (a db can't see sockets);
**live** transitions (`online` included) come from the socket-lifetime store:
`presence-store.ts:110-119` (`attachPresenceStore` wires `presence:update`
into the app-wide `presenceStore`, line 101), read through `usePresence`
(`use-presence.ts:28-41`), which merges the seed UNDER the live map. The
Amis screen composes exactly these pieces (`friends-screen.tsx:51-55` builds
the seed from `friend.initialPresence`; line 37
`useInviteFriend(myLobbyId)`); the island composes the same ones.

### The seedless cache-riding hook to copy (`use-tab-data.ts:85-91`)

```ts
export function useInvitesCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => fetchPayload('/api/invites', invitesPayloadSchema),
  })
  return data?.invites.length ?? 0
}
```

Its doc comment (lines 79-84) states the contract: same query key as the
screens, so it rides the cache they seed and every ws invalidation, and only
triggers its own fetch on a cold cache. `fetchPayload` is module-private to
`use-tab-data.ts`, which is why the new hook lives there too.
`/api/friends` exists and returns `FriendsPayload`
(`apps/web/src/app/api/friends/route.ts:14-22`, session-gated).

### The rematch pattern to mirror (`home-screen.tsx:143-155`)

```tsx
          lastGames.slice(0, HOME_HISTORY_LIMIT).map((game, index) => (
            <GameHistoryItem
              key={game.id}
              game={game}
              action={
                // Inline « Revanche » on the most recent row only. Hidden while
                // a lobby/game is open, which the server would reject anyway.
                index === 0 && activeGame === null ? (
                  <RematchButton finishedGameId={game.id} compact />
                ) : undefined
              }
            />
          ))
```

`GameHistoryItem` (`game-history-item.tsx:88-101`) turns the row into a card
whose main zone is the `<Link>` and the action a sibling — nesting stays valid
HTML. `RematchButton` (`rematch-button.tsx:24`) is a `'use client'` component;
rendering it from a server component as a prop element is standard Next.js
composition (the server page already renders client components:
`HeadToHeadCard` is one).

### Conventions and contracts that apply

- French UI copy, English identifiers/comments, TS strict, no `any`.
- The e2e suite (`e2e/happy-path.spec.ts`) never visits `/amis/[userId]`; its
  presence assertions (`p1.getByText('en ligne', { exact: true })`, line 54)
  and its lobby « Inviter » click (line 65) run on `/amis` and `/lobby/[id]`
  respectively — different routes, no selector collision with this plan.
- Baseline at `596863e`: **27 test files / 315 unit tests, all passing**
  (`pnpm --filter @degommix/web test`, verified during planning).

## Commands you will need

All from the repo root (Node ≥ 22, pnpm, Turborepo):

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Lint (whole repo) | `pnpm lint` | exit 0 |
| Typecheck (whole repo) | `pnpm typecheck` | exit 0 |
| Web unit tests only | `pnpm --filter @degommix/web test` | 315 tests pass |
| Test DB (needed by the `packages/db` + `apps/ws-server` integration suites) | `docker compose -f docker-compose.test.yml up -d` | container running |
| Full test suite (serialized — the DB suites share one database) | `pnpm exec turbo run test --concurrency=1` | exit 0 |
| E2E (needs a running app + database) | `pnpm test:e2e` | exit 0 |

Do not run `pnpm test:e2e` unless the operator gave you a running app and
database; verify the e2e non-collision by grep instead (Step 4).

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/hooks/use-tab-data.ts` (edit — add one exported hook)
- `apps/web/src/components/friends/friend-profile-actions.tsx` (create)
- `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` (edit — render the island,
  pass the `action` prop)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/lib/api-payloads.ts`, `apps/web/src/app/api/**` — **no new
  payload field, no new endpoint**. Needing one is a STOP condition.
- `apps/web/src/lib/queries/**`, `packages/**`, `apps/ws-server/**` — nothing
  new server-side.
- `apps/web/src/components/friends/friend-row.tsx`,
  `friends-screen.tsx` — the Amis screen keeps its own composition.
- `apps/web/src/hooks/use-invite-friend.ts`, `use-presence.ts`,
  `apps/web/src/lib/presence-store.ts`, `rematch-button.tsx`,
  `game-history-item.tsx` — reused as-is, not modified.
- The friends-only guard and `isSelf` logic in `page.tsx` (lines 27-42) — add
  around them, never inside them.
- `e2e/**`, `apps/web/src/app/globals.css` (existing classes suffice).

## Git workflow

- Branch: `feat/022-actionable-friend-profile` (repo convention
  `type/short-slug`).
- Conventional commits, `feat(web): ...` — exemplar from `git log`:
  `feat(web): pair win record on the head-to-head card`. One commit per step
  or logical unit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the seedless friends-cache hook

Edit `apps/web/src/hooks/use-tab-data.ts`. After `useInvitesCount` (ends
line 91), add:

```ts
/**
 * Friends payload for surfaces without an SSR seed (the friend profile
 * island). Same query key as the Amis screen, so it rides the cache that
 * screen seeds and every `friends` invalidation — it only triggers its own
 * `/api/friends` fetch on a cold cache (a hard load landing on a profile).
 * `undefined` until the first payload is available.
 */
export function useFriendsSnapshot(): FriendsPayload | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => fetchPayload('/api/friends', friendsPayloadSchema),
  })
  return data
}
```

No import changes needed: `useQuery`, `friendsPayloadSchema`, `FriendsPayload`
and `queryKeys` are already imported (lines 4-22).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Create the profile-header island

Create `apps/web/src/components/friends/friend-profile-actions.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import type { Presence } from '@degommix/game-core'
import { Button } from '@/components/ui/button'
import { PresenceDot } from '@/components/ui/presence-dot'
import { useInviteFriend } from '@/hooks/use-invite-friend'
import { usePresence } from '@/hooks/use-presence'
import { useFriendsSnapshot } from '@/hooks/use-tab-data'

interface FriendProfileActionsProps {
  friendId: string
}

/**
 * Client island of the friend profile header: live presence dot and one-tap
 * « Inviter », reusing the friends payload (myLobbyId + presence seed) via
 * the shared `friends` query cache and the socket-lifetime presence store.
 * Renders nothing until the payload is cached — an invite needs `myLobbyId`
 * from it anyway, and guessing presence before that would flash a wrong
 * « hors ligne ». Mirrors the FriendRow rules: invite only while the friend
 * is not in game (see friend-row.tsx).
 */
export function FriendProfileActions({ friendId }: FriendProfileActionsProps) {
  const data = useFriendsSnapshot()
  const friend = data?.friends.find((entry) => entry.id === friendId)

  const seed = useMemo(
    (): Record<string, Presence> | undefined =>
      friend ? { [friend.id]: friend.initialPresence } : undefined,
    [friend]
  )
  const { presenceOf } = usePresence(seed)
  const { inviteFriend, busyFriendId } = useInviteFriend(data?.myLobbyId ?? null)

  if (!friend) return null

  const presence = presenceOf(friendId)
  const isFree = presence !== 'in_game'

  return (
    <span className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
      <PresenceDot presence={presence} />
      {isFree ? (
        <Button
          size="sm"
          fullWidth={false}
          disabled={busyFriendId === friendId}
          onClick={() => void inviteFriend(friendId)}
        >
          Inviter
        </Button>
      ) : null}
    </span>
  )
}
```

Non-negotiable details:

- `'use client'` on line 1 — this file is the island; the page stays a server
  component.
- The `isFree` rule is byte-for-byte the friend row's (`friend-row.tsx:38`).
- `busyFriendId === friendId` is the same busy wiring as
  `friends-screen.tsx:165`.
- Do NOT add a remove button — removal stays on the Amis list (it needs the
  `run` command plumbing and post-removal navigation this page has no business
  duplicating).
- Do NOT store presence in component state — `usePresence` +
  `useSyncExternalStore` already make the dot live.

**Verify**: `pnpm typecheck` → exit 0. `pnpm lint` → exit 0.

### Step 3: Wire the island and the rematch action into the page

Edit `apps/web/src/app/(tabs)/amis/[userId]/page.tsx`:

1. Add two imports (with the existing component imports, lines 8-14):

   ```tsx
   import { FriendProfileActions } from '@/components/friends/friend-profile-actions'
   import { RematchButton } from '@/components/rematch-button'
   ```

2. In the header card (lines 60-69 excerpted above), append the island as the
   last child of the `<section>`, after the closing `</div>` of the
   username/games block:

   ```tsx
         {isSelf ? null : <FriendProfileActions friendId={userId} />}
   ```

   The island right-aligns itself (`ml-auto`); the card's `flex items-center
   gap-3` needs no other change. Touch nothing else in the section.

3. In the « Vos parties ensemble » branch, replace line 113:

   ```tsx
   sharedGames.map((game) => <GameHistoryItem key={game.id} game={game} />)
   ```

   with (the whole section already renders only when `!isSelf`, line 103):

   ```tsx
   sharedGames.map((game, index) => (
     <GameHistoryItem
       key={game.id}
       game={game}
       action={
         // « Revanche » on the most recent shared game only, like Accueil.
         // Unlike Accueil the server page cannot see the client's activeGame,
         // so the server-side rejection (+ error toast) is the guard.
         index === 0 ? <RematchButton finishedGameId={game.id} compact /> : undefined
       }
     />
   ))
   ```

4. Change NOTHING else: the friends-only guard (lines 27-42), the
   `Promise.all` (lines 44-48), the stat tiles, the head-to-head card, the
   fetish-character section, the empty state and the « Retour aux amis » link
   all stay byte-identical. The file must still contain no `'use client'`.

**Verify**:
```bash
pnpm typecheck                                                                    # exit 0
pnpm lint                                                                         # exit 0
grep -c "use client" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"             # prints 0
grep -n "Profil réservé aux amis" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx" # exactly 1 match
grep -n "FriendProfileActions" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"   # 2 matches (import + JSX)
grep -n "RematchButton" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"          # 2 matches (import + JSX)
```

### Step 4: Full verification pass

Run, in order, from the repo root:

1. `pnpm lint` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm --filter @degommix/web test` → **27 files / 315 tests** pass
   (unchanged baseline — this plan adds no unit tests, see Test plan).
4. With Docker available: `docker compose -f docker-compose.test.yml up -d`
   then `pnpm exec turbo run test --concurrency=1` → exit 0. Without Docker:
   report that the DB-backed suites were not run.
5. e2e non-collision by grep (the suite never opens a friend profile):
   `grep -n "amis/" e2e/happy-path.spec.ts` → no match (only `/amis` visits
   exist). Only run `pnpm test:e2e` if the operator provided a running app +
   database; the default flows are untouched by this plan.
6. `git status --porcelain` → only the three in-scope files.

Manual smoke test (only if a running app with two friend accounts is
available): open `/amis/<friendId>` as their friend → presence dot shows;
tap « Inviter » with no open lobby → lands in a fresh `/lobby/[id]` with the
invite sent (toast « Invitation envoyée ! »); back on the profile, the newest
« Vos parties ensemble » row shows « Revanche », and tapping it while that
lobby is still open shows an error toast instead of navigating.

## Test plan

- **No new unit tests, on purpose.** The three changes are pure composition of
  already-tested/already-shipped units: `useInviteFriend`, `usePresence` +
  `presenceStore`, `RematchButton`, `GameHistoryItem`'s `action` slot, and a
  seedless `useQuery` identical in shape to `useInvitesCount`. There is no new
  pure logic to extract (`find` + a `!==` comparison), and
  `apps/web/vitest.config.ts` runs a bare `node` environment — no DOM — so a
  component test harness does not exist in this app and building one is out of
  scope (same reasoning as plan 006's test plan).
- **Regression coverage** is the unchanged baseline: 27 files / 315 tests must
  still pass, and the greps in Step 3 pin the guard and the island wiring.
- **Behavioral verification** is the manual smoke test in Step 4 (or the
  operator's own E2E pass), since presence and invites need two live sockets.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 with 315 tests (no new, none
      lost)
- [ ] `grep -n "useFriendsSnapshot" apps/web/src/hooks/use-tab-data.ts` → 1
      match, and `grep -n "useFriendsSnapshot" apps/web/src/components/friends/friend-profile-actions.tsx`
      → ≥ 1 match (its only consumer)
- [ ] `grep -c "use client" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"`
      prints 0 (page stayed a server component)
- [ ] `grep -n "Profil réservé aux amis" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"`
      → exactly 1 match (guard untouched)
- [ ] `grep -n "action=" "apps/web/src/app/(tabs)/amis/[userId]/page.tsx"` → 1
      match (the rematch slot)
- [ ] `grep -rn "myLobbyId" apps/web/src/components/friends/friend-profile-actions.tsx`
      → 1 match reading `data?.myLobbyId` (no new source invented)
- [ ] `git diff --stat` touches nothing in `apps/web/src/lib/api-payloads.ts`
      or `apps/web/src/app/api/` (no wire change)
- [ ] `git status --porcelain` lists only the three in-scope files
- [ ] `plans/README.md` status row updated (unless the dispatching reviewer
      owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `596863e`) — in particular if `page.tsx` has gained client components, the
  header card (lines 60-69) or the shared-games map (line 113) was
  restructured, or the friends-only guard moved.
- **Presence or `myLobbyId` turns out not to be obtainable client-side without
  a new payload field** — e.g. `friendsPayloadSchema` no longer carries
  `initialPresence` (line 95) or `myLobbyId` (line 100), or `/api/friends`
  no longer returns `FriendsPayload`. STOP and report rather than extending
  the API — the "nothing new server-side" premise of this plan is then false.
- `useInviteFriend`'s signature is no longer
  `(myLobbyId: string | null): UseInviteFriendResult`
  (`use-invite-friend.ts:32`), or `usePresence` no longer accepts an optional
  seed record.
- `GameHistoryItem` no longer accepts an `action?: ReactNode` prop, or
  `RematchButton` no longer has the `compact` prop.
- Rendering the island appears to require adding `'use client'` to `page.tsx`
  or moving `requireOnboardedSession`/`areFriends` — both out of the question.
- A step's verification fails twice after a reasonable fix attempt.
- Baseline lint/typecheck/test commands fail BEFORE your first edit.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Coordination with plan 023 (friend-request badge/toasts)**: that plan
  touches other friends surfaces — the tabs layout and the tab-bar. The file
  sets are independent (no overlap with this plan's three files), but both
  ride the same `queryKeys.friends` cache; whichever lands second simply
  rebases, no semantic merge expected.
- **Reviewer focus**: (1) `page.tsx` must have no `'use client'` and an
  untouched friends-only guard; (2) the island must read `myLobbyId` from the
  friends payload only — a second source (prop drilled from the server, a new
  endpoint) would fork the truth the Amis screen uses; (3) the invite must
  stay hidden when `presence === 'in_game'`, matching `friend-row.tsx:38`;
  (4) no change to `api-payloads.ts` slipped in.
- **Deferred: rematch gating on `activeGame`.** Accueil hides « Revanche »
  when a lobby/game is open; the profile relies on the server rejection +
  toast instead (Decision 2). If that degraded path proves annoying in
  playtests, the fix is to move the shared-games section into a client island
  that reads the `home` cache's `activeGame` — do not add a server-side check.
- **Deferred: « hors ligne » last-seen label on the profile.** `FriendRow`
  shows `formatLastSeen(lastSeenAt)` when offline; the island shows the dot
  only. The payload field (`lastSeenAt`) and helper
  (`components/friends/last-seen.ts`) already exist if the owner wants parity.
- **Cold-cache behavior**: a hard load directly on a profile renders the
  header without dot/button until `/api/friends` responds (one fetch, then
  cached for the tab session). If that flash ever matters, the fix is seeding
  `queryKeys.friends` from the server page — weigh it against the extra
  `getFriendsPageData` call on every profile view before doing it.
