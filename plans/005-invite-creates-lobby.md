# Plan 005: « Inviter » from the Amis tab creates the lobby when there is none

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
>   apps/web/src/components/friends/friends-screen.tsx \
>   apps/web/src/components/friends/friend-row.tsx \
>   apps/web/src/lib/realtime-types.ts \
>   apps/ws-server/src/handlers/lobby.ts \
>   apps/web/src/lib/queries/friends.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: `plans/004-presence-snapshot.md` (SOFT — availability display only),
  `plans/001-durable-invitations.md` (SOFT — `ALREADY_IN_GAME` semantics).
  Neither is required: this plan is correct and shippable on its own.
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

`SPECS.md:87` promises: "Un ami peut être **invité en un tap** dans une partie,
sans code." Today the Amis tab does the opposite in the most common situation.
The invite button is shipped **disabled** unless the user already has an open
lobby, with the label « Crée d'abord un salon dans l'onglet Jouer », plus a
helper line « Crée un salon depuis l'onglet Jouer pour inviter tes amis. » So the
default state of the headline feature is a dead button that tells you to go
somewhere else: tap → read → switch tab → choose a format → create → come back →
tap again. Six steps instead of one.

The server already supports the one-tap flow — `replay:create` proves the
composition is legal by chaining `createLobby` + `inviteSeat` +
`invite:received` + `broadcastLobbyState` in a single command. This plan does the
same chaining **on the client**, with the two existing ack'd commands
(`lobby:create` then `lobby:invite`), so no server change and no new command are
needed. After this, tapping invite with no lobby creates a 1v1 lobby, invites the
friend, and drops the user in the lobby screen where the existing controls let
them change the format, invite more friends, or leave.

## Current state

Files that matter, and their role:

- `apps/web/src/components/friends/friends-screen.tsx` — client shell of the Amis
  tab; owns the socket, the `run()` ack helper, the busy state and the invite
  callback. **This is where the chaining goes.**
- `apps/web/src/components/friends/friend-row.tsx` — one friend row; owns the
  invite button and its disabled state/label.
- `apps/web/src/lib/realtime-types.ts` — the typed command map; `lobby:create`
  (lines 97–100), `lobby:invite` (101–104) and `lobby:leave` (129–132).
- `apps/ws-server/src/handlers/lobby.ts` — server handlers for those commands.
  **Read-only for this plan.**
- `apps/web/src/lib/queries/friends.ts` — SSR payload; `myLobbyId` is a *joined*
  seat in a game whose status is `lobby` (lines 111–122, 158).
- `apps/web/src/components/lobby/lobby-screen.tsx` — the destination screen, and
  the escape hatch (« Quitter le lobby »).
- `apps/web/src/components/lobby/play-screen.tsx` — the Jouer tab; contains the
  exact `lobby:create` + navigate pattern to copy.

### The gate — `apps/web/src/components/friends/friends-screen.tsx:155-180`

```tsx
            {friends.map((friend) => (
              <FriendRow
                key={friend.id}
                friendId={friend.id}
                username={friend.username}
                presence={presenceOf(friend.id)}
                canInvite={myLobbyId !== null}
                busy={busyKey === friend.id}
                onInvite={() => {
                  if (!myLobbyId) return
                  void run(
                    friend.id,
                    'lobby:invite',
                    { gameId: myLobbyId, friendId: friend.id },
                    'Invitation envoyée !'
                  )
                }}
                onRemove={() => void run(friend.id, 'friends:remove', { friendId: friend.id })}
              />
            ))}
            {!myLobbyId && hasInvitableFriend ? (
              <p className="helper-text">
                Crée un salon depuis l&apos;onglet Jouer pour inviter tes amis.
              </p>
            ) : null}
```

`hasInvitableFriend` is defined at `apps/web/src/components/friends/friends-screen.tsx:92`:

```tsx
  const hasInvitableFriend = friends.some((friend) => presenceOf(friend.id) !== 'in_game')
```

and is used **only** by that helper paragraph.

### The disabled button — `apps/web/src/components/friends/friend-row.tsx:98-112`

```tsx
      ) : (
        <div className="flex items-center gap-2">
          {isFree ? (
            <RoundIconButton
              icon="user-add"
              label={
                canInvite
                  ? `Inviter ${username} dans ton salon`
                  : 'Crée d’abord un salon dans l’onglet Jouer'
              }
              tone="accent"
              disabled={busy || !canInvite}
              onClick={onInvite}
            />
          ) : null}
```

