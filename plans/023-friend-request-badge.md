# Plan 023: Make friend requests arrive ambiently — global events bridge, toast, and Tribu tab badge

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 596863e..HEAD -- "apps/web/src/app/(tabs)/layout.tsx" apps/web/src/components/tab-bar.tsx apps/web/src/hooks/use-tab-data.ts apps/web/src/components/friends-events-bridge.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `596863e`, 2026-07-26

## Decision points — resolved by the owner, do NOT revisit

1. **The bridge subscribes with raw `socket.on`, not `useFriendsEvents`.**
   It mirrors `invite-events-bridge.tsx` exactly. `useFriendsEvents`
   accumulates every event in a `useState` array for as long as the component
   is mounted (`use-friends-events.ts:29`); in a mount-once layout component
   that array would grow forever. Direct `socket.on`/`socket.off` avoids it.
2. **The bridge is the SOLE toaster for `friends:event`.** Verified at
   `596863e`: exactly three components subscribe today —
   `friends-screen.tsx:41`, `play-screen.tsx:63`, `search-bar.tsx:28` — and
   **none of them toasts on an incoming event** (they only invalidate queries
   or patch local search results; their toasts fire solely on the ack of the
   user's *own* commands, e.g. « Demande envoyée ! »). This is the same
   dedupe rule the invite events follow: `invite:received` has exactly one
   side-effect owner (`InviteEventsBridge`), and the banners only read the
   patched cache. Do NOT add a toast to any screen-level `friends:event`
   handler, and do NOT route the bridge's toast through a screen.
3. **The screens' invalidation callbacks stay untouched.** When Amis or Arène
   is mounted, both the screen and the new bridge will call
   `invalidate('friends')` for the same event. That is deliberate:
   `invalidateQueries` on the same key is idempotent (the second call cancels
   the in-flight refetch and restarts it — net one fetch, no visible effect),
   and removing the screen callbacks would touch `friends-screen.tsx` /
   `play-screen.tsx`, which plan 022 (actionable friend profile) is working
   near. Duplicate *invalidation* is fine; duplicate *toasting* is the bug to
   avoid (Decision 2).
4. **Toast copy and trigger**: toast only on `kind === 'request_received'`,
   default `info` variant, French copy « {username} veut rejoindre ta
   tribu ! » — matching the Tribu tab vocabulary (`tab-bar.tsx:20`). No toast
   on `request_accepted` or `request_canceled`, and no route-based
   suppression: even on `/amis` the 4s pill plus the new request row is
   acceptable — keep it simple.
5. **Badge source = `received.length` from the existing friends cache.** No
   new endpoint, no new query key, no new CSS: a `useFriendRequestsCount`
   hook mirroring `useInvitesCount` (`use-tab-data.ts:85-91`) and a badge
   component mirroring `InvitesBadge` (`tab-bar.tsx:45-62`), reusing
   `.tab-badge` (`globals.css:961`, `pointer-events: none` so taps pass
   through).

## Why this matters

Plan 001 gave game invitations an ambient arrival surface: a mount-once
bridge in the tabs layout patches the invites cache the instant
`invite:received` lands, and a badge on the Arène tab shows the pending
count from any tab. Friend requests got none of that: the ws-server emits
`friends:event` to `user:{id}` unconditionally, but only screens that happen
to be mounted (Amis, Arène) subscribe — a request arriving while the user
sits on Accueil or Classement produces no toast, no badge, not even a cache
invalidation. It sits invisible until the user spontaneously opens the Tribu
tab. This plan closes the gap with the exact same two-piece shape: a
`FriendsEventsBridge` in the tabs layout and a `received.length` badge on
the Tribu tab. Server side needs zero changes.

## Current state

All excerpts verified at commit `596863e`.

### Files and their roles

- `apps/web/src/app/(tabs)/layout.tsx` — tabs layout; mounts the two
  existing bridges, no friends bridge.
- `apps/web/src/components/invite-events-bridge.tsx` — the pattern to
  mirror: mount-once, raw `socket.on`, cache side effects, `return null`.
- `apps/web/src/components/stats-events-bridge.tsx` — second exemplar; shows
  a bridge using `useInvalidateTabData` instead of `setQueryData`.
- `apps/web/src/hooks/use-friends-events.ts` — screen-level `friends:event`
  hook (NOT for the bridge, see Decision 1).
- `apps/web/src/components/tab-bar.tsx` — tab bar; `InvitesBadge` rendered
  only for `/jouer`.
- `apps/web/src/hooks/use-tab-data.ts` — tab query hooks; `useInvitesCount`
  is the badge-count pattern; `useInvalidateTabData` is the invalidation
  helper.
- `apps/web/src/lib/query-keys.ts:11-12` — `friends: ['friends'] as const`
  (« GET /api/friends — requests in/out, friend list, own lobby id »).
- `apps/web/src/lib/realtime-types.ts` — `FriendsEventPayload` type.
- `apps/web/src/components/ui/toast.tsx` — app toaster (`useToast`).
- `apps/ws-server/src/handlers/friends.ts` — server emitters (read-only
  context; NOT in scope).

### Tabs layout — no friends bridge

`apps/web/src/app/(tabs)/layout.tsx:14-24`:

```tsx
  return (
    <QueryProvider>
      <SocketProvider>
        <InviteEventsBridge />
        <StatsEventsBridge />
        <ConnectionBanner />
        <div className="tabs-content">{children}</div>
        <TabBar />
      </SocketProvider>
    </QueryProvider>
  )
```

### The pattern to mirror

`apps/web/src/components/invite-events-bridge.tsx:16-48` (abridged):

```tsx
export function InviteEventsBridge() {
  const { socket } = useSocket()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!socket) return
    ...
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket, queryClient])

  return null
}
```

Its doc comment states the contract this plan replicates: « It lives in the
tabs layout so `invite:received` / `invite:canceled` land no matter which tab
is on screen ».

### The event payload and the server emitters (no server change needed)

`apps/web/src/lib/realtime-types.ts:47-53`:

```ts
export type FriendsEventKind = 'request_received' | 'request_accepted' | 'request_canceled'

export interface FriendsEventPayload {
  kind: FriendsEventKind
  requestId: string
  from: { id: string; username: string }
}
```

`apps/ws-server/src/handlers/friends.ts:63-67` — emitted unconditionally to
the receiver's user room on `friends:request`:

```ts
      io.to(`user:${receiverId}`).emit('friends:event', {
        kind: 'request_received',
        requestId,
        from: { id: userId, username: await getUsername(userId) },
      })
```

`request_accepted` is emitted to the sender at `friends.ts:91-95`,
`request_canceled` to the receiver at `friends.ts:123-127`. The emit is
one-shot at command time — there is no re-delivery on reconnect.

### The three existing subscribers (screen-level, kept as-is)

`apps/web/src/components/friends/friends-screen.tsx:39-49`:

```tsx
  // A friend request lands, is accepted or is canceled: only the Amis lists
  // change, and the circle behind the Classement when it was an acceptance.
  useFriendsEvents(
    useCallback(
      (event: FriendsEventPayload) => {
        if (event.kind === 'request_accepted') invalidate('friends', 'leaderboard')
        else invalidate('friends')
      },
      [invalidate]
    )
  )
```

`apps/web/src/components/lobby/play-screen.tsx:63-71` — identical callback.
`apps/web/src/components/friends/search-bar.tsx:28-32` — patches its local
search results only (`applyFriendsEvent`), no cache or toast side effect.
No subscriber toasts on an incoming event (Decision 2).

### The friends payload already carries `received[]`

`apps/web/src/lib/queries/friends.ts:41-47`:

```ts
export interface FriendsPageData {
  received: ReceivedRequest[]
  sent: SentRequest[]
  friends: FriendEntry[]
  /** Current user's open lobby, required to send `lobby:invite`. */
  myLobbyId: string | null
}
```

`apps/web/src/lib/api-payloads.ts:73-81` — `friendsPayloadSchema` mirrors it
on the wire (`received: z.array(z.object({ requestId, senderId,
senderUsername, senderAvatarId? }))`). Nothing to add to the payload.

### Badge-count pattern to copy

`apps/web/src/hooks/use-tab-data.ts:79-91`:

```ts
/**
 * Pending-invitations count for the tab-bar badge. Same query key as the
 * screens, so the badge rides the cache they seed and every ws invalidation
 * — it only triggers its own `/api/invites` fetch on a cold cache (a hard
 * load landing outside Accueil/Arène).
 */
export function useInvitesCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => fetchPayload('/api/invites', invitesPayloadSchema),
  })
  return data?.invites.length ?? 0
}
```

`useInvalidateTabData` (`use-tab-data.ts:121-131`) returns a stable
`useCallback` that loops `queryClient.invalidateQueries({ queryKey:
queryKeys[key] })` — safe to list in a `useEffect` dependency array (the
`StatsEventsBridge` already does exactly that).

### Badge component pattern to copy

`apps/web/src/components/tab-bar.tsx:40-62`:

```tsx
/**
 * Pending-invites badge for the Arène tab. Guarded by QueryClientContext so
 * the TabBar also renders (badge-less) on routes mounted outside the (tabs)
 * layout, which provide no QueryClientProvider (e.g. /lobby/[gameId]).
 */
function InvitesBadge() {
  const client = useContext(QueryClientContext)
  if (!client) return null
  return <InvitesBadgeContent />
}

function InvitesBadgeContent() {
  const inviteCount = useInvitesCount()
  if (inviteCount === 0) return null
  return (
    <span
      className="tab-badge"
      aria-label={`${inviteCount} invitation${inviteCount > 1 ? 's' : ''} en attente`}
    >
      {inviteCount}
    </span>
  )
}
```

Render site, `tab-bar.tsx:90` (inside the `TABS.map` `<Link>`):

```tsx
            {tab.href === '/jouer' ? <InvitesBadge /> : null}
```

The Tribu tab is `{ href: '/amis', label: 'Tribu', icon: 'users', aliases: [] }`
(`tab-bar.tsx:20`). `.tab-badge` CSS exists at `globals.css:961` (absolute
pill inside `.tab-item`, `pointer-events: none`) — reuse it, no new CSS.

### Toast conventions (PR #39 — stacked pile)

`ToastProvider` is mounted once in the **root** layout
(`apps/web/src/app/layout.tsx:59`), so `useToast()` works inside the tabs
layout. The provider (`apps/web/src/components/ui/toast.tsx:33-46` doc
comment) keeps « a pile of at most three pills above the tab bar, newest on
top, auto-dismissed after 4s », and « a repeated message renew[s] its card
instead of stacking a duplicate ». API: `const { toast } = useToast()`, then
`toast(message)` for info or `toast(message, 'error')`. The `toast` function
is a stable `useCallback` — safe as an effect dependency. Existing French
copy exemplars: « Demande envoyée ! », « Vous êtes maintenant amis ! »
(`friends-screen.tsx:90,113`).

### E2E contract that must keep passing

`e2e/happy-path.spec.ts:34-47` — the friend-request leg. Note the timing:
the request is sent (line 37) while J2's page is on `/`, so the new toast
will appear there; J2 then does a full `page.goto('/amis')` (line 40), which
reloads the page and discards the toast pile before the assertions at lines
41-47. The one-shot server emit is never re-delivered to the new page's
socket, so no toast containing « Asterix » can collide with
`p2.getByText(J1.username)` (line 44). No e2e edits are expected.

### Other conventions

- French UI text, English code/comments, TS strict, no `any`.
- Unit tests are vitest, pure-function `.ts` files co-located with sources.
  There is **no** DOM/component test infra (no jsdom, no @testing-library in
  `apps/web/package.json` devDependencies) — bridges are verified by
  typecheck + e2e, like `invite-events-bridge.tsx` (which has no unit test).
- Baseline at `596863e`: **27 test files / 315 tests, all passing**
  (`pnpm --filter @degommix/web test`).

## Commands you will need

All verified at commit `596863e` (from the repo root):

| Purpose          | Command                                  | Expected on success              |
|------------------|------------------------------------------|----------------------------------|
| Install          | `pnpm install`                           | exit 0                           |
| Lint (all)       | `pnpm lint`                              | exit 0                           |
| Typecheck (all)  | `pnpm typecheck`                         | exit 0                           |
| Unit tests (web) | `pnpm --filter @degommix/web test`       | 315 tests pass (baseline)        |
| All tests        | `docker compose -f docker-compose.test.yml up -d` then `pnpm exec turbo run test --concurrency=1` | all pass |
| E2E              | `pnpm test:e2e`                          | happy-path passes                |

The integration tests (ws-server) need the docker compose Postgres up first,
and the turbo run must be serialized with `--concurrency=1`. If docker is
unavailable in your environment, run the web-filtered unit tests plus lint +
typecheck and say so in your report.

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/components/friends-events-bridge.tsx` (create)
- `apps/web/src/app/(tabs)/layout.tsx`
- `apps/web/src/hooks/use-tab-data.ts`
- `apps/web/src/components/tab-bar.tsx`

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/hooks/use-friends-events.ts` — stays the screen-level hook;
  the bridge deliberately does not use it (Decision 1).
- `apps/web/src/components/friends/friends-screen.tsx`,
  `apps/web/src/components/lobby/play-screen.tsx`,
  `apps/web/src/components/friends/search-bar.tsx` — their handlers stay
  as-is (Decision 3); plan 022 works near these files.
- `apps/ws-server/**` — the server already emits everything needed.
- `apps/web/src/app/globals.css` — reuse `.tab-badge`; no new CSS.
- `apps/web/src/lib/query-keys.ts`, `apps/web/src/lib/api-payloads.ts`,
  `apps/web/src/lib/realtime-types.ts` — nothing to add.
- `e2e/**` — the spec must pass unchanged.

## Git workflow

- Branch: `git checkout -b feat/023-friend-request-badge` (repo convention
  `type/short-description`).
- Conventional commits, `feat(web): ...` — exemplar from `git log`:
  `feat(web): month-to-date leaderboard window and win-streak chips`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the friends events bridge

Create `apps/web/src/components/friends-events-bridge.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useSocket } from '@/components/socket-provider'
import { useToast } from '@/components/ui/toast'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import type { FriendsEventPayload } from '@/lib/realtime-types'

/**
 * Mount-once bridge between `friends:event` and the tab query cache. It
 * lives in the tabs layout so a friend request landing while the user sits
 * on Accueil or Classement still refreshes the Tribu badge and shows a
 * toast — mirroring what `InviteEventsBridge` does for invitations. The
 * Amis and Arène screens keep their own invalidation (duplicate
 * `invalidateQueries` on the same key coalesces into one refetch), but this
 * bridge is the ONLY `friends:event` subscriber allowed to toast.
 */
export function FriendsEventsBridge() {
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()

  useEffect(() => {
    if (!socket) return
    const onFriendsEvent = (payload: FriendsEventPayload): void => {
      // An acceptance reshapes the friends circle the Classement is built
      // from; the other kinds only touch the Amis lists and the badge.
      if (payload.kind === 'request_accepted') invalidate('friends', 'leaderboard')
      else invalidate('friends')
      if (payload.kind === 'request_received') {
        toast(`${payload.from.username} veut rejoindre ta tribu !`)
      }
    }
    socket.on('friends:event', onFriendsEvent)
    return () => {
      socket.off('friends:event', onFriendsEvent)
    }
  }, [socket, invalidate, toast])

  return null
}
```

Both `invalidate` and `toast` are stable callbacks (see "Current state"), so
the effect re-runs only when the socket instance changes — same lifecycle as
the two existing bridges.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web lint` → exit 0.

### Step 2: Mount it in the tabs layout

Edit `apps/web/src/app/(tabs)/layout.tsx`: add
`import { FriendsEventsBridge } from '@/components/friends-events-bridge'`
(alphabetical, between the `ConnectionBanner` and `InviteEventsBridge`
imports) and render it next to the other bridges:

```tsx
        <InviteEventsBridge />
        <StatsEventsBridge />
        <FriendsEventsBridge />
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 3: Add the request-count hook

Edit `apps/web/src/hooks/use-tab-data.ts` — directly after
`useInvitesCount` (line 91), add:

```ts
/**
 * Pending friend-request count for the Tribu tab badge. Same query key as
 * the Amis/Arène screens, so it rides their SSR-seeded cache and every
 * `friends:event` invalidation — it only fetches `/api/friends` itself on a
 * cold cache (a hard load landing on a tab that does not seed it).
 */
export function useFriendRequestsCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => fetchPayload('/api/friends', friendsPayloadSchema),
  })
  return data?.received.length ?? 0
}
```

(`friendsPayloadSchema` and `queryKeys` are already imported in this file.)

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 4: Badge on the Tribu tab

Edit `apps/web/src/components/tab-bar.tsx`:

1. Extend the hooks import (line 8):
   `import { useFriendRequestsCount, useInvitesCount } from '@/hooks/use-tab-data'`
2. After `InvitesBadgeContent` (line 62), add the mirrored pair — the
   `QueryClientContext` guard is load-bearing (routes outside the tabs
   layout render the TabBar with no QueryClientProvider):

```tsx
/** Pending friend-requests badge for the Tribu tab; same guard as above. */
function FriendRequestsBadge() {
  const client = useContext(QueryClientContext)
  if (!client) return null
  return <FriendRequestsBadgeContent />
}

function FriendRequestsBadgeContent() {
  const requestCount = useFriendRequestsCount()
  if (requestCount === 0) return null
  return (
    <span
      className="tab-badge"
      aria-label={`${requestCount} demande${requestCount > 1 ? 's' : ''} d'ami en attente`}
    >
      {requestCount}
    </span>
  )
}
```

3. Change the render site (line 90) to cover both badged tabs:

```tsx
            {tab.href === '/jouer' ? <InvitesBadge /> : null}
            {tab.href === '/amis' ? <FriendRequestsBadge /> : null}
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web lint` → exit 0.

### Step 5: Full verification pass

From the repo root, in order:

1. `pnpm lint` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm --filter @degommix/web test` → 27 files / 315 tests pass
   (unchanged — this plan adds no unit tests, see Test plan).
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → all pass (skip only if
   docker is unavailable; report it).
