# Plan 001: Make lobby invitations survive reloads, reconnects and never soft-lock the invitee

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 094ddfd..HEAD -- apps/web/src/hooks/use-invites.ts apps/web/src/hooks/use-tab-data.ts apps/web/src/lib/query-keys.ts apps/web/src/lib/api-payloads.ts apps/web/src/lib/queries apps/web/src/app/api apps/web/src/app/'(tabs)' apps/web/src/components/home apps/web/src/components/lobby apps/ws-server/src apps/ws-server/test
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

Dégommix is a mobile PWA: phones sleep, tabs get killed, users reload. Today an
invitation exists **only** in the React state of whatever screen happened to be
mounted when the `invite:received` broadcast arrived. Reload the app, background
it long enough for the socket to drop, or receive the invite while offline, and
the invitation is gone forever from the invitee's point of view — even though
the seat is still sitting in Postgres as `game_players.status = 'invited'`.
Worse, that orphan seat then blocks the invitee from creating or joining any
other game (`ALREADY_IN_GAME`), and nothing ever reaps it, so the user is
soft-locked out of the product with only an opaque toast
(« Tu as déjà une partie en cours ») to explain it. After this plan: pending
invitations are server state, rendered on first paint, re-pushed on reconnect,
and an unanswered invitation never blocks anything.

Product constraint this must honor, from `SPECS.md:94` (quote it in code
comments if useful, do not restate it differently):