with `isFree` at `apps/web/src/components/friends/friend-row.tsx:46`
(`const isFree = presence !== 'in_game'`) and the prop declared at lines 21–30:

```tsx
interface FriendRowProps {
  friendId: string
  username: string
  presence: Presence
  /** True when the current user has an open lobby to invite into. */
  canInvite: boolean
  busy: boolean
  onInvite: () => void
  onRemove: () => void
}
```

`RoundIconButton` (`apps/web/src/components/friends/round-icon-button.tsx:33-43`)
renders a `<button type="button">` whose `aria-label` **and** `title` are the
`label` prop — so the label is the accessible name you will assert on manually.

### The `run()` helper you must reuse — `apps/web/src/components/friends/friends-screen.tsx:55-84`

```tsx
  const run = useCallback(
    async <K extends CommandName>(
      key: string,
      event: K,
      payload: CommandMap[K]['payload'],
      successMessage?: string
    ): Promise<boolean> => {
      if (!socket) {
        toast(DELIVERY_FAILED_MESSAGE, 'error')
        return false
      }
      setBusyKey(key)
      const ack = await emitWithAck(socket, event, payload)
      setBusyKey(null)
      if (!ack.ok) {
        toast(ackErrorMessage(ack), 'error')
        return false
      }
      if (successMessage) toast(successMessage)
      // Accepting or removing reshapes the friends circle, which is what the
      // ranking is built from; the other commands only touch the Amis lists.
      if (event === 'friends:respond' || event === 'friends:remove') {
        invalidate('friends', 'leaderboard')
      } else if (event !== 'lobby:invite') {
        invalidate('friends')
      }
      return true
    },
    [socket, toast, invalidate]
  )
```

**Critical limitation**: `run()` returns a `boolean`, not the ack payload. The
chain needs `ack.gameId` from `lobby:create`, so the new path must call
`emitWithAck` directly (same as `play-screen.tsx` does). Keep `run()` for the
already-have-a-lobby path — do not rewrite it, and do not change its signature.

### The pattern to copy — `apps/web/src/components/lobby/play-screen.tsx:76-90`

```tsx
  const handleCreate = useCallback(async () => {
    if (creating) return
    if (!socket) {
      toast(CONNECTING_MESSAGE)
      return
    }
    setCreating(true)
    const ack = await emitWithAck(socket, 'lobby:create', { format })
    if (ack.ok) {
      router.push(`/lobby/${ack.gameId}`)
      return
    }
    setCreating(false)
    toast(ackErrorMessage(ack), 'error')
  }, [creating, socket, format, router, toast])
```

The destination route is **`/lobby/[gameId]`** — `apps/web/src/app/lobby/[gameId]/page.tsx`
(it is *not* nested under `(tabs)/jouer`; the Jouer tab is
`apps/web/src/app/(tabs)/jouer/page.tsx`, which just renders `<PlayScreen />`).
The lobby page guards access itself: `if (access.status !== 'lobby' || !access.isMember) redirect('/jouer')`
(`apps/web/src/app/lobby/[gameId]/page.tsx:21`).

### The escape hatch (name it to the user, do not build a new one)

`apps/web/src/components/lobby/lobby-screen.tsx:210-212`:

```tsx
      <Button variant="ghost" onClick={() => void handleLeave()} disabled={busy}>
        Quitter le lobby
      </Button>
```

`handleLeave` (same file, lines 126–136) calls the `lobby:leave` command via
`apps/web/src/hooks/use-lobby.ts:75`
(`const leave = useCallback(() => run('lobby:leave', { gameId }), [run, gameId])`)
and then `router.replace('/jouer')`. So a mistap costs exactly one extra tap:
« Quitter le lobby ». That is the whole mitigation — do **not** add a
confirmation dialog before creating.

### Server-side facts that shape the error handling (read-only)

`lobby:create` — `apps/ws-server/src/handlers/lobby.ts:78-87`:

```ts
    'lobby:create',
    withAck(createSchema, async ({ format }) => {
      await assertNotInGame(db, userId)
      const { gameId, code } = await createLobby(ctx, userId, format)
```

