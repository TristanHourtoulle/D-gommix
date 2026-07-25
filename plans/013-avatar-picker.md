# Plan 013: Let every player pick one of 16 avatars, replacing the initial everywhere

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add (or update) the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. Note: at the time of writing, `plans/README.md` on `main`
> only lists 001–007; rows for 008–013 are landing through separate PRs, so
> **append** your row rather than expecting it to exist.
>
> **Drift check (run first)**:
> `git diff --stat e772284..HEAD -- packages/db/src/schema/auth.ts packages/db/drizzle apps/web/src/components/ui/player-avatar.tsx apps/web/src/app/api/username apps/web/src/app/'(tabs)'/profil apps/web/src/lib/api-payloads.ts apps/web/src/lib/queries apps/web/src/lib/realtime-types.ts apps/ws-server/src/lobby-state.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED (it includes a database migration)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e772284`, 2026-07-25

## Why this matters

Everywhere a player appears outside a game — friends list, leaderboard, lobby
seats, invitations, profile — Dégommix renders the first letter of their pseudo
in a bronze ring. It is tidy and completely anonymous: four rows of « A », « M »,
« T », « O » look the same at a glance, and the app's one visual identity (the
Astérix-adjacent, hand-drawn parchment world) stops at the character portraits
used *inside* a game.

The owner reviewed three illustration directions and decided **not to pick one**:
all sixteen avatars — 6 comic portraits, 6 emblem silhouettes, 4 engraved seals —
ship together, and each player freely chooses theirs from their profile. A
player who never chooses keeps today's initial, so nothing regresses and there is
no backfill.

This is the first change in the app that adds a user-owned, persisted preference,
so it also sets the pattern: a nullable column, a validated allowlist server-side,
a pure client registry, and one shared component that propagates the new artwork
to every surface at once.

## Current state

### The one avatar component (there is exactly one — verified)

`apps/web/src/components/ui/player-avatar.tsx` (whole file, 19 lines, verbatim):

```tsx
interface PlayerAvatarProps {
  username: string
  size?: 32 | 40 | 44 | 56
}

/** Uppercase initial inside a bronze ring. */
export function PlayerAvatar({ username, size = 40 }: PlayerAvatarProps) {
  const initial = username.charAt(0).toUpperCase()

  return (
    <span
      className="avatar-ring"
      style={{ width: size, height: size, fontSize: `${size * 0.024}rem` }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
```

Its CSS, `apps/web/src/app/globals.css:292-306`:

```css
.avatar-ring {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2.5px solid var(--bronze);
  background: var(--bronze-tint);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--bronze-strong);
  flex: none;
}
```

**All 14 call sites**, each passing only `username` and `size` today:

| File | Line | Size |
|---|---|---|
| `apps/web/src/app/(tabs)/profil/page.tsx` | 28 | 56 |
| `apps/web/src/app/(tabs)/amis/[userId]/page.tsx` | 57 | 44 |
| `apps/web/src/components/home/home-screen.tsx` | 47 | 44 |
| `apps/web/src/components/lobby/seat-card.tsx` | 38 | 32 |
| `apps/web/src/components/lobby/host-controls.tsx` | 63 | 32 |
| `apps/web/src/components/lobby/play-screen.tsx` | 189 | 32 |
| `apps/web/src/components/friends/friend-row.tsx` | 55 | 32 |
| `apps/web/src/components/friends/search-bar.tsx` | 98 | 32 |
| `apps/web/src/components/friends/request-row.tsx` | 29 | 32 |
| `apps/web/src/components/stats/ranking-table.tsx` | 25 | 32 |
| `apps/web/src/components/stats/top-degommeur-tile.tsx` | 16 | 40 |
| `apps/web/src/components/stats/rivalry-tile.tsx` | 32, 46 | 32 |
| `apps/web/src/app/dev/ui/styleguide.tsx` | 135 | all |

**Because there is exactly one component, one change propagates everywhere.**
That is the whole reason this feature is M-L and not L-XL.

### Database — `packages/db/src/schema/auth.ts:1-17` (verbatim)

```ts
import { boolean, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    username: text('username'), // NULL until onboarding is done; max 20 chars enforced by Zod
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_username_ci_unique').on(sql`lower(${t.username})`)]
)
```

There is already an `image` column — Better Auth's default OAuth-avatar URL
field, unused by any UI in this app. **Do not reuse it**: it means "a URL from
an identity provider", not "an id from our catalog", and Better Auth writes to
it on its own terms.

Migration flow — `packages/db/package.json` scripts (verbatim):

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

`packages/db/drizzle.config.ts` (verbatim):

```ts
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/degommix',
  },
})
```

`packages/db/drizzle/` currently holds `0000_fixed_monster_badoon.sql`,
`0001_funny_ted_forrester.sql`, `0002_bored_the_executioner.sql`, plus
`meta/_journal.json` and one snapshot per migration. The journal shape:

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    { "idx": 0, "version": "7", "when": 1784970980794, "tag": "0000_fixed_monster_badoon", "breakpoints": true },
    { "idx": 1, "version": "7", "when": 1784971526898, "tag": "0001_funny_ted_forrester", "breakpoints": true },
    { "idx": 2, "version": "7", "when": 1784984385282, "tag": "0002_bored_the_executioner", "breakpoints": true }
  ]
}
```

An example of a small existing migration (`0001_funny_ted_forrester.sql`, one
line):

```sql
ALTER TABLE "jwks" ADD COLUMN "expires_at" timestamp with time zone;
```

**`drizzle-kit generate` writes all three artefacts** (the `.sql`, the journal
entry, the snapshot). Never hand-write them.

### The endpoint pattern to mirror — `apps/web/src/app/api/username/route.ts` (whole file, 49 lines, verbatim)

```ts
const bodySchema = z.object({
  username: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_.-]+$/),
})

/** Drizzle wraps driver errors in DrizzleQueryError, so the Postgres code lives on the cause chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && current.code === '23505') return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}

/** Sets the username at onboarding and updates it later from the profile screen. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_USERNAME' }, { status: 400 })
  }
  try {
    await db
      .update(user)
      .set({ username: parsed.data.username, updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'USERNAME_TAKEN' }, { status: 409 })
    }
    throw error
  }
  return NextResponse.json({ ok: true, username: parsed.data.username })
}
```

There is **no test file** for this route (verified: no `*username*.test.*`
anywhere under `apps/web`). This repo tests pure functions, not route handlers —
so this plan tests the **registry and its Zod schema**, which is where the
validation logic actually lives.

The client that calls it — `apps/web/src/components/profile/username-form.tsx`
— posts with `fetch`, toasts on failure and then calls **`router.refresh()`**
(line 103). It touches no react-query key. **Mirror that**: the profile page is a
server component, so `router.refresh()` is the correct invalidation.

### The profile screen — `apps/web/src/app/(tabs)/profil/page.tsx` (lines 11–45, verbatim)

```tsx
export default async function ProfilePage() {
  const session = await requireSession()
  const { username, email } = session.user
  if (!username) redirect('/onboarding')

  return (
    <main className="tab-page">
      {/* …back link… */}

      <header className="flex items-center gap-3">
        <PlayerAvatar username={username} size={56} />
        <div>
          <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
            {username}
          </h1>
          <p className="s-sub">Ton profil de dégommeur</p>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Pseudo</p>
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            C&apos;est lui que tes amis verront dans les parties. 20 caractères maximum.
          </p>
          <UsernameForm currentUsername={username} />
        </Card>
      </section>
      {/* …Thème section, Compte section… */}