> - Invitations **in-app uniquement** (websocket) : bannière sur l'accueil +
>   onglet Rejoindre. Pas de Web Push en v1. L'invité peut **décliner**
>   (l'host est notifié).

So: no Web Push, no new user-facing surface. The invitee's decline must keep
notifying the host, and that also constrains how the auto-decline in step 6
behaves (the host's lobby must visibly lose the seat).

## Current state

All excerpts below were read at commit `094ddfd`. All user-facing strings in
this app are French; all identifiers, comments and commit messages are English.

### The bug, part 1 — invitations live in component state only

`apps/web/src/hooks/use-invites.ts` — the only source of invitations today
(lines 24-45):

```ts
export function useInvites(): UseInvitesResult {
  const { socket } = useSocket()
  const [invites, setInvites] = useState<InviteReceivedPayload[]>([])

  useEffect(() => {
    if (!socket) return
    const onReceived = (payload: InviteReceivedPayload): void => {
      setInvites((current) => [
        ...current.filter((invite) => invite.gameId !== payload.gameId),
        payload,
      ])
    }
```

Consumers (both take no data props today):
- `apps/web/src/components/home/invite-banner.tsx:18` — `const { invites, accept, decline } = useInvites()`; rendered by
  `apps/web/src/components/home/home-screen.tsx:57` as `<InviteBanner />`.
- `apps/web/src/components/lobby/play-screen.tsx:67` — same call; renders the
  « Invitations reçues » list of the Jouer tab, with an `EmptyState`
  (« Aucune invitation en attente ») when empty.

### The bug, part 2 — the reconnect handshake ignores invited seats

`apps/ws-server/src/server.ts:146-165` (inside `onSocketConnected`):

```ts
  const userId = socket.data.userId
  try {
    ctx.hostTransfer.onUserOnline(userId)
    const memberships = await findActiveMemberships(ctx.db, userId)
    const seated = memberships.find((m) => m.player.status === 'joined')
    ctx.presence.syncInGameFlag(userId, seated?.game.status === 'active')
    if (becameOnline) await ctx.presence.broadcast(userId)
    if (!seated) return
    await socket.join(`game:${seated.game.id}`)
```

`findActiveMemberships` already returns the invited seats — they are simply
dropped. `apps/ws-server/src/lobby-shared.ts:13-36`:

```ts
/** Every non-finished game where the user sits as `invited` or `joined`. */
export async function findActiveMemberships(
  db: Db,
  userId: string
): Promise<ActiveMembership[]> {
  const rows = await db
    .select({ game: games, player: gamePlayers })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        inArray(gamePlayers.status, ['invited', 'joined']),
        ne(games.status, 'finished')
      )
    )
  return rows
}

/** Throws ALREADY_IN_GAME when the user already sits in a non-finished game. */
export async function assertNotInGame(db: Db, userId: string): Promise<void> {
  const memberships = await findActiveMemberships(db, userId)
  if (memberships.length > 0) throw new CommandError('ALREADY_IN_GAME')
}
```

### The bug, part 3 — no read path exposes invited seats

`apps/web/src/lib/queries/home.ts:82-95` — `getActiveGame` (the resume banner)
only ever looks at `joined` seats, so a pending invitation is invisible to the
Accueil payload:

```ts
export async function getActiveGame(userId: string): Promise<ActiveGame | null> {
  const rows = await db
    .select({ id: games.id, status: games.status, format: games.format })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(gamePlayers.status, 'joined'),
        sql`${games.status} in ('lobby', 'active')`,
      ),
    )
```

There is no `/api/invites` route: `apps/web/src/app/api` contains only `auth`,
`friends`, `home`, `leaderboard`, `username`.

### The bug, part 4 — the soft lock

`assertNotInGame` (quoted above, `lobby-shared.ts:33-36`) throws for an
`invited` seat too. Its three call sites:

- `apps/ws-server/src/handlers/lobby.ts:81` — `lobby:create`:
  ```ts
      withAck(createSchema, async ({ format }) => {
        await assertNotInGame(db, userId)
  ```
- `apps/ws-server/src/handlers/lobby.ts:179` — `lobby:join_by_code`:
  ```ts
        if (seat?.status !== 'invited') await assertNotInGame(db, userId)
  ```
  (i.e. joining *the* lobby you were invited to works; joining **any other**
  lobby by code while an invitation is pending is refused)
- `apps/ws-server/src/handlers/game.ts:69` — `replay:create`:
  ```ts
        const mySeat = await getSeat(db, finishedGameId, userId)
        if (!mySeat) throw new CommandError('NOT_MEMBER')
        await assertNotInGame(db, userId)
  ```

The resulting toast, `apps/web/src/lib/ws-errors.ts:12`:

```ts
  ALREADY_IN_GAME: 'Tu as déjà une partie en cours',
```

And nothing reaps stale lobby rows — `apps/ws-server/src/zombie-job.ts:29-44`
only sweeps `status = 'active'`:

```ts
  const tick = async (): Promise<number> => {
    const cutoff = new Date(now().getTime() - thresholdMs)
    const zombies = await deps.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.status, 'active'), lt(games.lastActivityAt, cutoff)))
    for (const game of zombies) {
      await deps.manager.appendSystemEvent(game.id, {
        type: 'GAME_AUTO_CLOSED',
        actorId: null,
        targetId: null,
        payload: { reason: 'zombie' },
      })
    }
    return zombies.length
  }
```

### Conventions you must match

**1. Session-gated JSON endpoint + server query + TanStack hook.** This is the
established pattern (commits `b0f3a4b`, `9f87a17`, `5b43ea6`). Exemplar,
`apps/web/src/app/api/friends/route.ts` (whole file):

```ts
import { NextResponse } from 'next/server'
import { getFriendsPageData } from '@/lib/queries/friends'
import type { FriendsPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const payload: FriendsPayload = await getFriendsPageData(session.user.id)
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
```

**2. Wire schemas live in `apps/web/src/lib/api-payloads.ts`**, validated
before reaching the cache. Existing helpers there (lines 12-13, 42-46):

```ts
const characterSchema = z.enum(CHARACTERS)
const formatSchema = z.union([z.literal(2), z.literal(3), z.literal(4)])
...
export const homePayloadSchema = z.object({
  stats: homeStatsSchema,
  activeGame: activeGameSchema.nullable(),
  lastGames: z.array(serializedHomeGameSchema),
})
```

**3. Query keys are declared once**, `apps/web/src/lib/query-keys.ts:6-13`:

```ts
export const queryKeys = {
  /** GET /api/home — stats tiles, resume banner, recent history. */
  home: ['home'] as const,
  /** GET /api/friends — requests in/out, friend list, own lobby id. */
  friends: ['friends'] as const,
  /** GET /api/leaderboard — friends-circle ranking and character winrates. */
  leaderboard: ['leaderboard'] as const,
}
```

**4. Hooks wrap `useQuery` with an SSR `initialData` seed**,
`apps/web/src/hooks/use-tab-data.ts:17-46`:

```ts
async function fetchPayload<T>(url: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`)
  }
  return schema.parse(await response.json())
}
...
export function useHomeData(initialData: HomePayload): DefinedUseQueryResult<HomePayload, Error> {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => fetchPayload('/api/home', homePayloadSchema),
    initialData,
  })
}
```

**5. ws-server handlers** use `withAck(schema, handler)` and throw
`CommandError('CODE')` (see `apps/ws-server/src/ack.ts`). `OK` is the shared
`{ ok: true }` ack. Broadcasts go to rooms `user:{id}` / `game:{id}`.

**6. Decline semantics already implemented** — `lobby:respond_invite` with
`accept: false`, `apps/ws-server/src/handlers/lobby.ts:143-150`:

```ts
        if (!accept) {
          await db
            .update(gamePlayers)
            .set({ status: 'declined' })
            .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
          await broadcastLobbyState(db, io, gameId)
          return OK
        }