`assertNotInGame` (`apps/ws-server/src/lobby-shared.ts:33-36`) throws
`ALREADY_IN_GAME` when the caller already sits as `invited` **or** `joined` in
any non-finished game. So `lobby:create` can legitimately fail even though the
client's `myLobbyId` was `null` — `myLobbyId` only tracks *joined* seats in
*lobby*-status games (`apps/web/src/lib/queries/friends.ts:111-122`), while a
pending invitation the user never answered also blocks creation. Your code must
handle that ack failure, not assume success.

`lobby:invite` — `apps/ws-server/src/handlers/lobby.ts:89-117` — requires: the
game is still a lobby, the caller's seat is `joined`, the target is a friend
(`INVALID_TARGET`), the target has no *joined* active game (`ALREADY_IN_GAME`),
and `seats.length < game.format` (`LOBBY_FULL`). With format 2, the host holds
one seat, so exactly one invite fits — inviting a second friend requires raising
the format first via the existing `lobby:set_format` control in the lobby screen
(`apps/web/src/components/lobby/lobby-screen.tsx:200`).

### Repo conventions that apply

- **French user-facing copy, English identifiers and comments.** The existing
  success toast string is « Invitation envoyée ! » — reuse it verbatim.
- Ws error toasts always go through `ackErrorMessage(ack)`
  (`apps/web/src/lib/ws-errors.ts:40-43`); a missing socket uses
  `DELIVERY_FAILED_MESSAGE` (`apps/web/src/lib/ws-errors.ts:5`).
- `emitWithAck` (`apps/web/src/lib/socket.ts:79`) resolves — never rejects — and
  returns a timeout ack after the deadline.
- Membership changes invalidate TanStack payloads via `useInvalidateTabData()`
  (`apps/web/src/hooks/use-tab-data.ts:66-76`); keys: `'home'`, `'friends'`,
  `'leaderboard'`.
- Callbacks are wrapped in `useCallback` with exhaustive deps (the repo follows
  `next/core-web-vitals`, so a missing dep is a lint failure).
- TS strict + `noUncheckedIndexedAccess`; no `any`.

## Commands you will need

| Purpose            | Command                                              | Expected on success            |
|--------------------|------------------------------------------------------|--------------------------------|
| Install            | `pnpm install`                                       | exit 0                         |
| Typecheck (web)    | `pnpm --filter @degommix/web typecheck`               | exit 0, no errors              |
| Typecheck (all)    | `pnpm typecheck`                                     | exit 0                         |
| Lint (all)         | `pnpm lint`                                          | exit 0                         |
| Unit tests (web)   | `pnpm --filter @degommix/web test`                    | exit 0 (7 existing files pass) |
| Test DB (for ws)   | `docker compose -f docker-compose.test.yml up -d`     | container running              |
| All tests, serial  | `pnpm exec turbo run test --concurrency=1`            | all pass                       |
| E2E (optional)     | `pnpm test:e2e`                                      | all pass                       |

Run everything from the repo root. Node ≥ 22, pnpm 11.13.1.

## Suggested executor toolkit

- Read `SPECS.md` lines 80–99 first (the Amis and « Créer / rejoindre une
  partie » sections) — it is the product contract this plan restores.
- `README.md:53-79` for local startup (Docker Postgres on port 54329, `pnpm dev`
  runs Next.js and the ws-server together).

## Scope