```

`requireSession()` returns the Better Auth session
(`apps/web/src/lib/session.ts:19-23`); its `user` object is Better Auth's, and
**this plan does not assume it exposes a custom column**. The current
`avatarId` is read with an explicit query (Step 5).

### Read surfaces that feed `PlayerAvatar` — the exact list

Every one of these is a `select({...})` with an explicit column list (never
`SELECT *`), so adding one key is mechanical and additive:

| File | Lines | What it selects |
|---|---|---|
| `apps/web/src/lib/queries/friends.ts` | 64–74 | `getPublicUser`: `{ id, username }` |
| `apps/web/src/lib/queries/friends.ts` | 79–110 | `getFriendsPageData`: received `{ requestId, senderId, senderUsername }`, sent `{ requestId, receiverId, receiverUsername }`, friends `{ id, username }` |
| `apps/web/src/lib/queries/home.ts` | 124, 151 | `winnerUsername`, participant `username` |
| `apps/web/src/lib/queries/stats.ts` | 100, 145–151 | leaderboard `{ id, username }`, unranked rows |
| `apps/web/src/lib/queries/stats.ts` | 288–306 | `getGameDetail` player rows |
| `apps/web/src/lib/queries/rivalries.ts` | 111–115 | `loadUsernames`: `{ id, username }` |
| `apps/web/src/lib/queries/lobby.ts` | 34–39 | friends-to-invite: `{ id, username }` |
| `apps/web/src/lib/queries/invites.ts` | 22 | `{ gameId, format, hostUsername }` |
| `apps/ws-server/src/lobby-state.ts` | 24–34 | `{ userId, status, character, username }` |

And the Zod payloads the browser parses — `apps/web/src/lib/api-payloads.ts`
(verbatim, the objects you will extend):

```ts
export const friendsPayloadSchema = z.object({
  received: z.array(
    z.object({ requestId: z.string(), senderId: z.string(), senderUsername: z.string() })
  ),
  sent: z.array(
    z.object({ requestId: z.string(), receiverId: z.string(), receiverUsername: z.string() })
  ),
  friends: z.array(
    z.object({ id: z.string(), username: z.string(), initialPresence: presenceSchema })
  ),
  myLobbyId: z.string().nullable(),
})

export const leaderboardPayloadSchema = z.object({
  rows: z.array(
    z.object({
      rank: z.number(), userId: z.string(), username: z.string(),
      wins: z.number(), winrate: z.number(), villageGames: z.number(),
      degommages: z.number(), favoriteCharacter: characterSchema.nullable(),
    })
  ),
  friendCount: z.number(),
  topDegommeur: z
    .object({ userId: z.string(), username: z.string(), degommages: z.number() })
    .nullable(),
  rivalry: z.object({
    nemesis: rivalryPeerSchema.nullable(),
    favoriteVictim: rivalryPeerSchema.nullable(),
  }),
  characterWinrates: z.array(
    z.object({ character: characterSchema, winrate: z.number(), games: z.number() })
  ),
})

const rivalryPeerSchema = z.object({
  userId: z.string(),
  username: z.string(),
  count: z.number(),
})

export const invitesPayloadSchema = z.object({
  invites: z.array(
    z.object({ gameId: z.string(), hostUsername: z.string(), format: formatSchema })
  ),
})
```

These are plain `z.object`, not `.strict()`, so an extra field never breaks a
parse. But an extra **required** field would break an *older cached payload*
(the app is a PWA with react-query caching), so every new field must be
`.nullable().optional()` — see the decision below.

### The ws lobby payload — `apps/ws-server/src/lobby-state.ts:6-19` and its web mirror

```ts
export interface LobbyPlayer {
  userId: string
  username: string
  status: 'invited' | 'joined'
  character: CharacterId | null
}