```

So "notify the host" == set the seat to `declined` + `broadcastLobbyState`.
Reuse exactly this; do not invent a new event.

**7. Lobby dissolution already has a shape** —
`apps/ws-server/src/handlers/lobby-admin.ts:100-107`:

```ts
          if (joined.length === 0) {
            // Last player out: dissolve the lobby, the code is burned forever.
            await db
              .update(games)
              .set({ status: 'finished', outcome: 'aborted', endedAt: new Date() })
              .where(eq(games.id, gameId))
            return OK
          }
```

**8. The `invite:received` payload shape** is fixed by
`apps/web/src/lib/realtime-types.ts:28-32` and produced in
`apps/ws-server/src/handlers/lobby.ts:110-114`:

```ts
export interface InviteReceivedPayload {
  gameId: string
  hostUsername: string
  format: GameFormat
}
```

```ts
      io.to(`user:${friendId}`).emit('invite:received', {
        gameId,
        hostUsername: host?.username ?? '',
        format: game.format,
      })
```

Server-side socket types are deliberately loose
(`apps/ws-server/src/socket-types.ts:4` — `type LooseEvents = Record<string, (...args: unknown[]) => void>`),
so emitting `invite:received` needs no protocol type change.

**9. DB facts** (`packages/db/src/schema/games.ts`): `games.status` is
`'lobby' | 'active' | 'finished'`; `game_players.status` is
`'invited' | 'joined' | 'declined' | 'kicked' | 'left'`; `games.format` is a
`smallint` constrained to `(2, 3, 4)`; `games.lastActivityAt` defaults to
`now()` and is **only** updated by `game-manager.ts` (start + each command) —
never by a lobby command. Consequence for step 7: for a `lobby` row,
`lastActivityAt` is effectively the creation time.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Start test DB (needed by ws-server + db suites) | `docker compose -f docker-compose.test.yml up -d` | container running, port 54329 reachable |
| Full test run (serialized — integration suites share one DB) | `pnpm exec turbo run test --concurrency=1` | all packages pass |
| Just the new ws suite | `pnpm --filter @degommix/ws-server exec vitest run test/invites.test.ts` | all tests pass |
| Just the ws-server suites you must not break | `pnpm --filter @degommix/ws-server exec vitest run test/lobby.test.ts test/resilience.test.ts test/handshake.test.ts` | all pass |
| Web unit tests | `pnpm --filter @degommix/web exec vitest run` | all pass |
| E2E (optional, needs a running stack) | `pnpm test:e2e` | happy path passes |

## Scope

**In scope** (the only files you should modify or create):

Web (read path):
- `apps/web/src/lib/queries/invites.ts` (create)
- `apps/web/src/lib/api-payloads.ts`
- `apps/web/src/lib/api-payloads.test.ts`
- `apps/web/src/app/api/invites/route.ts` (create)
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/hooks/use-tab-data.ts`
- `apps/web/src/hooks/use-invites.ts`
- `apps/web/src/components/home/invite-banner.tsx`
- `apps/web/src/components/home/home-screen.tsx`
- `apps/web/src/components/lobby/play-screen.tsx`
- `apps/web/src/app/(tabs)/page.tsx`
- `apps/web/src/app/(tabs)/jouer/page.tsx`

ws-server (reconnect + soft lock + sweep):
- `apps/ws-server/src/server.ts`
- `apps/ws-server/src/lobby-shared.ts`
- `apps/ws-server/src/handlers/lobby.ts`
- `apps/ws-server/src/handlers/game.ts`
- `apps/ws-server/src/zombie-job.ts`
- `apps/ws-server/test/invites.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/lib/realtime-types.ts` and `apps/ws-server/src/socket-types.ts`
  — this plan adds **no new websocket event**. Reusing `invite:received` /
  `invite:canceled` is a hard requirement; a new event would need a coordinated
  client+server deploy, and the server event map is loose anyway.
- `apps/web/src/lib/queries/home.ts` and `/api/home` payload — do NOT add
  invitations there. The resume banner is about *your* game; invitations get
  their own key so a `invite:received` never invalidates the history list.
- `apps/ws-server/test/resilience.test.ts`, `test/lobby.test.ts`,
  `test/handshake.test.ts`, `test/presence.test.ts` — they must keep passing
  **unmodified**; they are your regression net (in particular
  `resilience.test.ts:139` asserts `zombie.tick()` returns `1` for one stale
  active game and no stale lobby).
- `e2e/happy-path.spec.ts` — the existing flow (invite → « Rejoindre » button
  on the Accueil banner) must keep working; do not rewrite it.
- `packages/db/**` — no schema change, no migration is needed.
- `apps/web/src/lib/ws-errors.ts` — no new error code, no message change.
- Web Push / notifications of any kind (`SPECS.md:94`: « Pas de Web Push en v1 »).

## Git workflow

- Branch: `feat/durable-invitations` (repo convention: `type/short-slug`).
- Commit per step or per logical unit; conventional commits in English, e.g.
  `feat(web): session-gated pending invitations endpoint` and
  `fix(ws-server): re-push pending invitations at handshake`.
