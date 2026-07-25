# Plan 004: Send a presence snapshot on connect and show friend availability in the lobby invite list

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 094ddfd..HEAD -- apps/ws-server/src/presence.ts apps/ws-server/src/server.ts apps/ws-server/test/presence.test.ts apps/web/src/hooks/use-presence.ts apps/web/src/components/lobby apps/web/src/components/friends/friend-row.tsx apps/web/src/components/ui
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
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

Presence in Dégommix is broadcast-only: a `presence:update` is emitted to your
friends when your state *flips*. A client that connects afterwards learns
nothing about who is already online, and the SSR seed can only distinguish
`in_game` from `offline`. Net effect today: a friend who is online but idle shows
« hors ligne » on your Amis screen until they happen to transition — so the
"invite a friend in one tap" promise (`SPECS.md:87`) reads as "everyone is
offline". The lobby invite list is worse: it has no availability signal at all,
so the host invites blindly, and because a pending invitation blocks
« Lancer la partie », inviting a friend who is not there stalls the whole lobby.
After this plan, a connecting client immediately receives the real presence of
its friends, and the host sees who is actually reachable before tapping
« Inviter ».

Constraint from `SPECS.md:85` — the vocabulary and the three states are fixed:

> - **Présence par heartbeat websocket** : statut en ligne / en partie / hors
>   ligne, « hors ligne » après ~60 s sans signal.

Constraint from `SPECS.md:92` — the launch gating is intentional and this plan
must NOT touch it:

> - Créer : choix du format (2/3/4 joueurs), invitation d'amis, choix des
>   personnages ; lancement bloqué tant que toutes les invitations en attente ne
>   sont pas résolues.

## Current state

All excerpts read at commit `094ddfd`. Every user-facing string is French; all
identifiers and comments are English.

### Presence is emitted only on transitions

`apps/ws-server/src/presence.ts:19-26` and `:52-69`:

```ts
  isOnline(userId: string): boolean {
    return (this.socketCounts.get(userId) ?? 0) > 0
  }

  getPresence(userId: string): Presence {
    if (!this.isOnline(userId)) return 'offline'
    return this.inGameUsers.has(userId) ? 'in_game' : 'online'
  }
```

```ts
  /** Flags a user as in game; broadcasts only when the flag actually flips while online. */
  async setInGame(userId: string, inGame: boolean): Promise<void> {
    const changed = inGame ? !this.inGameUsers.has(userId) : this.inGameUsers.has(userId)
    this.syncInGameFlag(userId, inGame)
    if (changed && this.isOnline(userId)) await this.broadcast(userId)
  }

  async broadcast(userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
    const presence = this.getPresence(userId)
    for (const row of rows) {
      const friendId = row.userLow === userId ? row.userHigh : row.userLow
      this.io.to(`user:${friendId}`).emit('presence:update', { userId, presence })
    }
  }
```

The state lives in memory in the tracker (`socketCounts`, `inGameUsers`), so the
snapshot this plan adds needs no new database column and no new query beyond the
friendship lookup `broadcast` already performs.

### The handshake tells the connecting socket nothing about its friends

`apps/ws-server/src/server.ts:139-152`:

```ts
/** Presence bookkeeping + automatic room re-join and state push at handshake. */
async function onSocketConnected(
  ctx: AppContext,
  socket: AppSocket,
  becameOnline: boolean
): Promise<void> {
  const userId = socket.data.userId
  try {
    ctx.hostTransfer.onUserOnline(userId)
    const memberships = await findActiveMemberships(ctx.db, userId)
    const seated = memberships.find((m) => m.player.status === 'joined')
    ctx.presence.syncInGameFlag(userId, seated?.game.status === 'active')
    if (becameOnline) await ctx.presence.broadcast(userId)
    if (!seated) return
```

`presence.registerSocket(userId)` runs **before** this function
(`server.ts:116-117`), so by the time it executes the connecting user is already
counted as online.

### The SSR seed can only produce `in_game` or `offline`

`apps/web/src/lib/queries/friends.ts:153-157`:

```ts
    friends: friendRows.map((row) => ({
      id: row.id,
      username: row.username ?? '',
      initialPresence: inGameIds.has(row.id) ? ('in_game' as const) : ('offline' as const),
    })),
```

`apps/web/src/hooks/use-presence.ts:18-38` — the client hook, fed only by
broadcasts, defaults to `'offline'`:

```ts
export function usePresence(initial?: Record<string, Presence>): UsePresenceResult {
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>(initial ?? {})
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket) return
    const onUpdate = ({ userId, presence }: { userId: string; presence: Presence }): void => {
      setPresenceMap((current) => ({ ...current, [userId]: presence }))
    }
    socket.on('presence:update', onUpdate)
    return () => {
      socket.off('presence:update', onUpdate)
    }
  }, [socket])

  const presenceOf = useCallback(
    (userId: string): Presence => presenceMap[userId] ?? 'offline',
    [presenceMap]
  )
```

### The lobby invite list has no availability signal

`apps/web/src/lib/queries/lobby.ts:9-12`:

```ts
export interface InvitableFriend {
  id: string
  username: string
}
```

`getInvitableFriends` (same file, lines 26-40) returns id + username only,
sorted by `username.localeCompare`. It is called once, server-side, in
`apps/web/src/app/lobby/[gameId]/page.tsx` and passed down as the `friends` prop
to `LobbyScreen` → `HostControls`.

`apps/web/src/components/lobby/host-controls.tsx:36-38` and the row markup at
`:57-78`:

```tsx
  const seatedIds = new Set(players.map((player) => player.userId))
  const invitable = friends.filter((friend) => !seatedIds.has(friend.id))
  const lobbyFull = players.length >= format
```

```tsx
          invitable.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2"
              style={{ background: 'var(--surface-2)', border: '1.5px solid var(--parchment-line)' }}
            >
              <PlayerAvatar username={friend.username} size={32} />
              <span className="flex-1 truncate text-[0.82rem] font-semibold">
                {friend.username}
              </span>
              <button
                type="button"
                className="cta"
                style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.65rem' }}
                disabled={lobbyFull || busy}
                onClick={() => onInvite(friend.id)}
              >
                <Icon name="user-add" size={12} /> Inviter
              </button>
            </div>
          ))
```

Meanwhile a pending invitation blocks the launch —
`apps/web/src/components/lobby/lobby-screen.tsx:32-38`:

```ts
function startBlockReason(lobby: LobbyState): string | null {
  const joined = lobby.players.filter((player) => player.status === 'joined')
  const invited = lobby.players.filter((player) => player.status === 'invited')
  if (invited.length > 0) {
    const names = invited.map((player) => player.username).join(', ')
    return `En attente de ${names} pour rejoindre…`
  }
```

`HostControls` is rendered at `lobby-screen.tsx:192-203`:

```tsx
      {isHost ? (
        <HostControls
          format={lobby.format}
          players={lobby.players}
          friends={friends}
          canStart={startHelper === null}
          startHelper={startHelper}
          busy={busy}
          onSetFormat={(format: GameFormat) => void runAction(() => setFormat(format))}
          onInvite={(friendId: string) => void runAction(() => invite(friendId))}
          onStart={() => void handleStart()}
        />
      ) : (
```

### The protocol has exactly one presence entry

`apps/web/src/lib/realtime-types.ts:76`:

```ts
  'presence:update': (payload: PresenceUpdatePayload) => void
```

with `PresenceUpdatePayload = { userId: string; presence: Presence }` (lines
46-49) and `Presence = 'online' | 'in_game' | 'offline'`
(`packages/game-core/src/protocol.ts:30`). There is **no** presence query or
snapshot command, and this plan adds none.

### Conventions you must match

**1. The French presence vocabulary already exists** —
`apps/web/src/components/friends/friend-row.tsx:9-19`, currently module-private:

```ts
const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'en ligne',
  in_game: 'en partie',
  offline: 'hors ligne',
}

const PRESENCE_COLOR: Record<Presence, string> = {
  online: 'var(--good)',
  in_game: 'var(--bronze-strong)',
  offline: 'var(--ink-faint)',
}
```

Its rendering (same file, inside the profile link):

```tsx
          <span
            className="flex items-center gap-1.5 text-xs"
            style={{ color: PRESENCE_COLOR[presence] }}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: PRESENCE_COLOR[presence],
                opacity: presence === 'offline' ? 0.45 : 1,
              }}
            />
            {PRESENCE_LABEL[presence]}
          </span>
```

These three labels are asserted verbatim by `e2e/happy-path.spec.ts:52-54`
(`getByText('hors ligne')`, `getByText('en ligne', { exact: true })`) — they must
not change.

**2. Shared presentational bits live in `apps/web/src/components/ui/`**
(`button.tsx`, `pill.tsx`, `player-avatar.tsx`, …), named exports, kebab-case
filenames, props interface named `<Component>Props`.