**In scope** (the only files you may modify):
- `apps/web/src/components/friends/friends-screen.tsx`
- `apps/web/src/components/friends/friend-row.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `apps/ws-server/**` — no new command, no handler change. The whole point is
  that `lobby:create` + `lobby:invite` already exist and are already guarded.
  Adding a server-side "create-and-invite" command is a different, larger design.
- `apps/web/src/lib/realtime-types.ts` — both commands are already typed.
- `apps/web/src/lib/queries/friends.ts` and `apps/web/src/lib/api-payloads.ts` —
  `myLobbyId` stays exactly as it is.
- `apps/web/src/components/lobby/**` — the lobby screen already has the format
  control and « Quitter le lobby ». Do not duplicate them.
- The `run()` helper's signature and invalidation rules in `friends-screen.tsx`.
- The default format: it is **2**. Do not add a format picker to the Amis tab —
  the host adjusts the format in the lobby screen afterwards.

## Git workflow

- Branch: `feat/invite-creates-lobby` (repo convention: `type/short-slug`).
- Conventional Commits in English. Example from `git log`:
  `feat(web): arcade-style segmented controls with raised selected key`.
  Suggested message:
  `feat(web): invite a friend in one tap by creating the lobby on demand`
- Do **NOT** push and do **NOT** open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add the chaining invite handler in `friends-screen.tsx`

In `apps/web/src/components/friends/friends-screen.tsx`:

1. Add `import { useRouter } from 'next/navigation'` to the import block and
   `const router = useRouter()` next to the other hooks at the top of
   `FriendsScreen` (it does not import the router today).
2. Add a `DEFAULT_INVITE_FORMAT` module constant above the component, so the
   choice is documented in one place:

   ```ts
   /**
    * Smallest format, so a one-tap invite from the Amis tab never over-books
    * seats. The host raises it from the lobby screen (`lobby:set_format`).
    */
   const DEFAULT_INVITE_FORMAT = 2 as const
   ```
3. Add an `inviteFriend` callback below `requestFriend`. It keeps the current
   behavior when a lobby exists, and chains create → invite → navigate when it
   does not:

   ```tsx
   const inviteFriend = useCallback(
     async (friendId: string): Promise<void> => {
       if (myLobbyId) {
         await run(
           friendId,
           'lobby:invite',
           { gameId: myLobbyId, friendId },
           'Invitation envoyée !'
         )
         return
       }
       if (!socket) {
         toast(DELIVERY_FAILED_MESSAGE, 'error')
         return
       }
       setBusyKey(friendId)
       const created = await emitWithAck(socket, 'lobby:create', {
         format: DEFAULT_INVITE_FORMAT,
       })
       if (!created.ok) {
         setBusyKey(null)
         toast(ackErrorMessage(created), 'error')
         return
       }
       const invited = await emitWithAck(socket, 'lobby:invite', {
         gameId: created.gameId,
         friendId,
       })
       setBusyKey(null)
       // The fresh lobby is the Accueil resume banner and the `myLobbyId` the
       // Amis screen invites into, so both payloads are stale now.
       invalidate('home', 'friends')
       if (invited.ok) toast('Invitation envoyée !')
       else toast(ackErrorMessage(invited), 'error')
       // Land in the lobby either way: the user owns a real lobby now, and
       // « Quitter le lobby » is the way back out.
       router.push(`/lobby/${created.gameId}`)
     },
     [myLobbyId, run, socket, toast, invalidate, router]
   )
   ```

   The toast signature is
   `toast: (message: string, variant?: ToastVariant) => void`
   (`apps/web/src/components/ui/toast.tsx:22`) — the second argument is omitted
   for the success case, exactly like the existing `run()` helper does.
4. Replace the `onInvite` inline callback in the `<FriendRow>` JSX (currently
   `friends-screen.tsx:163-171`) with:

   ```tsx
   onInvite={() => void inviteFriend(friend.id)}
   ```
5. Delete the `canInvite={myLobbyId !== null}` prop from that `<FriendRow>` usage
   (step 2 removes the prop from the component).
6. Delete the helper paragraph block `{!myLobbyId && hasInvitableFriend ? … : null}`
   (`friends-screen.tsx:175-179`) — it now describes a workflow that no longer
   exists — **and** delete the now-unused `hasInvitableFriend` constant at
   `friends-screen.tsx:92`.

**Verify**:

```bash
grep -rn "hasInvitableFriend\|onglet Jouer" apps/web/src
```
→ no matches.

```bash
pnpm --filter @degommix/web typecheck
```
→ exit 0.

### Step 2: Keep the button always enabled in `friend-row.tsx`

In `apps/web/src/components/friends/friend-row.tsx`:

1. Remove `canInvite` from `FriendRowProps` (lines 21–30, including its JSDoc
   comment) and from the destructured parameter list (lines 36–44).
2. In the invite `RoundIconButton` (lines 100–111), replace the conditional label
   with the single French label and drop the `canInvite` term from `disabled`:

   ```tsx
          {isFree ? (
            <RoundIconButton
              icon="user-add"
              label={`Inviter ${username}`}
              tone="accent"
              disabled={busy}
              onClick={onInvite}
            />
          ) : null}
   ```

   The label loses « dans ton salon » on purpose: the action is now truthful in
   both cases (a lobby may not exist yet — it gets created).
3. Leave the `isFree` gate untouched: a friend « en partie » still shows no
   invite button. Leave the remove button and its inline confirmation untouched.

**Verify**:

```bash
grep -rn "canInvite" apps/web/src
```
→ no matches.

```bash
pnpm --filter @degommix/web typecheck && pnpm lint
```
→ both exit 0.

### Step 3: Full verification gate

```bash
docker compose -f docker-compose.test.yml up -d
pnpm typecheck
pnpm lint
pnpm exec turbo run test --concurrency=1
```

Expected: all exit 0. The ws-server suite is unaffected (no server file changed)
and must pass unchanged. If it fails with a connection/DB error rather than an
assertion, the Postgres container was not ready — wait and re-run once.

Optional, if Playwright browsers are installed
(`pnpm --filter e2e exec playwright install chromium`): `pnpm test:e2e`.
Note that `e2e/happy-path.spec.ts:65` clicks `getByRole('button', { name: 'Inviter' })`
on the **lobby** page (`/lobby/...`), not on `/amis`, so your new
`Inviter <username>` labels are on a different screen and cannot collide. If that
spec nonetheless fails with a Playwright strict-mode "resolved to N elements"
error, STOP and report — do not edit the e2e spec (it is out of scope).

### Step 4: Manual verification (required — there is no component test infra)

Start the stack (from `README.md:53-73`):

```bash
docker compose -f docker-compose.test.yml up -d
cp .env.example apps/web/.env.local            # skip if it already exists
export DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test
pnpm --filter @degommix/db db:migrate
pnpm dev                                        # Next.js on :3000, ws-server on :4001
```

Two browser profiles, accounts A and B, already friends, neither in a game.

1. A: open `/amis`.
   - **Expected**: B's row shows an **enabled** circular invite button whose
     tooltip/aria-label is « Inviter <B> ». **No** helper line
     « Crée un salon depuis l'onglet Jouer pour inviter tes amis. » anywhere.
2. A: tap the invite button.
   - **Expected**: green toast « Invitation envoyée ! », then navigation to
     `/lobby/<gameId>` with A as host, the pill « FFA · 2 joueurs », and B listed
     as invited.
   - **Expected on B's screen**: the Accueil invite banner « <A> t'invite » (B
     receives `invite:received`).
3. A: in the lobby, change the format to 3 or 4 using the existing format control.
   - **Expected**: it works; the invitation to B is untouched.
4. Mistap escape: A taps « Quitter le lobby ».
   - **Expected**: back on `/jouer`; B's invite banner disappears.
5. Already-have-a-lobby path (unchanged behavior): A: `/jouer` → « Créer la
   partie » → then navigate to `/amis` and tap invite on B's row.
   - **Expected**: toast « Invitation envoyée ! » and **no navigation** — A stays
     on `/amis` (this is the pre-existing `run()` path).
6. `ALREADY_IN_GAME` path: while that lobby is still open, reload `/amis` so
   `myLobbyId` is set, then leave the lobby from another tab so the client's
   `myLobbyId` is stale… simpler deterministic variant: as B (who has a *pending
   invitation* from A and never answered it), open `/amis` and tap invite on A.
   - **Expected**: red toast « Tu as déjà une partie en cours » and no
     navigation — `lobby:create` is rejected by `assertNotInGame` because B holds
     an `invited` seat.
7. Busy state: tap the invite button twice quickly.
   - **Expected**: the button is disabled while the chain runs (one lobby created,
     not two). Confirm in the DB if unsure:
     `docker exec -i $(docker compose -f docker-compose.test.yml ps -q db) psql -U degommix -d degommix_test -c "select id, code, status, format from games order by created_at desc limit 5;"`
     (adjust the service name if `ps -q db` returns nothing).
8. Friend « en partie »: with A in an active game, B opens `/amis`.
   - **Expected**: no invite button on A's row at all (unchanged `isFree` gate).

Record the outcome of each numbered step in your report.

## Test plan

**Fact to know before you plan tests** (verified at commit `094ddfd`): the web
app has **no component-test infrastructure**. `apps/web/vitest.config.ts` sets
`environment: 'node'` and `include: ['src/**/*.test.ts']` — `.tsx` files are not
collected, and there is no `jsdom`, no `@testing-library/react` and no
`@vitejs/plugin-react` in `apps/web/package.json`. The seven existing web test
files are pure-logic unit tests (e.g. `apps/web/src/lib/ws-errors.test.ts`,
`apps/web/src/components/live/finish-guard.test.ts`).

Consequently:

- **Do NOT add jsdom / testing-library** to satisfy this plan. That is a separate
  decision, out of scope.
- **Do NOT add ws-server tests**: server behavior is byte-for-byte unchanged.
  `lobby:create` and `lobby:invite` keep their existing coverage; the ws-server
  suite must pass untouched.
- Regression safety comes from `pnpm typecheck` + `pnpm lint` + the existing
  suites (step 3) + the manual script (step 4). The two `grep` gates in steps 1–2
  prove the dead-end copy and the `canInvite` prop are gone.
- Deferred on purpose: an `e2e/happy-path.spec.ts` leg that invites from `/amis`
  instead of from the lobby. It would be the right long-term test, but it changes
  a shared, slow spec and is not part of this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "canInvite" apps/web/src` returns no matches