- Do NOT push and do NOT open a PR unless the operator explicitly asked.

## Steps

### Step 1: Add the server query for pending invitations

Create `apps/web/src/lib/queries/invites.ts`. It returns exactly the shape of
the existing socket payload so the client needs no mapping:

```ts
import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import type { GameFormat } from '@degommix/game-core'
import { db } from '@/lib/db'

export interface PendingInvite {
  gameId: string
  hostUsername: string
  format: GameFormat
}

function toGameFormat(value: number): GameFormat {
  if (value === 2 || value === 3 || value === 4) return value
  throw new Error(`Invalid game format: ${value}`)
}

/**
 * Invitations still awaiting an answer: `invited` seats of the user in games
 * that are still open lobbies. Newest first — the banner order of the Accueil.
 */
export async function getPendingInvites(userId: string): Promise<PendingInvite[]> {
  const rows = await db
    .select({ gameId: games.id, format: games.format, hostUsername: user.username })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(user, eq(user.id, games.hostId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(gamePlayers.status, 'invited'),
        eq(games.status, 'lobby'),
      ),
    )
    .orderBy(sql`${games.createdAt} desc`)

  return rows.map((row) => ({
    gameId: row.gameId,
    format: toGameFormat(row.format),
    hostUsername: row.hostUsername ?? '',
  }))
}
```

Notes: `games.status = 'lobby'` matters — a dissolved lobby (`finished`) must
not resurface, and a started game can never hold an `invited` seat
(`lobby:start` fails with `PENDING_INVITES`). The `toGameFormat` helper is
duplicated from `queries/home.ts:35-38` on purpose: that one is not exported and
`home.ts` is out of scope.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add the wire schema and the endpoint

In `apps/web/src/lib/api-payloads.ts`, next to `homePayloadSchema`, add:

```ts
export const invitesPayloadSchema = z.object({
  invites: z.array(
    z.object({
      gameId: z.string(),
      hostUsername: z.string(),
      format: formatSchema,
    })
  ),
})
```

and export `export type InvitesPayload = z.infer<typeof invitesPayloadSchema>`
alongside the other payload types (lines 95-98). No serializer is needed — the
payload holds no `Date`.

Create `apps/web/src/app/api/invites/route.ts`, copying the structure of
`apps/web/src/app/api/friends/route.ts` verbatim (including the
`PRIVATE_HEADERS` constant and its comment), calling `getPendingInvites` and
returning `{ invites }`.

In `apps/web/src/lib/api-payloads.test.ts`, add a `describe('wire schemas')`
case pair:
- `invitesPayloadSchema.parse({ invites: [] })` round-trips.
- a payload with `format: 5` is rejected (`safeParse(...).success === false`).

**Verify**: `pnpm --filter @degommix/web exec vitest run src/lib/api-payloads.test.ts`
→ all pass, including the 2 new cases.

### Step 3: Add the query key and the data hook

`apps/web/src/lib/query-keys.ts` — add, keeping the comment style:

```ts
  /** GET /api/invites — lobby invitations still awaiting an answer. */
  invites: ['invites'] as const,
```

`apps/web/src/hooks/use-tab-data.ts` — add, next to `useHomeData`:

```ts
/** Pending lobby invitations (Accueil banner + Jouer tab list). */
export function useInvitesData(
  initialData: InvitesPayload
): DefinedUseQueryResult<InvitesPayload, Error> {
  return useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => fetchPayload('/api/invites', invitesPayloadSchema),
    initialData,
  })
}
```

Import `invitesPayloadSchema` / `InvitesPayload` from `@/lib/api-payloads`.
`useInvalidateTabData` needs no change: its `TabDataKey` is
`keyof typeof queryKeys`, so `'invites'` becomes valid automatically.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Rewrite `useInvites` on top of the query cache

Rewrite `apps/web/src/hooks/use-invites.ts` so the list comes from the
`invites` query and the socket events become cache updates. Keep the exported
result shape (`invites`, `accept`, `decline`, `dismiss`) so the two consumers
change as little as possible; the only signature change is the new
`initialData` parameter.

Target shape:

```ts
export interface UseInvitesResult {
  /** Pending invitations from server state, patched live by socket events. */
  invites: PendingInvite[]
  accept: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  decline: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  /** Removes a banner locally without answering (until the next refetch). */
  dismiss: (gameId: string) => void
}

export function useInvites(initialData: InvitesPayload): UseInvitesResult {
  const { socket } = useSocket()
  const queryClient = useQueryClient()
  const { data } = useInvitesData(initialData)

  const remove = useCallback((gameId: string) => {
    queryClient.setQueryData<InvitesPayload>(queryKeys.invites, (current) => ({
      invites: (current?.invites ?? []).filter((invite) => invite.gameId !== gameId),
    }))
  }, [queryClient])

  useEffect(() => {
    if (!socket) return
    // The broadcast patches the cache for an instant banner, then the
    // invalidation lets the server payload confirm it.
    const onReceived = (payload: InviteReceivedPayload): void => {
      queryClient.setQueryData<InvitesPayload>(queryKeys.invites, (current) => ({
        invites: [
          payload,
          ...(current?.invites ?? []).filter((invite) => invite.gameId !== payload.gameId),
        ],
      }))
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites })
    }
    const onCanceled = ({ gameId }: { gameId: string }): void => {
      remove(gameId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites })
    }
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket, queryClient, remove])

  // `respond` / `accept` / `decline` keep their current bodies
  // (emitWithAck 'lobby:respond_invite', then `remove(gameId)` on ok).
}
```

Constraints:
- Newest first is fine for both consumers (they only `.map`), and
  `getPendingInvites` already orders newest first — keep the two consistent.
- `dismiss` must stay a local removal (no server call), same as today.
- Keep the `timeoutAck<...>()` fallback when `socket` is null.
- Keep the file's JSDoc updated: it must no longer claim the list is
  "invitations received while connected".

**Verify**: `pnpm typecheck` → exit 0 (it will fail on the two consumers until
step 5; run this verification after step 5 if so).

### Step 5: Seed both consumers from SSR

- `apps/web/src/components/home/invite-banner.tsx`: add
  `interface InviteBannerProps { initialData: InvitesPayload }`, pass it to
  `useInvites(initialData)`. Nothing else changes (the early
  `if (invites.length === 0) return null` stays).
- `apps/web/src/components/home/home-screen.tsx`: add an
  `initialInvites: InvitesPayload` prop and render
  `<InviteBanner initialData={initialInvites} />` at line 57.
- `apps/web/src/app/(tabs)/page.tsx`: add `getPendingInvites(user.id)` to the
  existing `Promise.all` and pass `initialInvites={{ invites }}`.
- `apps/web/src/components/lobby/play-screen.tsx`: add
  `interface PlayScreenProps { initialInvites: InvitesPayload }`, pass it to
  `useInvites`.
- `apps/web/src/app/(tabs)/jouer/page.tsx`: fetch the invitations server-side
  and pass them down:

```tsx
export default async function PlayPage() {
  const { user } = await requireOnboardedSession()
  const invites = await getPendingInvites(user.id)

  return <PlayScreen initialInvites={{ invites }} />
}
```

Do not change any French copy: the Accueil banner keeps
`<b>{invite.hostUsername} t’invite</b>` with « Rejoindre » / « Refuser », and
the Jouer tab keeps « Invitations reçues », « Aucune invitation en attente »
and « Les amis t’invitent en un clic, sans code — reçu directement ici. ».
`e2e/happy-path.spec.ts:67-69` asserts on `` `${J1.username} t’invite` `` and
the « Rejoindre » button name.

**Verify**: `pnpm typecheck` → exit 0. Then `pnpm lint` → exit 0.

### Step 6: Re-push pending invitations at handshake

In `apps/ws-server/src/server.ts`, inside `onSocketConnected`, after the
presence broadcast and **before** the `if (!seated) return` early exit, push the
pending invitations. Add a module-level helper next to `onSocketConnected`:

```ts
/**
 * Re-emits `invite:received` for every seat still `invited` in an open lobby.
 * Invitations are otherwise lost on reload, tab remount or a sleeping phone —
 * the seat survives in Postgres but nothing re-pushed it (SPECS.md:94: in-app
 * invitations only, no Web Push).
 */
async function pushPendingInvites(
  ctx: AppContext,
  socket: AppSocket,
  memberships: ActiveMembership[]
): Promise<void> {
  const pending = memberships.filter(
    (m) => m.player.status === 'invited' && m.game.status === 'lobby'
  )
  for (const membership of pending) {
    const [host] = await ctx.db
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, membership.game.hostId))
    socket.emit('invite:received', {
      gameId: membership.game.id,
      hostUsername: host?.username ?? '',
      format: membership.game.format,
    })
  }
}
```

Call it with the `memberships` already loaded at line 148 (do **not** re-query),
and emit to `socket` only — never to the `user:{id}` room, so other tabs are not
spammed on every reconnect. New imports in `server.ts`: `eq` from `drizzle-orm`,
`user` from `@degommix/db`, and `type ActiveMembership` from `./lobby-shared`.

**Verify**: `pnpm --filter @degommix/ws-server exec vitest run test/handshake.test.ts test/resilience.test.ts`
→ all pass (requires the test DB, see "Commands you will need").

### Step 7: Stop letting an unanswered invitation block anything