**3. The lobby route has NO `QueryProvider`.**
`apps/web/src/components/lobby/providers.tsx` wraps only `SocketProvider` +
`ToastProvider`. Do not introduce `useQuery`/TanStack hooks in the lobby screen —
presence there must come from the socket-fed `usePresence` hook.

**4. Pure logic next to a component goes in a `.ts` file with a co-located
vitest test** — pattern: `apps/web/src/components/live/tap-lock.ts` +
`tap-lock.test.ts`, `finish-guard.ts` + `finish-guard.test.ts`. The web vitest
setup runs plain Node (no jsdom, no React Testing Library) — so test the sorting
logic as a pure function, never by rendering a component.

**5. ws-server integration tests** use the socket.io-client harness:
`apps/ws-server/test/presence.test.ts:28-38` is the exact pattern to extend:

```ts
  beforeEach(async () => {
    await ts.reset(['u1', 'u2', 'u3'])
    await ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })
  })

  it('notifies friends when a user comes online', async () => {
    const s2 = await ts.connectAs('u2')
    const update = waitForEvent<PresenceUpdate>(s2, 'presence:update')
    await ts.connectAs('u1')
    expect(await update).toEqual({ userId: 'u1', presence: 'online' })
  })
```

**6. TypeScript is strict with `noUncheckedIndexedAccess`** (see
`tsconfig.base.json` and `apps/web/tsconfig.json`). Prefer
`[...array].sort(...)` over `Array.prototype.toSorted` (the web `target` is
ES2017).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Start test DB (ws-server suites need it) | `docker compose -f docker-compose.test.yml up -d` | container running on port 54329 |
| Full test run (serialized — integration suites share one DB) | `pnpm exec turbo run test --concurrency=1` | all packages pass |
| Presence ws suite | `pnpm --filter @degommix/ws-server exec vitest run test/presence.test.ts` | all pass |
| Web unit tests | `pnpm --filter @degommix/web exec vitest run` | all pass |
| E2E (optional, needs a running stack) | `pnpm test:e2e` | happy path passes |

## Scope

**In scope** (the only files you should modify or create):
- `apps/ws-server/src/presence.ts`
- `apps/ws-server/src/server.ts`
- `apps/ws-server/test/presence.test.ts`
- `apps/web/src/components/ui/presence-dot.tsx` (create)
- `apps/web/src/components/friends/friend-row.tsx` (refactor to the new component only)
- `apps/web/src/components/lobby/invitable-order.ts` (create)
- `apps/web/src/components/lobby/invitable-order.test.ts` (create)
- `apps/web/src/components/lobby/host-controls.tsx`
- `apps/web/src/components/lobby/lobby-screen.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/lib/realtime-types.ts`, `apps/ws-server/src/socket-types.ts` —
  **no protocol addition**. The snapshot reuses the existing `presence:update`
  payload; a new event or a `presence:query` command would need a coordinated
  client+server deploy for zero benefit.
- `startBlockReason` in `apps/web/src/components/lobby/lobby-screen.tsx:32-49`
  and anything else about launch gating — a pending invitation must keep
  blocking « Lancer la partie » (`SPECS.md:92`). You may add presence wiring to
  this file, but that function's behavior must not change.
- `apps/web/src/lib/queries/lobby.ts` / `friends.ts` — no SSR seed change is
  needed: the snapshot corrects the client within milliseconds of connecting.
- `apps/ws-server/src/zombie-job.ts`, `host-transfer.ts` and everything about
  the ~60 s heartbeat timing of `SPECS.md:85` — the socket lifecycle stays as is.
- `apps/web/src/components/friends/friends-screen.tsx` — the Amis screen already
  consumes `usePresence`; it benefits from the snapshot with zero changes. Do
  not rework it.
- `e2e/happy-path.spec.ts` — must keep passing unmodified.

## Git workflow

- Branch: `feat/presence-snapshot` (repo convention: `type/short-slug`).
- Commit per step or per logical unit; conventional commits in English, e.g.
  `feat(ws-server): send a friends presence snapshot on connect` and
  `feat(web): show friend availability in the lobby invite list`.
- Do NOT push and do NOT open a PR unless the operator explicitly asked.

## Steps

### Step 1: Add a snapshot method to `PresenceTracker`

In `apps/ws-server/src/presence.ts`, add a method next to `broadcast` (reuse the
same friendship lookup shape):