- [ ] `grep -rn "onglet Jouer" apps/web/src` returns no matches
- [ ] `grep -rn "hasInvitableFriend" apps/web/src` returns no matches
- [ ] `grep -n "lobby:create" apps/web/src/components/friends/friends-screen.tsx`
      returns 1 line
- [ ] `git diff --name-only` lists exactly
      `apps/web/src/components/friends/friends-screen.tsx` and
      `apps/web/src/components/friends/friend-row.tsx` — nothing else
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 (test DB up)
- [ ] Step 4 manual script executed, with the result of each numbered item
      reported (items 2, 4, 5, 6 and 7 are the load-bearing ones)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code — in particular if
  `friends-screen.tsx` no longer passes `canInvite={myLobbyId !== null}` or the
  helper paragraph is already gone.
- `lobby:create` or `lobby:invite` no longer have the payload/result shapes in
  `apps/web/src/lib/realtime-types.ts:97-104`, or a server-side
  "create-and-invite" command has appeared (then this plan is obsolete — report
  instead of implementing).
- Manual step 2 creates a lobby but B never receives the invite banner: that
  points at the server's `invite:received` emission, which is out of scope. Report
  the observed acks (`created`, `invited`) rather than editing the server.
- Manual step 7 creates **two** lobbies on a double tap. Report it — the fix is a
  busy-state bug in your handler, but confirm with the operator before adding any
  extra locking mechanism beyond `busyKey`.