Decided semantics: **an `invited` (never-accepted) seat must not block
`lobby:create`, `lobby:join_by_code` or `replay:create`.** Only a `joined` seat
in a non-finished game blocks. When the user starts or joins something else, the
server auto-declines their pending invitations and notifies the hosts through the
existing `lobby:state` broadcast.

In `apps/ws-server/src/lobby-shared.ts`, **replace** `assertNotInGame` with:

```ts
/**
 * Blocks only on a real seat (`joined`) in a non-finished game. Pending
 * invitations are auto-declined instead: an unanswered invitation must never
 * lock the user out of creating or joining another game. Hosts learn about it
 * through the `lobby:state` rebroadcast, exactly like an explicit decline.
 */
export async function assertNotJoinedElsewhere(
  db: Db,
  io: AppServer,
  userId: string,
  options: { exceptGameId?: string } = {}
): Promise<void> {
  const memberships = await findActiveMemberships(db, userId)
  if (memberships.some((m) => m.player.status === 'joined')) {
    throw new CommandError('ALREADY_IN_GAME')
  }
  for (const membership of memberships) {
    if (membership.player.status !== 'invited') continue
    if (membership.game.id === options.exceptGameId) continue
    await db
      .update(gamePlayers)
      .set({ status: 'declined' })
      .where(and(eq(gamePlayers.gameId, membership.game.id), eq(gamePlayers.userId, userId)))
    io.to(`user:${userId}`).emit('invite:canceled', { gameId: membership.game.id })
    await broadcastLobbyState(db, io, membership.game.id)
  }
}
```

New imports in `lobby-shared.ts`: `broadcastLobbyState` from `./lobby-state`
and `type AppServer` from `./socket-types`. This direction is safe:
`lobby-state.ts` does not import `lobby-shared.ts`, so there is no cycle —
verify with `grep -n "lobby-shared" apps/ws-server/src/lobby-state.ts` (must
return nothing).

Update the three call sites:
- `handlers/lobby.ts:81` (`lobby:create`) → `await assertNotJoinedElsewhere(db, io, userId)`
- `handlers/lobby.ts:179` (`lobby:join_by_code`) → replace the whole line with
  `await assertNotJoinedElsewhere(db, io, userId, { exceptGameId: game.id })`.
  The `seat?.status !== 'invited'` guard disappears: the `exceptGameId` option
  covers it, and it must not be possible to keep another pending invitation
  after joining by code. The early return for an already-`joined` seat at
  lines 173-178 stays untouched.
- `handlers/game.ts:69` (`replay:create`) → `await assertNotJoinedElsewhere(db, io, userId)`
  (`io` is already destructured in that handler file; if not, take it from `ctx`).

The `invite:canceled` emitted to the user's own room is what makes a second open
tab drop its banner — the client already handles that event
(`use-invites.ts` after step 4).

**Verify**:
- `grep -rn "assertNotInGame" apps/ws-server/src` → no matches.
- `pnpm typecheck` → exit 0.
- `pnpm --filter @degommix/ws-server exec vitest run test/lobby.test.ts` → all
  pass, including `refuses lobby:create while already in a lobby`
  (line 111 — that user is `joined`, so it must still get `ALREADY_IN_GAME`).

### Step 8: Sweep stale lobbies in the zombie job

In `apps/ws-server/src/zombie-job.ts`, add a stale-lobby pass mirroring the
active-game pass. A lobby is stale when `games.status = 'lobby'` and
`lastActivityAt < cutoff` (same 24h `ZOMBIE_INACTIVITY_MS` threshold). Do **not**
route it through `manager.appendSystemEvent` — a lobby has no `GAME_STARTED`
event; dissolve the row directly, exactly like `lobby-admin.ts:100-106`:

```ts
  /** Dissolves lobbies nobody ever launched: the code is burned, seats freed. */
  const sweepStaleLobbies = async (cutoff: Date): Promise<number> => {
    const stale = await deps.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.status, 'lobby'), lt(games.lastActivityAt, cutoff)))
    for (const game of stale) {
      const seats = await deps.db
        .select({ userId: gamePlayers.userId, status: gamePlayers.status })
        .from(gamePlayers)
        .where(eq(gamePlayers.gameId, game.id))
      await deps.db
        .update(games)
        .set({ status: 'finished', outcome: 'aborted', endedAt: now() })
        .where(eq(games.id, game.id))
      for (const seat of seats) {
        if (seat.status !== 'invited') continue
        deps.io.to(`user:${seat.userId}`).emit('invite:canceled', { gameId: game.id })
      }
    }
    return stale.length
  }
```

`tick` becomes: compute `cutoff` once, run the existing active-game pass, then
`sweepStaleLobbies(cutoff)`, and return the **sum**. Update the `ZombieJob.tick`
doc comment to say "Closes every active game and dissolves every lobby inactive
for longer than the threshold. Returns the count." `resilience.test.ts:126-150`
still passes: its scenario has one stale active game and no stale lobby, so the
sum is `1`.