export interface LobbyState {
  gameId: string
  code: string
  format: GameFormat
  hostId: string
  players: LobbyPlayer[]
}
```

`apps/web/src/lib/realtime-types.ts:11-25` holds a hand-written mirror,
introduced with the comment « Mirror of the ws-server `LobbyPlayer` shape
(apps/ws-server/src/lobby-state.ts) ». There is **no Zod on the socket path** —
the two must be edited together or the mirror lies.

### Tests that exist near this work

`apps/web/src/lib/api-payloads.test.ts` (169 lines) is the pattern: plain
`vitest`, small object literals, `.parse` / `.safeParse(...).success`, no HTTP.
Excerpt (lines 94–109):

```ts
  it('accepts an empty invites payload', () => {
    const empty = { invites: [] }
    expect(invitesPayloadSchema.parse(empty)).toEqual(empty)
  })

  it('rejects an invitation with an unsupported game format', () => {
    const bad = { invites: [{ gameId: 'g1', hostUsername: 'Obelix', format: 5 }] }
    expect(invitesPayloadSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts an empty friends payload', () => {
    const empty = { received: [], sent: [], friends: [], myLobbyId: null }
    expect(friendsPayloadSchema.parse(empty)).toEqual(empty)
  })
```

### Repo conventions that apply

- TypeScript strict, `noUncheckedIndexedAccess`, `noImplicitReturns`. No `any`,
  no `as` casts (except the `as CSSProperties` idiom used by
  `apps/web/src/components/ui/character-badge.tsx:21`).
- English code and comments; French only in user-facing strings, with `’`
  (U+2019).
- Zod at every system boundary — see `api-payloads.ts` and `api/username/route.ts`.
- Tests are pure-TS `*.test.ts`, `vitest`, **node** environment
  (`apps/web/vitest.config.ts`: `environment: 'node'`,
  `include: ['src/**/*.test.ts']`). No `@testing-library/react` anywhere.
  **Do not write component tests, do not add dependencies.**

## Decisions already made (do not re-litigate)

1. **All 16 avatars ship**, from all three boards — the owner explicitly
   declined to pick a single style. Ids: `a-moustachu`, `a-guerriere`,
   `a-druide`, `a-centurion`, `a-patricienne`, `a-legionnaire`,
   `b-casque-aile`, `b-menhir`, `b-sanglier`, `b-cimier`, `b-aigle`,
   `b-bouclier`, `c-torque`, `c-lyre`, `c-enseigne`, `c-sceau`.
2. **The column is nullable with no backfill.** `NULL` means "show the initial",
   which is exactly today's behaviour — so an unmigrated user, an old cached
   payload and a brand-new account all render correctly.
3. **`c-sceau` embeds a `<text>` initial** and must be parameterised with the
   member's initial at render time. It is the one avatar that still shows the
   letter, framed by a laurel seal.
4. **Every new payload field is `.nullable().optional()`** on the Zod side and
   `string | null | undefined` on the TS side. Rationale: the app is a PWA and
   react-query keeps payloads across deploys; a required field would make an old
   cached payload fail to parse and blank a screen. Optional-and-nullable costs
   one `?? null` at each render site and removes the whole class of failure.
5. **Server-side validation is an allowlist**, `z.enum(AVATAR_IDS)`, never a free
   string. The value ends up inside an SVG `<use href>`-style lookup, and an
   unvalidated id is how you get a stored-XSS-shaped bug in a future refactor.

## Commands you will need

| Purpose            | Command                                                                                          | Expected on success |
|--------------------|--------------------------------------------------------------------------------------------------|---------------------|
| Install            | `pnpm install`                                                                                     | exit 0              |
| Test DB up         | `docker compose -f docker-compose.test.yml up -d`                                                  | container running on port 54329 |
| Generate migration | `DATABASE_URL=… pnpm --filter @degommix/db db:generate`                                            | a new `000N_*.sql` + journal entry + snapshot |
| Apply migration    | `DATABASE_URL=… pnpm --filter @degommix/db db:migrate`                                             | exit 0              |
| New unit tests     | `pnpm --filter @degommix/web test src/lib/avatars.test.ts`                                         | exit 0              |
| All web unit tests | `pnpm --filter @degommix/web test`                                                                 | exit 0              |
| Typecheck (repo)   | `pnpm typecheck`                                                                                   | exit 0              |
| Lint (repo)        | `pnpm lint`                                                                                        | exit 0              |
| Full suite         | `pnpm exec turbo run test --concurrency=1` (test DB up)                                            | exit 0              |
| E2E                | `pnpm test:e2e` (test DB up)                                                                       | exit 0              |

Local dev DB per `README.md`:
`postgres://degommix:degommix@localhost:54329/degommix_test`.

## Scope

**In scope** (the only files you may create or modify):

Database
- `packages/db/src/schema/auth.ts`
- `packages/db/drizzle/**` (generated — **never hand-written**)

Web — new
- `apps/web/src/lib/avatars.ts` + `apps/web/src/lib/avatars.test.ts`
- `apps/web/src/components/ui/avatar-art.tsx`
- `apps/web/src/app/api/avatar/route.ts`
- `apps/web/src/components/profile/avatar-picker.tsx`
- `apps/web/src/lib/queries/profile.ts`

Web — modified
- `apps/web/src/components/ui/player-avatar.tsx`
- `apps/web/src/app/globals.css` (avatar-ring art rules only)
- `apps/web/src/app/(tabs)/profil/page.tsx`
- `apps/web/src/lib/api-payloads.ts` + `apps/web/src/lib/api-payloads.test.ts`
- `apps/web/src/lib/realtime-types.ts`
- `apps/web/src/lib/queries/friends.ts`, `home.ts`, `stats.ts`, `rivalries.ts`,
  `lobby.ts`, `invites.ts`
- The 13 non-styleguide `PlayerAvatar` call sites listed above
- `apps/ws-server/src/lobby-state.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- The `image` column on `user` — Better Auth owns it. Do not repurpose, do not
  drop, do not migrate data into it.
- `apps/web/src/app/api/username/**` — the username endpoint is the *pattern*,
  not a target. Do not refactor it, do not merge the two endpoints.
- `apps/web/src/components/ui/character-badge.tsx` and `CHARACTER_META` — the
  in-game character portraits are a different concept (chosen per game, from
  four options). An avatar is a profile identity. Keep them separate.
- Uploads of any kind. No file input, no storage bucket, no cropping. Sixteen
  built-in avatars, full stop.
- `apps/web/src/app/dev/ui/styleguide.tsx` — optional; update it only if it fails
  to typecheck.
- Adding avatars, renaming ids, or redrawing artwork. The SVG in the appendix is
  the source of truth; transcribe it, do not improve it.

## Git workflow

- Branch: `feat/avatar-picker` (repo convention `type/slug`).
- Conventional Commits in English, one per step group. Suggested:
  1. `feat(db): nullable avatar_id column on user`
  2. `feat(web): avatar registry and artwork for the 16 built-in avatars`
  3. `feat(web): render the chosen avatar in the shared player ring`
  4. `feat(web): avatar update endpoint and profile picker`
  5. `feat(web): carry avatarId through every read surface`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the ground truth

Run the drift check, then read in full: `player-avatar.tsx`,
`api/username/route.ts`, `components/profile/username-form.tsx`,
`(tabs)/profil/page.tsx`, `packages/db/src/schema/auth.ts`, `api-payloads.ts`,
`realtime-types.ts` lines 1–30, `apps/ws-server/src/lobby-state.ts`.

**Verify**:
- `grep -rn "PlayerAvatar" apps/web/src --include=*.tsx | wc -l` → `15`
  (14 usages + 1 definition). If the number differs, the call-site table above
  is stale — re-derive it before continuing.
- `grep -rn "avatar" packages/db/src` → **no matches**.
- `grep -rn "@testing-library/react" . --include=package.json` → no matches.
- `docker compose -f docker-compose.test.yml up -d` then
  `pnpm exec turbo run test --concurrency=1` → exit 0 (green baseline).

### Step 2: Add the column

Edit `packages/db/src/schema/auth.ts` — add **one line** inside the `user`
column object, right after `username`:

```ts
    username: text('username'), // NULL until onboarding is done; max 20 chars enforced by Zod
    avatarId: text('avatar_id'), // NULL = fall back to the pseudo initial; allowlist enforced by Zod
```

Then generate and apply the migration:

```bash
docker compose -f docker-compose.test.yml up -d
export DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test
pnpm --filter @degommix/db db:generate
pnpm --filter @degommix/db db:migrate
```

**Verify**:
- `ls packages/db/drizzle/*.sql` → a new `0003_*.sql` exists.
- `cat packages/db/drizzle/0003_*.sql` → a single
  `ALTER TABLE "user" ADD COLUMN "avatar_id" text;` (no `NOT NULL`, no
  `DEFAULT`, nothing else). **If it contains anything else — a drop, a rename,
  a constraint — that is a STOP condition**: the schema had drifted from the
  migrations before you started.
- `git status --porcelain packages/db` → shows the schema file, the new `.sql`,
  `meta/_journal.json` and `meta/0003_snapshot.json`.
- `psql "$DATABASE_URL" -c '\d "user"'` → the `avatar_id` column is listed as
  nullable `text`.

Commit: `feat(db): nullable avatar_id column on user`.

### Step 3: Create the registry

Create `apps/web/src/lib/avatars.ts` — pure data, no JSX, so it is unit-testable
in the node environment and importable from both the route handler and the
client:

```ts
/**
 * The sixteen built-in avatars. Three boards were proposed and all three ship:
 * every player picks freely, and `null` (nobody picked) keeps the pseudo
 * initial that the app has always shown.
 *
 * The ids are a closed set on purpose — they are the server-side allowlist
 * (`avatarIdSchema`) and the key of the artwork lookup in
 * `components/ui/avatar-art.tsx`. Never accept a free-form string here.
 */
import { z } from 'zod'

export const AVATAR_BOARDS = ['portraits', 'emblemes', 'sceaux'] as const
export type AvatarBoard = (typeof AVATAR_BOARDS)[number]

/** French heading for each board, shown above its grid in the picker. */
export const AVATAR_BOARD_LABELS: Record<AvatarBoard, string> = {
  portraits: 'Portraits',
  emblemes: 'Emblèmes',
  sceaux: 'Sceaux gravés',
}

export interface AvatarMeta {
  readonly id: string
  readonly board: AvatarBoard
  /** Name shown under the ring in the picker. */
  readonly label: string
  /** One-line description, also used as the ring's accessible name. */
  readonly hint: string
}

export const AVATARS: readonly AvatarMeta[] = [
  { id: 'a-moustachu', board: 'portraits', label: 'Le Moustachu', hint: 'Casque ailé, tunique rouge' },
  { id: 'a-guerriere', board: 'portraits', label: 'La Guerrière', hint: 'Tresses et torque d’or' },
  { id: 'a-druide', board: 'portraits', label: 'Le Druide', hint: 'Capuche verte, barbe blanche' },
  { id: 'a-centurion', board: 'portraits', label: 'Le Centurion', hint: 'Cimier transversal rouge' },
  { id: 'a-patricienne', board: 'portraits', label: 'La Patricienne', hint: 'Couronne de laurier, chignon' },
  { id: 'a-legionnaire', board: 'portraits', label: 'Le Légionnaire', hint: 'Couvre-joues, bouclier bleu' },
  { id: 'b-casque-aile', board: 'emblemes', label: 'Casque Ailé', hint: 'Rouge camp · l’emblème gaulois' },
  { id: 'b-menhir', board: 'emblemes', label: 'Le Menhir', hint: 'Vert camp · pierre levée' },
  { id: 'b-sanglier', board: 'emblemes', label: 'Le Sanglier', hint: 'Bronze · silhouette géométrique' },
  { id: 'b-cimier', board: 'emblemes', label: 'Casque à Cimier', hint: 'Bleu camp · crête et couvre-joues' },
  { id: 'b-aigle', board: 'emblemes', label: 'L’Aigle', hint: 'Jaune camp · enseigne de légion' },
  { id: 'b-bouclier', board: 'emblemes', label: 'Le Bouclier', hint: 'Rouge camp · umbo et foudres' },
  { id: 'c-torque', board: 'sceaux', label: 'Le Torque', hint: 'Collier ouvert à deux tampons' },
  { id: 'c-lyre', board: 'sceaux', label: 'Le Barde', hint: 'Lyre à trois cordes' },
  { id: 'c-enseigne', board: 'sceaux', label: 'L’Enseigne', hint: 'Étendard à franges' },
  { id: 'c-sceau', board: 'sceaux', label: 'Le Sceau', hint: 'Laurier + initiale du membre' },
]

export const AVATAR_IDS = AVATARS.map((avatar) => avatar.id)

/** Server-side allowlist. `null` is a legal value: it means "back to the initial". */
export const avatarIdSchema = z.enum(AVATAR_IDS as [string, ...string[]]).nullable()

/** `true` when the id is one this build knows how to draw. */
export function isKnownAvatarId(id: string | null | undefined): boolean {
  return typeof id === 'string' && AVATAR_IDS.includes(id)
}

/** Avatars of one board, in catalog order. */
export function avatarsOfBoard(board: AvatarBoard): readonly AvatarMeta[] {
  return AVATARS.filter((avatar) => avatar.board === board)
}
```

Create `apps/web/src/lib/avatars.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AVATARS,
  AVATAR_BOARDS,
  AVATAR_BOARD_LABELS,
  AVATAR_IDS,
  avatarIdSchema,
  avatarsOfBoard,
  isKnownAvatarId,
} from './avatars'