- The `pnpm test:e2e` run fails at `e2e/happy-path.spec.ts:65` with a strict-mode
  multiple-match error (do not edit the e2e spec; it is out of scope).
- The assumption "`lobby:invite` succeeds immediately after `lobby:create` for a
  friend who is not in a game" turns out to be false (e.g. a systematic
  `LOBBY_FULL` or `INVALID_TARGET`).
- A verification command fails twice after one reasonable fix attempt.

## Maintenance notes

For whoever owns this code next:

- The create→invite chain is **not atomic**. If `lobby:create` succeeds and
  `lobby:invite` fails, the user still lands in a real, empty lobby they own,
  with the invite error toasted and « Quitter le lobby » as the way out. That is
  the deliberate trade-off for keeping the server untouched. If this failure mode
  ever shows up in practice, the principled fix is a single server command
  mirroring `replay:create` (`apps/ws-server/src/handlers/game.ts:62-94`), which
  already composes `createLobby` + `inviteSeat` + `invite:received` +
  `broadcastLobbyState` in one handler.
- `DEFAULT_INVITE_FORMAT = 2` means one invite fills the lobby; a second invite
  needs a format bump first (`lobby:invite` throws `LOBBY_FULL` when
  `seats.length >= game.format`, `apps/ws-server/src/handlers/lobby.ts:106`). If
  users complain about inviting a group from the Amis tab, the next iteration is
  either a format picker in a sheet or defaulting to a larger format — both are
  product calls, not bug fixes.
- A reviewer should scrutinize: (a) `busyKey` is cleared on every exit path of
  `inviteFriend`, (b) the `useCallback` dep array is exhaustive, (c) `run()` was
  not modified and still owns the has-a-lobby path, (d) no French copy was
  invented beyond reusing « Invitation envoyée ! », and (e) the navigation happens
  in both invite outcomes, so no user is ever left with an invisible lobby.
- Interaction with plan 001 (durable invitations): manual step 6 depends on a
  pending `invited` seat blocking `lobby:create`. If 001 makes invitations expire,
  that scenario gets rarer — the toast stays correct either way.
- Interaction with plan 004 (presence snapshot): the invite button's visibility is
  gated on `presence !== 'in_game'` (`friend-row.tsx:46`). A more accurate
  presence snapshot changes *when* the button appears, not what it does.