`createZombieJob` currently receives no `io`. Add `io: AppServer` to
`ZombieJobDeps` and pass `io` at the single construction site,
`apps/ws-server/src/server.ts:75-81`:

```ts
  const zombie = createZombieJob({
    db: deps.db,
    io,
    manager,
    now: deps.zombieNow,
    thresholdMs: deps.zombieThresholdMs,
    intervalMs: deps.zombieIntervalMs,
  })
```

New imports in `zombie-job.ts`: `gamePlayers` from `@degommix/db` and
`type AppServer` from `./socket-types`.

**Verify**: `pnpm --filter @degommix/ws-server exec vitest run test/resilience.test.ts`
→ all pass, unmodified.

### Step 9: Write the ws-server integration tests

Create `apps/ws-server/test/invites.test.ts`. Model it on
`apps/ws-server/test/lobby.test.ts` (same imports, same `beforeAll`
/`afterAll`/`beforeEach` skeleton, `ts.reset(['u1','u2','u3'])`, friendships
inserted with `ts.db.insert(friendships).values({ userLow: 'u1', userHigh: 'u2' })`
— note `canonicalPair` ordering matters, `u1 < u2 < u3` lexicographically).
Helpers available from `./harness`: `emitAck`, `expectOk`, `waitForEvent`,
`waitForEventMatching`, `expectNoEvent`, `collectEvents`, `sleep`.

Required cases:

1. **`re-pushes a pending invitation when the invitee reconnects`** — u1 creates
   a 2-player lobby and invites u2 while u2 is **not connected**; then
   `const s2 = await ts.connectAs('u2')` and
   `await waitForEvent(s2, 'invite:received')` equals
   `{ gameId, hostUsername: 'u1', format: 2 }`.
2. **`re-pushes on reconnect after the socket dropped`** — u2 connected,
   receives the invite, `s2.disconnect()`, reconnect → `invite:received` again.
3. **`does not re-push an invitation to a dissolved lobby`** — after the invite,
   u1 emits `lobby:leave` (dissolves the lobby, see `lobby-admin.ts:100-106`),
   then u2 connects → `await expectNoEvent(s2, 'invite:received', 300)`.
4. **`a pending invitation no longer blocks lobby:create`** — u2 invited, u2
   emits `lobby:create` → `expectOk`; and the old seat row for u2 in game 1 is
   `declined` (assert with a `ts.db.select()` on `gamePlayers`).
5. **`auto-declining a pending invitation notifies the host`** — same as 4, but
   the host socket `s1` awaits a `lobby:state` broadcast whose `players` no
   longer contains `u2` (use `waitForEventMatching<LobbyState>(s1, 'lobby:state', (s) => s.players.every((p) => p.userId !== 'u2'))`).
6. **`a joined seat still blocks lobby:create`** — u2 accepts the invitation
   (`lobby:respond_invite` with `accept: true`), then `lobby:create` →
   `{ ok: false, code: 'ALREADY_IN_GAME' }`.
7. **`join_by_code into the lobby you were invited to still works`** — u2
   invited to that same lobby joins with the code → `expectOk`, seat `joined`
   (regression guard for the `exceptGameId` option).
8. **`the sweep dissolves a lobby inactive for more than 24h and cancels its invitations`**
   — u1 creates a lobby, invites u2, backdate with
   `await ts.db.update(games).set({ lastActivityAt: sql\`now() - interval '25 hours'\` }).where(eq(games.id, gameId))`,
   attach `waitForEvent(s2, 'invite:canceled')` **before** calling
   `await ts.server.zombie.tick()`, then assert the event, and that the `games`
   row is `status: 'finished'`, `outcome: 'aborted'`.

Race note (read before debugging a flake): `ts.connectAs` resolves on `connect`,
so in cases 1, 2 and 3 the listener is attached *after* the handshake. This is
fine because `pushPendingInvites` awaits database queries before emitting — the
same assumption the existing `apps/ws-server/test/resilience.test.ts:80-81` test
already relies on for `game:state_snapshot`. If a case still flakes, make it
deterministic instead of deleting it: build the client socket inline with `ioc`
from `socket.io-client` (see `apps/ws-server/test/harness.ts:117-132`), attach
the listener on the returned instance, then `await waitForConnect(socket)` (both
`waitForConnect` and `ts.signToken` are exported by the harness). Report the
change in your final message.

**Verify**: `pnpm --filter @degommix/ws-server exec vitest run test/invites.test.ts`
→ all 8 tests pass.

### Step 10: Full verification

Run, in order:

```
docker compose -f docker-compose.test.yml up -d
pnpm lint
pnpm typecheck
pnpm exec turbo run test --concurrency=1
```

All must exit 0.