5. `pnpm test:e2e` → happy-path passes unchanged.
6. `git status --porcelain` → only the four in-scope files.

## Test plan

- **No new unit tests.** The bridge's logic is a two-branch switch with no
  extractable pure function, and the repo has no DOM/component test infra
  (verified: `apps/web/package.json` devDependencies contain no jsdom or
  @testing-library; all 27 existing test files are pure-function `.ts`).
  `invite-events-bridge.tsx` and `stats-events-bridge.tsx` — the two
  exemplars — carry no unit tests either. Matching the house pattern, the
  wiring is verified by typecheck, lint, and the e2e friend-request leg.
- **E2E coverage that exercises this code**: `e2e/happy-path.spec.ts:34-47`
  drives a real `friends:request` → `friends:event` round-trip; with the
  bridge mounted, J1's list refresh at line 47 now also flows through the
  bridge's `invalidate('friends')`. The spec must pass with zero edits.
- Verification: `pnpm --filter @degommix/web test` → 315 tests,
  `pnpm test:e2e` → green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 (315 tests, unchanged)
- [ ] `pnpm test:e2e` exits 0 with `e2e/happy-path.spec.ts` unmodified
- [ ] `grep -n "FriendsEventsBridge" "apps/web/src/app/(tabs)/layout.tsx"` → import + render match
- [ ] `grep -n "veut rejoindre ta tribu" apps/web/src/components/friends-events-bridge.tsx` → one match
- [ ] `grep -n "useFriendRequestsCount" apps/web/src/hooks/use-tab-data.ts apps/web/src/components/tab-bar.tsx` → at least one match in each file
- [ ] `grep -n "'/amis' ? <FriendRequestsBadge" apps/web/src/components/tab-bar.tsx` → one match
- [ ] `grep -rn "toast" apps/web/src/components/friends/friends-screen.tsx apps/web/src/components/lobby/play-screen.tsx apps/web/src/components/friends/search-bar.tsx | grep -i "friends:event\|useFriendsEvents"` → no matches (no screen toasts on incoming events — single-toaster rule intact)
- [ ] `git status --porcelain` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift since
  `596863e`) — in particular if the tabs layout already mounts a friends
  bridge, if `tab-bar.tsx` already renders a badge for `/amis`, or if any
  `friends:event` subscriber beyond the three listed exists
  (`grep -rn "friends:event\|useFriendsEvents" apps/web/src --include="*.ts*" | grep -v ".test."`
  must only show the hook, `realtime-types.ts`, the `use-tab-data.ts` doc
  comment, and the three screens).