describe('avatar catalog', () => {
  it('holds the sixteen validated avatars', () => {
    expect(AVATARS).toHaveLength(16)
    expect(AVATAR_IDS).toEqual([
      'a-moustachu', 'a-guerriere', 'a-druide', 'a-centurion', 'a-patricienne', 'a-legionnaire',
      'b-casque-aile', 'b-menhir', 'b-sanglier', 'b-cimier', 'b-aigle', 'b-bouclier',
      'c-torque', 'c-lyre', 'c-enseigne', 'c-sceau',
    ])
  })

  it('splits them 6 / 6 / 4 across the three boards', () => {
    expect(avatarsOfBoard('portraits')).toHaveLength(6)
    expect(avatarsOfBoard('emblemes')).toHaveLength(6)
    expect(avatarsOfBoard('sceaux')).toHaveLength(4)
  })

  it('has no duplicate id', () => {
    expect(new Set(AVATAR_IDS).size).toBe(16)
  })

  it('labels every board', () => {
    for (const board of AVATAR_BOARDS) expect(AVATAR_BOARD_LABELS[board]).toBeTruthy()
  })

  it('uses the typographic apostrophe in the French copy', () => {
    for (const avatar of AVATARS) {
      expect(avatar.label).not.toContain("'")
      expect(avatar.hint).not.toContain("'")
    }
  })
})