```ts
  /**
   * Sends the current presence of the user's friends to ONE socket. Presence is
   * otherwise only emitted on transitions, so a client that connects after its
   * friends sees everyone as « hors ligne » until the next flip. Offline friends
   * are skipped: `offline` is already the client-side default.
   */
  async sendSnapshot(userId: string, socket: AppSocket): Promise<void> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
    for (const row of rows) {
      const friendId = row.userLow === userId ? row.userHigh : row.userLow
      const presence = this.getPresence(friendId)
      if (presence === 'offline') continue
      socket.emit('presence:update', { userId: friendId, presence })
    }
  }
```

Import `type AppSocket` from `./socket-types` (the file already imports
`type AppServer` from it). Do not change `broadcast`, `setInGame`,
`registerSocket`, `unregisterSocket` or `syncInGameFlag`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Call it from the handshake

In `apps/ws-server/src/server.ts`, inside `onSocketConnected`, immediately after
the existing `if (becameOnline) await ctx.presence.broadcast(userId)` line (139-152
excerpt above) and **before** `if (!seated) return`, add:

```ts
    await ctx.presence.sendSnapshot(userId, socket)
```

Order matters: the outgoing broadcast (my presence → my friends) stays first so
the observable event order for other clients is unchanged; the snapshot is a
per-socket push and must not be gated on `becameOnline` (a second tab, or a
reconnect that never dropped the user's last socket, needs it too).

**Verify**: `pnpm --filter @degommix/ws-server exec vitest run test/presence.test.ts test/handshake.test.ts test/resilience.test.ts`
→ all pass unchanged (requires the test DB).

### Step 3: Add the ws-server integration test

In `apps/ws-server/test/presence.test.ts`, add to the existing `describe`
(friendship `u1`/`u2` is already inserted in `beforeEach`):

```ts
  it('sends a snapshot of the friends already online to a connecting socket', async () => {
    await ts.connectAs('u1')
    const s2 = await ts.connectAs('u2')
    // u1 was already online: no transition happens, only the snapshot can carry it.
    expect(await waitForEvent<PresenceUpdate>(s2, 'presence:update')).toEqual({
      userId: 'u1',
      presence: 'online',
    })
  })

  it('does not send a snapshot entry for an offline friend', async () => {
    const s2 = await ts.connectAs('u2')
    await expectNoEvent(s2, 'presence:update', 300)
  })

  it('does not leak the presence of a non-friend', async () => {
    await ts.connectAs('u3')
    const s2 = await ts.connectAs('u2')
    await expectNoEvent(s2, 'presence:update', 300)
  })
```

Race note (read before debugging a flake): `ts.connectAs` resolves on `connect`,
so the listener in the first case is attached *after* the handshake. This works
because `sendSnapshot` awaits a database query before emitting — the exact same
assumption the existing `apps/ws-server/test/resilience.test.ts:80-81` test
already relies on for `game:state_snapshot`:

```ts
    const s2b = await ts.connectAs('u2')
    const snapshot = await waitForEvent<Snapshot>(s2b, 'game:state_snapshot')
```

If the first case still proves flaky, make it deterministic instead of deleting
it: build the client socket inline with `ioc` from `socket.io-client` (see
`apps/ws-server/test/harness.ts:117-132` for the shape), attach the
`presence:update` listener on the returned instance, then `await waitForConnect(socket)`
(both `waitForConnect` and `ts.signToken` are exported by the harness). Report
the change in your final message.

**Verify**: `pnpm --filter @degommix/ws-server exec vitest run test/presence.test.ts`
→ all pass, including the 3 new tests.

### Step 4: Extract the presence pill into a shared UI component

Create `apps/web/src/components/ui/presence-dot.tsx`, moving
`PRESENCE_LABEL` / `PRESENCE_COLOR` and the dot+label markup out of
`friend-row.tsx` **verbatim** (same classes, same inline styles, same French
labels, `aria-hidden` on the dot):

```tsx
import type { Presence } from '@degommix/game-core'

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'en ligne',
  in_game: 'en partie',
  offline: 'hors ligne',
}

export const PRESENCE_COLOR: Record<Presence, string> = {
  online: 'var(--good)',
  in_game: 'var(--bronze-strong)',
  offline: 'var(--ink-faint)',
}

interface PresenceDotProps {
  presence: Presence
}

/** Coloured dot + French presence label (« en ligne » / « en partie » / « hors ligne »). */
export function PresenceDot({ presence }: PresenceDotProps) { /* markup moved as-is */ }
```

Then edit `apps/web/src/components/friends/friend-row.tsx`: delete the two local
constants and replace the inline `<span>` block with `<PresenceDot presence={presence} />`.
The rendered text must stay byte-identical (`e2e/happy-path.spec.ts:52-54`
depends on it) and `isFree = presence !== 'in_game'` logic must stay untouched.

**Verify**:
- `pnpm typecheck` → exit 0
- `grep -n "PRESENCE_LABEL\|PRESENCE_COLOR" apps/web/src/components/friends/friend-row.tsx`
  → only the import line, no local definition
- `pnpm lint` → exit 0

### Step 5: Add the pure availability ordering helper (+ test)

Create `apps/web/src/components/lobby/invitable-order.ts`:

```ts
import type { Presence } from '@degommix/game-core'
import type { InvitableFriend } from '@/lib/queries/lobby'

/**
 * Invite-list ordering: reachable friends first, then the ones who would not
 * answer, then the ones stuck in another game. A pending invitation blocks
 * « Lancer la partie » (SPECS.md:92), so surfacing availability before the tap
 * is what keeps the host from stalling their own lobby.
 */
const AVAILABILITY_RANK: Record<Presence, number> = {
  online: 0,
  offline: 1,
  in_game: 2,
}

export function sortByAvailability(
  friends: InvitableFriend[],
  presenceOf: (userId: string) => Presence
): InvitableFriend[] {
  return [...friends].sort(
    (a, b) => AVAILABILITY_RANK[presenceOf(a.id)] - AVAILABILITY_RANK[presenceOf(b.id)]
  )
}
```

`Array.prototype.sort` is stable, so friends with the same availability keep the
alphabetical order `getInvitableFriends` already produced — assert that.

Create `apps/web/src/components/lobby/invitable-order.test.ts` (vitest, model
after `apps/web/src/components/live/tap-lock.test.ts`) covering:
- online friends come before offline ones, offline before `in_game`;
- alphabetical order is preserved inside one availability group;
- an unknown id (no presence entry → `presenceOf` returns `'offline'`) is
  ordered as offline, not dropped;
- an empty list returns an empty list, and the input array is not mutated.

**Verify**: `pnpm --filter @degommix/web exec vitest run src/components/lobby/invitable-order.test.ts`
→ all pass (4+ tests).

### Step 6: Show availability in the host invite list

`apps/web/src/components/lobby/lobby-screen.tsx`:
- add `import { usePresence } from '@/hooks/use-presence'` and, inside
  `LobbyScreen`, `const { presenceOf } = usePresence()` (no initial seed — the
  step 2 snapshot fills it right after connect; and remember there is no
  `QueryProvider` on this route);
- pass `presenceOf={presenceOf}` to `<HostControls …>` at lines 192-203.
- Change nothing else in this file. `startBlockReason` stays exactly as is.

`apps/web/src/components/lobby/host-controls.tsx`:
- add `presenceOf: (userId: string) => Presence` to `HostControlsProps`;
- replace `const invitable = friends.filter(...)` with the filtered list passed
  through `sortByAvailability(...)`;
- inside each row, put the username and the presence pill in a stacked block:

```tsx
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.82rem] font-semibold">{friend.username}</span>
                <PresenceDot presence={presenceOf(friend.id)} />
              </span>
```

- grey the row for a friend who is not reachable: on the row `<div>`, add
  `opacity: presenceOf(friend.id) === 'online' ? 1 : 0.62` to the existing
  inline `style` object;
- extend the button's `disabled` to `lobbyFull || busy || presenceOf(friend.id) === 'in_game'`
  (a friend already seated in another game is refused server-side anyway —
  `apps/ws-server/src/handlers/lobby.ts:102-105` throws `ALREADY_IN_GAME`).

Hard constraints on this step:
- The button's visible text stays exactly `<Icon name="user-add" size={12} /> Inviter`
  — `e2e/happy-path.spec.ts:65` clicks `getByRole('button', { name: 'Inviter' })`.
- An **offline** friend must stay invitable (button NOT disabled): an invitation
  is in-app and waits for them; disabling it would silently remove a working
  flow.
- Keep the existing French copy untouched: « Format », « Inviter des amis »,
  « Tous tes amis sont déjà là — partage le code sinon. »,
  « Lobby complet — passe en format supérieur pour inviter. »,
  « Lancer la partie ».

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `grep -n "Lancer la partie" apps/web/src/components/lobby/host-controls.tsx`
  → still present, unchanged
- `git diff -- apps/web/src/components/lobby/lobby-screen.tsx` shows no change
  inside `startBlockReason`

### Step 7: Full verification

```
docker compose -f docker-compose.test.yml up -d
pnpm lint
pnpm typecheck
pnpm exec turbo run test --concurrency=1
```

All must exit 0.

**Verify**: `git status --short` → only files from the "In scope" list appear.

## Test plan

- **`apps/ws-server/test/presence.test.ts`** (extended, 3 new cases): a
  connecting socket receives `presence:update` for an already-online friend; no
  entry is sent for an offline friend; nothing is sent for a non-friend.
  Structural pattern: the existing cases in that same file (lines 33-59).
- **`apps/web/src/components/lobby/invitable-order.test.ts`** (new, 4+ cases):
  availability ranking, stable alphabetical order inside a group, unknown id
  treated as offline, empty input / no mutation. Structural pattern:
  `apps/web/src/components/live/tap-lock.test.ts`.
- **Regression net that must keep passing unmodified**:
  `apps/ws-server/test/handshake.test.ts`,
  `apps/ws-server/test/resilience.test.ts` (the handshake snapshot test),
  `apps/ws-server/test/lobby.test.ts`, and `e2e/happy-path.spec.ts` if the
  operator runs e2e (presence labels at lines 52-54, the « Inviter » button at
  line 65).
- Verification: `pnpm exec turbo run test --concurrency=1` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0, with the 3 new
      presence tests and the new `invitable-order.test.ts` passing
- [ ] `grep -n "sendSnapshot" apps/ws-server/src/presence.ts apps/ws-server/src/server.ts`
      returns one definition and one call site
- [ ] `git diff 094ddfd..HEAD -- apps/web/src/lib/realtime-types.ts apps/ws-server/src/socket-types.ts`
      is empty (no protocol addition)
- [ ] `git diff 094ddfd..HEAD -- apps/web/src/lib/queries/lobby.ts apps/web/src/lib/queries/friends.ts`
      is empty (no SSR seed change)
- [ ] `grep -n "En attente de" apps/web/src/components/lobby/lobby-screen.tsx`
      still returns the untouched launch-gating message
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt does not match the live code (drift since
  `094ddfd`).
- `docker compose -f docker-compose.test.yml up -d` fails or the ws-server
  suites cannot reach the test database — report instead of deleting or
  weakening the integration tests.
- The snapshot appears to require a new websocket event, a new command, or a
  change to `realtime-types.ts` / `socket-types.ts`.
- Wiring presence into `HostControls` seems to require `useQuery` / TanStack
  Query (there is no `QueryProvider` on the `/lobby/[gameId]` route) or a change
  to `getInvitableFriends`.
- You find yourself needing to change `startBlockReason`, the
  « En attente de … » message, or anything else that decides when
  « Lancer la partie » is enabled.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinize**: (a) `sendSnapshot` emits on `socket`,
  never on `io.to(...)` — leaking a friend's presence to a room would be a
  privacy regression (profiles and stats are friends-only, `SPECS.md:86`);
  (b) it only iterates the *caller's* friendships, so no non-friend presence can
  be observed; (c) the presence pill markup moved into `PresenceDot` byte-for-byte
  (the e2e asserts on those labels); (d) offline friends stay invitable.
- **Scaling note**: presence lives in a per-process in-memory `Map`
  (`PresenceTracker.socketCounts`). The snapshot is therefore only correct while
  the ws-server runs as a single instance. If it is ever scaled horizontally,
  presence needs a shared store (Redis adapter) — and that is exactly the point
  where this snapshot must be revisited, together with `broadcast`.
- **Deferred out of this plan** (recorded so nobody re-audits it): a *soft
  prompt* after ~30 s of an unanswered invitation (e.g. offering the host to
  cancel it so the launch unblocks). It is a UX change on top of the gating rule
  of `SPECS.md:92` and needs a product decision; the availability signal added
  here is the cheap prevention. Also deferred: seeding `initialPresence`
  properly server-side (would require the web app to read ws-server memory, i.e.
  a presence API) and adding an availability signal to the Amis-tab invite
  button (already presence-aware via `FriendRow`).
- **Future interactions**: if `InvitableFriend` ever gains fields (e.g. a
  server-computed availability), `sortByAvailability` should keep taking a
  `presenceOf` callback so live socket updates stay authoritative over any
  server snapshot.