- Any existing screen handler turns out to toast on an incoming
  `friends:event` — mounting the bridge would then double-toast; report
  instead of picking which toaster to keep.
- `pnpm test:e2e` fails on the friend-request leg with a Playwright strict-
  mode violation (two elements matching a username) — that means the new
  toast survived onto a page where the spec asserts by username, which
  contradicts the timing analysis in "Current state"; report, do not edit
  the spec.
- The change appears to require touching `use-friends-events.ts`, either
  screen, the ws-server, or `globals.css` — all out of scope.
- Baseline lint/typecheck/test commands fail BEFORE your first edit.
- Note: plan 022 (actionable friend profile) may be in flight on other
  friends surfaces. Its files are disjoint from this plan's four; if you
  find them overlapping anyway, STOP — whichever plan lands second rebases.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Reviewer focus**: (1) the bridge uses raw `socket.on`, not
  `useFriendsEvents` (Decision 1 — unbounded array otherwise); (2) it is the
  only `friends:event` subscriber that toasts; (3) the badge sits inside the
  tab's `<Link>` next to `<InvitesBadge />` and keeps the
  `QueryClientContext` guard, or routes outside the tabs layout crash.
- Plan 022 touches other friends surfaces (friend profile). Independent
  files by design — whichever lands second rebases.
- The screens' `useFriendsEvents` invalidation callbacks
  (`friends-screen.tsx:41`, `play-screen.tsx:63`) are now redundant with the
  bridge and could be deleted in a later cleanup — deferred here to keep out
  of plan 022's way. `search-bar.tsx:28` is NOT redundant (it patches local
  search-result flags, which no invalidation refreshes) and must survive any
  such cleanup.
- If a toast is ever wanted on `request_accepted` (« X a accepté ta
  demande ! »), add it in this bridge only — the single-toaster rule is what
  keeps the pile duplicate-free.
- If Web Push lands (V2 backlog), `request_received` handling belongs in the
  service worker for closed-app delivery; this bridge stays the open-app
  path.