describe('avatarIdSchema', () => {
  it('accepts every catalog id', () => {
    for (const id of AVATAR_IDS) expect(avatarIdSchema.parse(id)).toBe(id)
  })

  it('accepts null — back to the pseudo initial', () => {
    expect(avatarIdSchema.parse(null)).toBeNull()
  })

  it('rejects an unknown id', () => {
    expect(avatarIdSchema.safeParse('a-inconnu').success).toBe(false)
  })

  it('rejects markup, a path and a URL', () => {
    for (const bad of ['<script>', '../../etc/passwd', 'https://evil.test/x.svg', '']) {
      expect(avatarIdSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('rejects a non-string', () => {
    expect(avatarIdSchema.safeParse(42).success).toBe(false)
    expect(avatarIdSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('isKnownAvatarId', () => {
  it('is true only for catalog ids', () => {
    expect(isKnownAvatarId('c-sceau')).toBe(true)
    expect(isKnownAvatarId('nope')).toBe(false)
    expect(isKnownAvatarId(null)).toBe(false)
    expect(isKnownAvatarId(undefined)).toBe(false)
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/lib/avatars.test.ts` → exit 0,
11 tests pass.

### Step 4: Transcribe the artwork

Create `apps/web/src/components/ui/avatar-art.tsx`. It exports one function:

```tsx
import type { ReactElement } from 'react'

interface AvatarArtProps {
  avatarId: string
  /** Uppercase initial, engraved into `c-sceau` — the one avatar that keeps a letter. */
  initial: string
}

/**
 * The sixteen avatar drawings, transcribed from the validated artwork board.
 * Each returns the *body* of a 0 0 100 100 SVG; `PlayerAvatar` provides the
 * `<svg>` wrapper and the bronze ring around it.
 *
 * The colours are literal hexes on purpose: these are illustrations with their
 * own palette, not themed UI chrome. They read on both the light and the dark
 * parchment because every avatar carries its own opaque background disc.
 */
export function AvatarArt({ avatarId, initial }: AvatarArtProps): ReactElement | null {
  switch (avatarId) {
    // …one case per id, returning a <> … </> fragment…
  }
}
```

Transcribe every symbol from **Appendix A** (the raw SVG, verbatim from the
validated board) into a `case` returning a fragment of the symbol's children.
Rules, applied mechanically:

| SVG attribute | JSX attribute |
|---|---|
| `stroke-width` | `strokeWidth` |
| `stroke-linejoin` | `strokeLinejoin` |
| `stroke-linecap` | `strokeLinecap` |
| `stroke-dasharray` | `strokeDasharray` |
| `text-anchor` | `textAnchor` |
| `font-family` | `fontFamily` |
| `font-size` | `fontSize` |
| `font-weight` | `fontWeight` |
| `class` | `className` |
| everything else (`d`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height`, `fill`, `stroke`, `opacity`, `points`, `transform`) | unchanged |

Numeric attribute values stay strings (`strokeWidth="3.5"`), exactly as written.
**Change no coordinate, no colour, no path.**

`c-sceau` is the only parameterised one: its final `<text>` element's content
becomes `{initial}` instead of the literal `T`:

```tsx
      <text
        x="50" y="64" textAnchor="middle" fill="#4d2f12"
        fontFamily="Georgia, 'Times New Roman', serif" fontSize="42" fontWeight="700"
      >
        {initial}
      </text>
```

Return `null` from the `default:` branch — an unknown id then falls back to the
initial in `PlayerAvatar`, which is the correct degradation if a future build
drops an avatar somebody had selected.

**Verify**:
- `grep -c "case '" apps/web/src/components/ui/avatar-art.tsx` → `16`.
- `grep -c "<circle\|<path\|<rect\|<ellipse\|<polygon\|<text" apps/web/src/components/ui/avatar-art.tsx`
  → `173` (the exact shape count of Appendix A, verified against the source
  board). If your number differs, you dropped or duplicated a shape — diff
  against the appendix.
- `grep -n "stroke-width\|stroke-linejoin\|font-family" apps/web/src/components/ui/avatar-art.tsx`
  → **no matches** (every hyphenated attribute was converted).
- `pnpm --filter @degommix/web exec tsc --noEmit` → no error in this file.

Commit: `feat(web): avatar registry and artwork for the 16 built-in avatars`.

### Step 5: Teach `PlayerAvatar` to draw

Rewrite `apps/web/src/components/ui/player-avatar.tsx`:

```tsx
import { AvatarArt } from './avatar-art'
import { isKnownAvatarId } from '@/lib/avatars'

interface PlayerAvatarProps {
  username: string
  size?: 32 | 40 | 44 | 56 | 96
  /**
   * Avatar chosen from the profile. `null`/`undefined` — or an id this build
   * does not know — falls back to the pseudo initial, which is what the app
   * has always shown.
   */
  avatarId?: string | null
}

/** Chosen avatar, or the uppercase initial, inside a bronze ring. */
export function PlayerAvatar({ username, size = 40, avatarId }: PlayerAvatarProps) {
  const initial = username.charAt(0).toUpperCase()

  if (isKnownAvatarId(avatarId) && avatarId) {
    return (
      <span className="avatar-ring art" style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 100 100" focusable="false">
          <AvatarArt avatarId={avatarId} initial={initial} />
        </svg>
      </span>
    )
  }

  return (
    <span
      className="avatar-ring"
      style={{ width: size, height: size, fontSize: `${size * 0.024}rem` }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
```

Then append to `apps/web/src/app/globals.css`, immediately after the existing
`.avatar-ring` rule (lines 292–306) — do not modify that rule:

```css
/* Ring holding a drawn avatar instead of an initial: the art fills it edge to
   edge, so the ring clips it and the bronze border stays the only chrome. */
.avatar-ring.art {
  overflow: hidden;
  padding: 0;
  background: var(--surface-2);
  box-sizing: border-box;
}

.avatar-ring.art svg {
  width: 100%;
  height: 100%;
  display: block;
}
```

**Verify**:
- `pnpm typecheck` → exit 0 (every existing call site still compiles: `avatarId`
  is optional).
- `pnpm lint` → exit 0.
- `pnpm --filter @degommix/web test` → exit 0.

Commit: `feat(web): render the chosen avatar in the shared player ring`.

### Step 6: The endpoint

Create `apps/web/src/app/api/avatar/route.ts`, mirroring
`apps/web/src/app/api/username/route.ts` line for line where it applies:

```ts
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { user } from '@degommix/db'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { avatarIdSchema } from '@/lib/avatars'

const bodySchema = z.object({ avatarId: avatarIdSchema })

/** Sets (or clears) the profile avatar. `null` restores the pseudo initial. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_AVATAR' }, { status: 400 })
  }
  await db
    .update(user)
    .set({ avatarId: parsed.data.avatarId, updatedAt: new Date() })
    .where(eq(user.id, session.user.id))

  return NextResponse.json({ ok: true, avatarId: parsed.data.avatarId })
}
```

Match the exact import specifiers used by `api/username/route.ts` — read that
file and copy them (`@degommix/db` vs `@/lib/db` and the `auth` path); do not
guess. There is **no** unique-violation handling here: an avatar id is not
unique across users.

**Verify**:
- `grep -n "avatarIdSchema" apps/web/src/app/api/avatar/route.ts` → present
  (the allowlist is the validation; a bare `z.string()` here is a STOP
  condition).
- `pnpm typecheck` → exit 0.

### Step 7: The picker on `/profil`

Create `apps/web/src/lib/queries/profile.ts`:

```ts
import { eq } from 'drizzle-orm'
import { user } from '@degommix/db'
import { db } from '@/lib/db'

/**
 * Current avatar of a user. Read from the table rather than from the Better
 * Auth session: `avatar_id` is our column, not part of the session contract.
 */
export async function getAvatarId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ avatarId: user.avatarId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.avatarId ?? null
}
```

Create `apps/web/src/components/profile/avatar-picker.tsx` — a client component
modelled on `apps/web/src/components/profile/username-form.tsx` (read it first;
copy its `fetch` + `useToast` + `router.refresh()` shape):

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { useToast } from '@/components/ui/toast'
import { AVATAR_BOARDS, AVATAR_BOARD_LABELS, avatarsOfBoard } from '@/lib/avatars'

interface AvatarPickerProps {
  username: string
  currentAvatarId: string | null
}

/** Grid of the sixteen avatars, grouped by board, plus a « no avatar » option. */
export function AvatarPicker({ username, currentAvatarId }: AvatarPickerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<string | null>(currentAvatarId)
  const [pending, setPending] = useState(false)

  const save = async (avatarId: string | null): Promise<void> => {
    if (pending) return
    const previous = selected
    setSelected(avatarId)
    setPending(true)
    const response = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarId }),
    })
    setPending(false)
    if (!response.ok) {
      setSelected(previous)
      toast('Impossible d’enregistrer l’avatar', 'error')
      return
    }
    toast('Avatar mis à jour')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {AVATAR_BOARDS.map((board) => (
        <div key={board} className="flex flex-col gap-2">
          <p className="sec-label">{AVATAR_BOARD_LABELS[board]}</p>
          <div className="grid grid-cols-4 gap-3">
            {avatarsOfBoard(board).map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                className="avatar-choice"
                aria-pressed={selected === avatar.id}
                aria-label={`${avatar.label} — ${avatar.hint}`}
                disabled={pending}
                onClick={() => {
                  void save(avatar.id)
                }}
              >
                <PlayerAvatar username={username} size={56} avatarId={avatar.id} />
                <span className="avatar-choice-name">{avatar.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="avatar-choice none"
        aria-pressed={selected === null}
        disabled={pending}
        onClick={() => {
          void save(null)
        }}
      >
        <PlayerAvatar username={username} size={56} avatarId={null} />
        <span className="avatar-choice-name">Aucun (initiale)</span>
      </button>
    </div>
  )
}
```

Append its styles to `globals.css`, next to the `.avatar-ring.art` rule:

```css
.avatar-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.2rem;
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.avatar-choice[aria-pressed='true'] {
  border-color: var(--bronze);
  background: var(--bronze-tint);
}

.avatar-choice[disabled] { opacity: 0.5; cursor: not-allowed; }

.avatar-choice-name {
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  color: var(--ink-soft);
}

.avatar-choice.none { flex-direction: row; gap: 0.6rem; justify-content: flex-start; }
```

Then wire it into `apps/web/src/app/(tabs)/profil/page.tsx`: read the current
avatar, show it in the header, and add a new section **between** « Pseudo » and
« Thème »:

```tsx
  const session = await requireSession()
  const { username, email } = session.user
  if (!username) redirect('/onboarding')
  const avatarId = await getAvatarId(session.user.id)
```

```tsx
        <PlayerAvatar username={username} size={56} avatarId={avatarId} />
```

```tsx
      <section className="flex flex-col gap-2">
        <p className="sec-label">Avatar</p>
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Choisis ta tête. Elle s’affiche partout où ton pseudo apparaît.
          </p>
          <AvatarPicker username={username} currentAvatarId={avatarId} />
        </Card>
      </section>
```

Keep every existing string on that page byte-identical.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.

Commit: `feat(web): avatar update endpoint and profile picker`.

### Step 8: Carry `avatarId` through every read surface

Work through the table in "Current state" **one file at a time**, typechecking
after each. In every case the edit is the same shape: add
`avatarId: user.avatarId` to the `select({...})`, thread it through the row
type, and pass it to `PlayerAvatar`.

**8a — queries** (`apps/web/src/lib/queries/`):

- `friends.ts:64-74` (`getPublicUser`) → add `avatarId: user.avatarId`.
- `friends.ts:79-110` (`getFriendsPageData`) → add `senderAvatarId`,
  `receiverAvatarId` and `avatarId` to the three selects, mirroring the existing
  `senderUsername` / `receiverUsername` / `username` naming.
- `home.ts:124` → `winnerAvatarId`; `home.ts:151` → `avatarId` on the
  participant row.
- `stats.ts:100` and `:145-151` → `avatarId` on the leaderboard rows (and
  `?? null` on the unranked branch, which builds rows from a possibly-missing
  member).
- `stats.ts:288-306` (`getGameDetail`) → `avatarId` on the player rows.
- `rivalries.ts:111-115` (`loadUsernames`) → `avatarId`.
- `lobby.ts:34-39` → `avatarId`.
- `invites.ts:22` → `hostAvatarId`.

**8b — Zod payloads** (`apps/web/src/lib/api-payloads.ts`): add the field to
every object whose data reaches a `PlayerAvatar`, always as

```ts
avatarId: z.string().nullable().optional()
```

(and `senderAvatarId` / `receiverAvatarId` / `hostAvatarId` / `winnerAvatarId`
where the surrounding names are prefixed). Objects to extend:
`friendsPayloadSchema` (`received`, `sent`, `friends`),
`leaderboardPayloadSchema` (`rows`, `topDegommeur`, `rivalryPeerSchema`),
`invitesPayloadSchema` (`invites`), `serializedHomeGameSchema` (`participants`
and `winnerAvatarId`).

Add to `apps/web/src/lib/api-payloads.test.ts`, in the existing `describe`
blocks and following their exact style:

```ts
  it('accepts a friends payload without any avatarId — old cached shape', () => {
    const legacy = {
      received: [{ requestId: 'r1', senderId: 'u1', senderUsername: 'Obelix' }],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online' }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.safeParse(legacy).success).toBe(true)
  })

  it('accepts a friends payload carrying avatar ids', () => {
    const fresh = {
      received: [],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online', avatarId: 'b-menhir' }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.parse(fresh).friends[0]?.avatarId).toBe('b-menhir')
  })

  it('accepts an explicit null avatarId — the player chose the initial back', () => {
    const cleared = {
      received: [],
      sent: [],
      friends: [{ id: 'u2', username: 'Asterix', initialPresence: 'online', avatarId: null }],
      myLobbyId: null,
    }
    expect(friendsPayloadSchema.safeParse(cleared).success).toBe(true)
  })
```

Write the equivalent trio for `leaderboardPayloadSchema` and
`invitesPayloadSchema`. **The "old cached shape" test is the important one** —
it is what proves point 4 of "Decisions already made".

**8c — the ws lobby state**: edit **both** sides together.

`apps/ws-server/src/lobby-state.ts` — add to the interface and to the select at
lines 24–34:

```ts
export interface LobbyPlayer {
  userId: string
  username: string
  status: 'invited' | 'joined'
  character: CharacterId | null
  /** Profile avatar, `null` when the player kept their initial. */
  avatarId: string | null
}
```

`apps/web/src/lib/realtime-types.ts:11-18` — mirror it, keeping the existing
comment. On the web side make it **optional** as well
(`avatarId?: string | null`), because a browser can receive a payload from a
ws-server that has not been redeployed yet:

```ts
/** Mirror of the ws-server `LobbyPlayer` shape (apps/ws-server/src/lobby-state.ts). */
export interface LobbyPlayer {
  userId: string
  username: string
  status: 'invited' | 'joined'
  character: CharacterId | null
  /** Optional on this side: an older ws-server build does not send it. */
  avatarId?: string | null
}
```

**8d — the 13 call sites**: pass the value through, e.g.

```tsx
<PlayerAvatar username={player.username} size={32} avatarId={player.avatarId ?? null} />
```

Work down the table in "Current state". `styleguide.tsx` needs no change.

**Verify after each sub-step**: `pnpm typecheck` → exit 0.

**Verify at the end of Step 8**:
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm --filter @degommix/web test` → exit 0.
- `grep -rn "PlayerAvatar" apps/web/src --include=*.tsx | grep -v "avatarId" | grep -v styleguide | grep -v "player-avatar.tsx"`
  → **no matches** (every call site now passes the prop).
- `grep -n "avatarId" apps/ws-server/src/lobby-state.ts apps/web/src/lib/realtime-types.ts`
  → both files match.

Commit: `feat(web): carry avatarId through every read surface`.

### Step 9: Full verification

From the repo root, with the test DB up:

1. `pnpm --filter @degommix/web test` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm lint` → exit 0.
4. `pnpm exec turbo run test --concurrency=1` → exit 0.
5. `pnpm test:e2e` → exit 0, **with `e2e/` unmodified**. The happy path creates
   fresh accounts, which have `avatar_id = NULL`, so it exercises the fallback
   path end to end.
6. `git status --porcelain` → only the in-scope files.

Paste the actual tail of each command's output.

### Step 10: Visual verification (required)

Isolated stack, own database and ports:

```bash
docker run -d --name degommix-plan013 \
  -e POSTGRES_USER=degommix -e POSTGRES_PASSWORD=degommix -e POSTGRES_DB=degommix_test \
  -e LANG=en_US.utf8 -e POSTGRES_INITDB_ARGS="--locale=en_US.UTF-8" \
  -p 54404:5432 postgres:16

export DATABASE_URL=postgres://degommix:degommix@localhost:54404/degommix_test
export BETTER_AUTH_SECRET=plan013-secret-0123456789-abcdefghij
export BETTER_AUTH_URL=http://localhost:3013
export NEXT_PUBLIC_WS_URL=http://localhost:4014
export WEB_ORIGIN=http://localhost:3013
export PORT=4014

pnpm --filter @degommix/db db:migrate
pnpm --filter @degommix/ws-server exec tsx src/index.ts &     # ws-server on :4014
pnpm --filter @degommix/web exec next dev -p 3013             # web on :3013
```

(Variable names and meanings from `.env.example`; the ws-server reads no `.env`
file.)

Two browser profiles at 390 × 844 (`e2e/playwright.config.ts`), accounts A and B
already friends. Then:

1. A opens `/profil`.
   - **Expected**: an « Avatar » section with three labelled groups
     (Portraits 6, Emblèmes 6, Sceaux gravés 4) and an « Aucun (initiale) »
     option. All sixteen render at 56 px, none blank, none clipped square.
   - **Expected**: « Le Sceau » shows **A**'s own initial engraved in it.
2. A picks « Le Menhir ».
   - **Expected**: a toast, the header avatar updates, the choice is outlined in
     bronze.
3. A reloads `/profil`.
   - **Expected**: « Le Menhir » is still the selected one.
4. B opens `/amis`.
   - **Expected**: A's row shows the menhir at 32 px, **still identifiable at
     that size**. This is the size test that decides whether the feature works
     at all — report it explicitly, per group (the portraits are the ones at
     risk).
5. B opens `/classement`.
   - **Expected**: A's ranking row shows the menhir.
6. A creates a lobby and invites B.
   - **Expected**: on B's phone the invite banner shows A's avatar; in the lobby,
     A's seat shows it too (this is the ws path).
7. A goes back to `/profil` and picks « Aucun (initiale) ».
   - **Expected**: everything falls back to « A » in a bronze ring, everywhere,
     with no blank frame in between.
8. Dark theme: repeat checks 1 and 4.
   - **Expected**: every avatar still reads against the dark parchment; the
     bronze ring is still visible.
9. Manual tamper check (validation is the point of the allowlist):
   ```bash
   curl -i -X POST http://localhost:3013/api/avatar \
     -H 'Content-Type: application/json' \
     -H "Cookie: <copy A's session cookie from DevTools>" \
     -d '{"avatarId":"<script>alert(1)</script>"}'
   ```
   - **Expected**: `HTTP/1.1 400` with `{"error":"INVALID_AVATAR"}`, and A's
     avatar unchanged.
   - Then the same request without the cookie → `401 UNAUTHORIZED`.

Screenshots to attach: `plan013-picker-light.png`, `plan013-picker-dark.png`,
`plan013-friends-40px.png` (check 4 — the size test), `plan013-lobby.png`,
`plan013-fallback-initial.png`.

Tear down: `docker rm -f degommix-plan013`.

## Test plan

Pure TypeScript, `vitest`, node environment, co-located. Structural pattern:
`apps/web/src/lib/api-payloads.test.ts`.

| File | Cases |
|---|---|
| `apps/web/src/lib/avatars.test.ts` (new) | 16 avatars in the validated order; 6/6/4 board split; no duplicate id; every board labelled; typographic apostrophe only; `avatarIdSchema` accepts every id, accepts `null`, rejects an unknown id, rejects markup / a path / a URL / an empty string, rejects a non-string; `isKnownAvatarId` truth table |
| `apps/web/src/lib/api-payloads.test.ts` (extended) | for `friends`, `leaderboard` and `invites`: an **old cached payload with no avatar field parses**, a payload carrying an id parses and preserves it, an explicit `null` parses |

There is no route-handler test because this repo has none (the username endpoint
has none either) and adding an HTTP test harness is out of scope. The endpoint's
only logic is the session check and `avatarIdSchema`, and the schema is fully
tested above; the session check and the tamper case are covered by Step 10
check 9.

No component test is added (no `@testing-library/react` in this repo).

Verification: `pnpm --filter @degommix/web test` → exit 0, 13 new tests in
`avatars.test.ts` plus 9 new payload tests.

## Done criteria

Machine-checkable unless marked MANUAL. ALL must hold:

- [ ] `pnpm --filter @degommix/web test src/lib/avatars.test.ts` exits 0 (11 tests)
- [ ] `pnpm --filter @degommix/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 with the test DB up
- [ ] `pnpm test:e2e` exits 0 **with `e2e/` unmodified**
- [ ] `ls packages/db/drizzle/0003_*.sql` exists and contains exactly one `ALTER TABLE "user" ADD COLUMN "avatar_id" text;`
- [ ] `grep -c "case '" apps/web/src/components/ui/avatar-art.tsx` returns `16`
- [ ] `grep -o "<circle\|<path\|<rect\|<ellipse\|<polygon\|<text" apps/web/src/components/ui/avatar-art.tsx | wc -l` returns `173`
- [ ] `grep -n "stroke-width\|font-family\|stroke-linejoin" apps/web/src/components/ui/avatar-art.tsx` returns no matches
- [ ] `grep -rn "PlayerAvatar" apps/web/src --include=*.tsx | grep -v avatarId | grep -v styleguide | grep -v player-avatar.tsx` returns no matches
- [ ] `grep -n "avatarIdSchema" apps/web/src/app/api/avatar/route.ts` matches (no bare `z.string()`)
- [ ] `grep -rn "dangerouslySetInnerHTML" apps/web/src` returns no matches
- [ ] `grep -n "avatarId" apps/ws-server/src/lobby-state.ts apps/web/src/lib/realtime-types.ts` matches in both
- [ ] `grep -rn "user.image\|image:" packages/db/src/schema/auth.ts` shows the `image` column untouched
- [ ] `git diff --name-only e772284..HEAD` lists only files from the "In scope" list
- [ ] `git status --porcelain` shows no modification outside the in-scope list
- [ ] `plans/README.md` row for 013 added/updated
- [ ] **MANUAL**: Step 10 performed, its 9 checks reported one by one, with the five screenshots attached. Check 4 (**legibility at 32–40 px, per board**) and check 9 (**400 on a bogus id, 401 without a session**) must be reported explicitly.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts — the
  codebase drifted since commit `e772284`.
- `grep -rn "PlayerAvatar" apps/web/src --include=*.tsx | wc -l` in Step 1
  returns something other than `15`, **or** you find a second component that
  renders a bronze ring with an initial. The whole effort estimate rests on
  "one component, fourteen call sites"; a fragmented avatar layer is a different
  plan.
- `pnpm --filter @degommix/db db:generate` produces a migration containing
  anything beyond the single `ADD COLUMN` — a drop, a rename, a constraint, a
  change to another table. That means the checked-in schema had already drifted
  from the migrations, which must be resolved on its own before this feature.
- The Better Auth session turns out to already expose `avatarId` (i.e.
  `session.user.avatarId` typechecks). Do not silently switch to it: better-auth
  populating a custom column is a configuration fact worth confirming, and the
  explicit query is safe either way. Report and keep the query.
- Transcribing the artwork requires `dangerouslySetInnerHTML`, an SVG loader
  (`@svgr/webpack`), or a new dependency. It does not — the appendix is plain
  JSX-able SVG. Report rather than adding build tooling.
- Adding `avatarId` to a payload requires making it **required** to satisfy a
  type. It must stay `.nullable().optional()`; a required field breaks old
  cached PWA payloads.
- Any step's verification fails twice after a reasonable fix attempt.
- The assumption "an avatar id never reaches a URL, a file path or raw HTML"
  turns out to be false in your implementation — that is precisely what the
  allowlist protects, and it means the rendering approach changed.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: (1) that the migration is a single
  nullable `ADD COLUMN` with no backfill; (2) that the endpoint validates
  against `avatarIdSchema` and nothing else; (3) that every payload field is
  optional *and* nullable; (4) that `PlayerAvatar` still falls back to the
  initial for an unknown id — that is the escape hatch if an avatar is ever
  retired; (5) that `user.image` was left alone.
- **Retiring or adding an avatar** is: edit `AVATARS`, add or remove the `case`
  in `avatar-art.tsx`, update the count assertions in `avatars.test.ts`. Users
  holding a retired id keep a valid row and silently render their initial again
  — no migration needed. That is by design.
- **The 32–40 px legibility question is unresolved by design.** The board's own
  note was that the portraits become colour blobs at small size while the
  emblems stay readable, and the owner chose to ship all three boards anyway so
  players decide. If the next playtest says the portraits are unreadable in the
  friends list, the fix is *not* to delete them — it is to consider a larger ring
  in list contexts, or a per-board size bump. Do not silently drop a board.
- **`c-sceau` is the only parameterised avatar.** If a pseudo ever starts with a
  non-Latin character, the seal will render it as-is at font-size 42 in a serif
  face; that is acceptable, but it is the one place where a pseudo's characters
  reach an SVG `<text>`. React escapes it, so there is no injection — do not
  "optimise" that into a raw string.
- **Next likely step, deliberately not in this plan**: showing the avatar on the
  live game screen and the summary. Those surfaces use `CharacterBadge` (the
  per-game character portrait) and mixing the two identities on the same card
  needs a design decision first.
- **Interaction with plans 010–012**: none. Those touch the live journal, the
  roster cards and the summary; this touches profile identity and the read
  surfaces. The only shared file is `globals.css`, where each plan appends its
  own block — expect a trivial merge conflict at the end of the file if several
  land at once, and keep all blocks.

## Appendix A — the sixteen avatars, raw SVG (source of truth)

Each `<symbol>` uses `viewBox="0 0 100 100"`. Transcribe the **children** of each
symbol into the matching `case` of `avatar-art.tsx`, applying only the attribute
renames in the Step 4 table. Change no coordinate and no colour.

```svg
<symbol id="a-moustachu" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M12 100c3-17 17-27 38-27s35 10 38 27Z" fill="#b23a2e" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="43" y="60" width="14" height="16" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="52" r="20" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="42" cy="51" r="2.8" fill="#251a10"/>
  <circle cx="58" cy="51" r="2.8" fill="#251a10"/>
  <path d="M50 61c-6 0-14 3-18 10 9 3 16-1 18-5 2 4 9 8 18 5-4-7-12-10-18-10Z" fill="#251a10"/>
  <path d="M27 44a23 23 0 0 1 46 0Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M22 44h56" stroke="#251a10" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M29 33 12 17c-2 6-1 12 2 17-4 1-6 3-7 7l22 6Z" fill="#fbf6e9" stroke="#251a10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M71 33 88 17c2 6 1 12-2 17 4 1 6 3 7 7l-22 6Z" fill="#fbf6e9" stroke="#251a10" stroke-width="3" stroke-linejoin="round"/>
</symbol>

<symbol id="a-guerriere" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M12 100c3-17 17-27 38-27s35 10 38 27Z" fill="#3f6b3c" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="43" y="60" width="14" height="16" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="50" r="24" fill="#8c5a2b" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="43" cy="51" r="2.8" fill="#251a10"/>
  <circle cx="57" cy="51" r="2.8" fill="#251a10"/>
  <path d="M45 62c3 2.5 7 2.5 10 0" stroke="#251a10" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M31 43c3-11 10-17 19-17s16 6 19 17c-5-6-11-9-19-9s-14 3-19 9Z" fill="#8c5a2b" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M28 64c-5 10-6 20-4 30" stroke="#8c5a2b" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M28 64c-5 10-6 20-4 30" stroke="#251a10" stroke-width="14" stroke-linecap="butt" fill="none" stroke-dasharray="1.8 8"/>
  <path d="M72 64c5 10 6 20 4 30" stroke="#8c5a2b" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M72 64c5 10 6 20 4 30" stroke="#251a10" stroke-width="14" stroke-linecap="butt" fill="none" stroke-dasharray="1.8 8"/>
  <path d="M36 79a15 11 0 0 0 28 0" stroke="#b9861f" stroke-width="5" fill="none"/>
  <circle cx="36" cy="79" r="4" fill="#b9861f" stroke="#251a10" stroke-width="2"/>
  <circle cx="64" cy="79" r="4" fill="#b9861f" stroke="#251a10" stroke-width="2"/>
</symbol>

<symbol id="a-druide" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M8 100c2-17 13-28 28-32h28c15 4 26 15 28 32Z" fill="#3f6b3c" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="50" cy="48" r="19" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <path d="M31 50c0 11 2 21 6 29 3 7 8 11 13 11s10-4 13-11c4-8 6-18 6-29-4 8-11 12-19 12s-15-4-19-12Z" fill="#fbf6e9" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M39 55c4 3 18 3 22 0" stroke="#251a10" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M38 45c2.5-3.5 7-3.5 9.5 0M52.5 45c2.5-3.5 7-3.5 9.5 0" stroke="#251a10" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M28 47a22 22 0 0 1 44 0c3-20-9-32-22-32S25 27 28 47Z" fill="#3f6b3c" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
</symbol>

<symbol id="a-centurion" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M12 100c3-17 17-27 38-27s35 10 38 27Z" fill="#b23a2e" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="43" y="62" width="14" height="14" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="43" cy="52" r="2.8" fill="#251a10"/>
  <circle cx="57" cy="52" r="2.8" fill="#251a10"/>
  <path d="M45 63h10" stroke="#251a10" stroke-width="3" stroke-linecap="round"/>
  <path d="M31 44v18c0 5 2 8 5 8 2 0 3-2 3-5V44Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M69 44v18c0 5-2 8-5 8-2 0-3-2-3-5V44Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M28 43a22 22 0 0 1 44 0Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M23 43h54" stroke="#251a10" stroke-width="4" stroke-linecap="round"/>
  <path d="M50 2c-13 0-22 10-25 25h50C72 12 63 2 50 2Z" fill="#b23a2e" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M41 8v17M50 4v21M59 8v17" stroke="#251a10" stroke-width="2" opacity=".45"/>
</symbol>

<symbol id="a-patricienne" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M12 100c3-17 17-27 38-27s35 10 38 27Z" fill="#2c5b82" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M46 76c-5 7-6 16-5 24" stroke="#fbf6e9" stroke-width="3.5" fill="none" opacity=".75"/>
  <rect x="43" y="62" width="14" height="14" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="25" r="9" fill="#4a3320" stroke="#251a10" stroke-width="3"/>
  <circle cx="50" cy="50" r="23" fill="#4a3320" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="43" cy="52" r="2.8" fill="#251a10"/>
  <circle cx="57" cy="52" r="2.8" fill="#251a10"/>
  <path d="M46 63c2.5 2 5.5 2 8 0" stroke="#251a10" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M33 42c4-8 10-12 17-12s13 4 17 12c-4-4-10-6-17-6s-13 2-17 6Z" fill="#4a3320" stroke="#251a10" stroke-width="3"/>
  <g fill="#3f6b3c" stroke="#251a10" stroke-width="2">
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-72 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-56 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-40 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-24 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(24 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(40 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(56 50 50)"/>
    <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(72 50 50)"/>
  </g>
  <circle cx="50" cy="20" r="5" fill="#b9861f" stroke="#251a10" stroke-width="2.5"/>
</symbol>

<symbol id="a-legionnaire" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#f1d9ab"/>
  <path d="M12 100c3-17 17-27 38-27s35 10 38 27Z" fill="#2c5b82" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="43" y="62" width="14" height="14" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="50" cy="54" r="19" fill="#e8bd92" stroke="#251a10" stroke-width="3.5"/>
  <circle cx="43" cy="53" r="2.8" fill="#251a10"/>
  <circle cx="57" cy="53" r="2.8" fill="#251a10"/>
  <path d="M45 64h10" stroke="#251a10" stroke-width="3" stroke-linecap="round"/>
  <path d="M32 48v15c0 5 2 8 5 8 2 0 3-2 3-5V48Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M68 48v15c0 5-2 8-5 8-2 0-3-2-3-5V48Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M29 47a21 21 0 0 1 42 0Z" fill="#b9861f" stroke="#251a10" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M24 47h52" stroke="#251a10" stroke-width="4" stroke-linecap="round"/>
  <path d="M46 47h8v13c0 3-2 4-4 4s-4-1-4-4Z" fill="#b9861f" stroke="#251a10" stroke-width="3" stroke-linejoin="round"/>
</symbol>

<symbol id="b-casque-aile" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <g fill="#b23a2e">
    <path d="M50 14c-15 0-25 12-25 28v10h50V42c0-16-10-28-25-28Z"/>
    <rect x="19" y="50" width="62" height="10" rx="5"/>
    <path d="M45 59h10v18c0 4-2 6-5 6s-5-2-5-6Z"/>
    <path d="M26 40 7 31c-2 5-2 10 0 13-3 2-5 5-5 9l24 3Z"/>
    <path d="M74 40 93 31c2 5 2 10 0 13 3 2 5 5 5 9l-24 3Z"/>
  </g>
  <path d="M50 20v30" stroke="#fbf6e9" stroke-width="3.5"/>
  <path d="M38 34a12 12 0 0 1 24 0" fill="none" stroke="#fbf6e9" stroke-width="3" opacity=".5"/>
</symbol>

<symbol id="b-menhir" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <path d="M41 9 61 14C71 17 76 24 74 34L68 72C66 82 60 87 50 87C39 87 33 82 32 72L27 30C26 19 31 10 41 9Z" fill="#3f6b3c"/>
  <g stroke="#fbf6e9" stroke-width="3.2" stroke-linecap="round" opacity=".45" fill="none">
    <path d="M37 26l8 11M58 40l8 8M36 54l10 8M54 68l8 7"/>
  </g>
  <path d="M18 92h64" stroke="#3f6b3c" stroke-width="6" stroke-linecap="round"/>
</symbol>

<symbol id="b-sanglier" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <g fill="#8c5a2b">
    <path d="M22 54C22 42 32 34 46 34C56 34 64 38 69 44L82 47C90 49 91 61 83 64L70 67C65 73 56 77 46 77C32 77 22 68 22 58Z"/>
    <path d="M34 36 37 29 41 34 45 27 49 33 54 28 57 35Z"/>
    <polygon points="52,32 63,40 48,43"/>
    <path d="M73 60C70 52 72 44 78 41C75 47 76 54 78 59Z"/>
    <rect x="30" y="73" width="10" height="14" rx="5"/>
    <rect x="43" y="74" width="10" height="14" rx="5"/>
    <rect x="56" y="71" width="10" height="15" rx="5"/>
    <path d="M21 50c-8-3-13 3-10 9 3-5 6-7 10-6Z"/>
  </g>
  <circle cx="67" cy="51" r="3" fill="#fbf6e9"/>
  <circle cx="85" cy="56" r="2.4" fill="#fbf6e9"/>
</symbol>

<symbol id="b-cimier" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <g fill="#2c5b82">
    <path d="M50 5c-13 0-22 10-25 25h50C72 15 63 5 50 5Z"/>
    <path d="M50 26c-15 0-26 11-26 25v5h52v-5c0-14-11-25-26-25Z"/>
    <rect x="20" y="55" width="60" height="9" rx="4"/>
    <path d="M23 63h20l-3 17c-1 6-6 9-10 7-4-2-6-7-6-13Z"/>
    <path d="M77 63H57l3 17c1 6 6 9 10 7 4-2 6-7 6-13Z"/>
    <path d="M45 63h10v20c0 4-2 6-5 6s-5-2-5-6Z"/>
  </g>
  <g stroke="#fbf6e9" fill="none">
    <path d="M50 8v22" stroke-width="3.5"/>
    <path d="M40 13v17M60 13v17" stroke-width="2.5" opacity=".6"/>
    <path d="M50 31v24" stroke-width="3"/>
  </g>
</symbol>

<symbol id="b-aigle" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <g fill="#b9861f">
    <path d="M42 44 12 31l7 14-7 5 30 12Z"/>
    <path d="M58 44 88 31l-7 14 7 5-30 12Z"/>
    <path d="M50 30c-5 0-9 4-9 9l2 22c0 4 3 7 7 7s7-3 7-7l2-22c0-5-4-9-9-9Z"/>
    <circle cx="50" cy="26" r="8"/>
    <polygon points="57,23 69,27 57,31"/>
    <rect x="46" y="66" width="8" height="28" rx="2"/>
    <rect x="32" y="70" width="36" height="6" rx="3"/>
  </g>
  <circle cx="47" cy="24" r="2.2" fill="#fbf6e9"/>
</symbol>

<symbol id="b-bouclier" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#fbf6e9"/>
  <rect x="22" y="13" width="56" height="74" rx="18" fill="#b23a2e"/>
  <rect x="29" y="20" width="42" height="60" rx="13" fill="none" stroke="#fbf6e9" stroke-width="3" opacity=".65"/>
  <g fill="#fbf6e9">
    <polygon points="50,27 44,39 56,39"/>
    <polygon points="50,73 44,61 56,61"/>
    <polygon points="41,50 28,42 28,58"/>
    <polygon points="59,50 72,42 72,58"/>
    <circle cx="50" cy="50" r="8.5"/>
  </g>
</symbol>

<symbol id="c-torque" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#8c5a2b"/>
  <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5"/>
  <circle cx="50" cy="50" r="43" fill="#9c6a33"/>
  <circle cx="50" cy="50" r="46.5" fill="none" stroke="#6f4620" stroke-width="3" stroke-dasharray="2 5.3" stroke-linecap="round"/>
  <path d="M36 76A26 26 0 1 1 64 76" fill="none" stroke="#4d2f12" stroke-width="9" stroke-linecap="butt"/>
  <circle cx="36" cy="76" r="7.5" fill="#4d2f12"/>
  <circle cx="64" cy="76" r="7.5" fill="#4d2f12"/>
</symbol>

<symbol id="c-lyre" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#8c5a2b"/>
  <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5"/>
  <circle cx="50" cy="50" r="43" fill="#9c6a33"/>
  <circle cx="50" cy="50" r="46.5" fill="none" stroke="#6f4620" stroke-width="3" stroke-dasharray="2 5.3" stroke-linecap="round"/>
  <g stroke="#4d2f12" fill="none" stroke-linecap="round">
    <path d="M42 40h16" stroke-width="2.5"/>
    <path d="M42 72c-11-6-16-20-10-32" stroke-width="7"/>
    <path d="M58 72c11-6 16-20 10-32" stroke-width="7"/>
    <path d="M30 32h40" stroke-width="7"/>
    <path d="M40 74h20" stroke-width="7"/>
    <g stroke-width="2.6" opacity=".85">
      <path d="M43 36v36M50 34v38M57 36v36"/>
    </g>
  </g>
</symbol>

<symbol id="c-enseigne" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#8c5a2b"/>
  <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5"/>
  <circle cx="50" cy="50" r="43" fill="#9c6a33"/>
  <circle cx="50" cy="50" r="46.5" fill="none" stroke="#6f4620" stroke-width="3" stroke-dasharray="2 5.3" stroke-linecap="round"/>
  <g fill="#4d2f12">
    <rect x="46.5" y="16" width="7" height="70" rx="2"/>
    <rect x="26" y="32" width="48" height="7" rx="3.5"/>
    <rect x="28" y="43" width="44" height="28" rx="2"/>
    <rect x="31" y="73" width="5" height="9" rx="2.5"/>
    <rect x="41" y="73" width="5" height="9" rx="2.5"/>
    <rect x="51" y="73" width="5" height="9" rx="2.5"/>
    <rect x="61" y="73" width="5" height="9" rx="2.5"/>
    <circle cx="50" cy="19" r="9"/>
  </g>
  <circle cx="50" cy="19" r="4" fill="#9c6a33"/>
  <g stroke="#9c6a33" stroke-width="3" opacity=".8">
    <path d="M34 51h32M34 61h32"/>
  </g>
</symbol>

<symbol id="c-sceau" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#8c5a2b"/>
  <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5"/>
  <circle cx="50" cy="50" r="43" fill="#9c6a33"/>
  <circle cx="50" cy="50" r="46.5" fill="none" stroke="#6f4620" stroke-width="3" stroke-dasharray="2 5.3" stroke-linecap="round"/>
  <g fill="#4d2f12">
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-58 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-89 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-120 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-151 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(151 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(120 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(89 50 50)"/>
    <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(58 50 50)"/>
  </g>
  <text x="50" y="64" text-anchor="middle" fill="#4d2f12" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700">T</text>
</symbol>
```