**Verify**: also `git status --short` → only files from the "In scope" list
appear.

## Test plan

- **New file** `apps/ws-server/test/invites.test.ts` — the 8 cases of step 9:
  the reconnect-replay regression (cases 1-3), the soft-lock fix and its
  host notification (cases 4-5), the preserved block for real seats (case 6),
  the `exceptGameId` regression (case 7), the stale-lobby sweep (case 8).
  Structural pattern: `apps/ws-server/test/lobby.test.ts`; the stale-row
  backdating trick comes from `apps/ws-server/test/resilience.test.ts:131-135`.
- **Extended** `apps/web/src/lib/api-payloads.test.ts` — 2 cases for
  `invitesPayloadSchema` (empty payload round-trip, unknown format rejected),
  matching the existing `describe('wire schemas')` style at lines 81-132.
- **Unmodified regression net** that must still pass: `test/lobby.test.ts`
  (`refuses lobby:create while already in a lobby`,
  `invite + accept seats the friend as joined`), `test/resilience.test.ts`
  (`handshake puts the player back in the room with a state snapshot`,
  `the zombie sweep closes games inactive for more than 24h`),
  `test/handshake.test.ts`, `test/presence.test.ts`.
- Verification: `pnpm exec turbo run test --concurrency=1` → all pass,
  including the 8 new ws-server tests and the 2 new web tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0, with
      `apps/ws-server/test/invites.test.ts` present and its 8 tests passing
- [ ] `grep -rn "assertNotInGame" apps/ws-server/src apps/ws-server/test` returns no matches
- [ ] `grep -rn "useState<InviteReceivedPayload\[\]>" apps/web/src` returns no matches
      (the component-local invitation list is gone)
- [ ] `curl`-free check that the route exists: `test -f apps/web/src/app/api/invites/route.ts`
- [ ] `grep -n "invites:" apps/web/src/lib/query-keys.ts` returns the new key
- [ ] `git diff --stat 094ddfd..HEAD -- apps/web/src/lib/realtime-types.ts apps/ws-server/src/socket-types.ts`
      is empty (no protocol change was needed)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt does not match the live code (the repo drifted
  since commit `094ddfd`).
- `docker compose -f docker-compose.test.yml up -d` fails or the ws-server
  integration suites cannot reach the test database — report instead of
  skipping or rewriting the tests to avoid the DB.
- `apps/ws-server/test/lobby.test.ts` or `test/resilience.test.ts` starts
  failing and the only fix you can see is editing those files (they are
  out of scope: a failure there means the semantics change went too far).
- Making the read path work seems to require a new websocket event, a change to
  `realtime-types.ts` / `socket-types.ts`, or a DB migration.
- You discover that `lobby-state.ts` imports `lobby-shared.ts` (would make the
  step 7 import a cycle) — report, do not restructure the modules.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinize**: (a) the auto-decline in
  `assertNotJoinedElsewhere` is a *write* inside what used to be a pure
  assertion — check it is only reached from `lobby:create`,
  `lobby:join_by_code` and `replay:create`, and that `exceptGameId` is passed on
  the join-by-code path; (b) `pushPendingInvites` emits to `socket`, never to
  the `user:{id}` room; (c) the invitations query filters
  `games.status = 'lobby'`.
- **Alternatives considered and rejected** (do not re-litigate without a
  reason): a new `invite:snapshot` websocket event (rejected — the JSON layer
  already exists and a new event needs a coordinated deploy); folding
  invitations into the `/api/home` payload (rejected — an `invite:received`
  would then invalidate stats + history, and the Jouer tab has no home payload);
  keeping the hard `ALREADY_IN_GAME` block and just showing a better toast with
  a "cancel my pending invitation" action (rejected — it makes the user fix a
  server bookkeeping problem by hand).
- **Known trade-off in the sweep**: `games.lastActivityAt` is never touched by
  lobby commands (only `game-manager.ts` updates it, at start and per command),
  so for a `lobby` row it is effectively the creation timestamp. A lobby created
  more than 24h ago is dissolved even if people were talking in it 5 minutes
  ago. Accepted: a lobby is a short-lived object. If that ever bites, touch
  `lastActivityAt` in the lobby handlers rather than loosening the threshold.
- **Deferred out of this plan**: notifying the *host* with a dedicated toast
  when an invitee's seat is auto-declined (today the host only sees the seat
  disappear from the lobby list, same as a manual decline); showing pending
  invitations anywhere else than Accueil + Jouer; any Web Push work
  (`SPECS.md:94` forbids it for v1).
- **Future interactions**: if a lobby ever gains an "invitation expires after
  N minutes" rule, it belongs in the same sweep function as step 8, not in a
  new job. If `game_players` gains an `invitedAt` column, `getPendingInvites`
  should order by it instead of `games.createdAt`.
