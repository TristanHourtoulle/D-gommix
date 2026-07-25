# Plan 015: Speak Gaulish — rename eleven UI labels to the owner-validated lexicon

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add (or update) the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. Note: at the time of writing, the status table in
> `plans/README.md` on `main` only lists 001–009 — rows for 010–014 are landing
> through separate PRs. **Append** your row rather than expecting it to exist.
>
> **This plan is a pure copy pass.** No logic, no data shape, no route, no CSS
> changes. Every edit is a French user-facing string. If you find yourself
> writing a condition, a hook, or a style rule, you have left the plan.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 92214ed..HEAD -- \
>   apps/web/src/components/tab-bar.tsx \
>   apps/web/src/app/\(tabs\)/amis/page.tsx \
>   apps/web/src/app/\(tabs\)/profil/page.tsx \
>   apps/web/src/components/friends/friends-screen.tsx \
>   apps/web/src/components/lobby/play-screen.tsx \
>   apps/web/src/components/stats/leaderboard-screen.tsx \
>   apps/web/src/components/home/home-screen.tsx \
>   apps/web/src/components/lobby/lobby-screen.tsx \
>   apps/web/src/components/live/summary.tsx \
>   apps/web/src/components/stats/top-degommeur-tile.tsx \
>   apps/web/src/components/stats/character-winrate-bars.tsx \
>   apps/web/src/components/rematch-button.tsx \
>   apps/web/src/app/partie/\[gameId\]/layout.tsx \
>   e2e/happy-path.spec.ts
> ```
>
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED (one e2e spec assertion pair must move in lockstep)
- **Depends on**: none — but see "Base" below
- **Category**: direction
- **Planned at**: commit `92214ed` (`origin/integration/wave-3`), 2026-07-25
- **Base**: this plan was written against **`integration/wave-3`** (`92214ed`),
  not `main` (`5358160`). Wave 3 is what put the endgame sequence into
  `summary.tsx` and it is the tree every excerpt below was read from.
  `rematch-button.tsx` has existed since wave 1 and is byte-identical on both.
  If you are on `main` and `apps/web/src/components/live/summary.tsx` is ~120
  lines instead of ~280, you are on the wrong base — **STOP**.

## Why this matters

Dégommix is an Astérix game whose interface talks like a generic SaaS: Accueil,
Amis, Jouer, Classement, Lobby, Résumé de partie, Rejouer. The board, the
characters, the dégommages and the journal all speak Gaulish; the chrome around
them does not, and that seam is the single loudest "this is an app" signal in a
product whose whole pitch is "the table, continued on your phone".

The owner reviewed a lexicon proposal and validated **exactly eleven renamed
terms**, plus the echoes each one drags with it (a screen cannot be called
« Tribu » in the tab bar and « Amis » in its own title). The words were chosen
to hold together as one register — village / tribu / camp / arène / banquet /
lauriers — so they land as one voice rather than as scattered jokes.

Everything else in the interface stays literal on purpose. Action verbs the
player needs to understand instantly under table pressure (Confirmer, Fin de
partie, Village atteint, Annuler la dernière action, Créer la partie, Inviter,
Rejoindre, Lancer la partie) and every data label keep their plain wording. The
owner explicitly marked those « à garder » — see "Out of scope".

## The owner-validated lexicon

Eleven new terms. This is the whole set; nothing may be added to it.

| # | Old | New | Where |
|---|-----|-----|-------|
| 1 | Accueil | **Village** | tab bar |
| 2 | Amis | **Tribu** | tab bar + /amis title |
| 3 | Jouer | **Arène** | tab bar + /jouer title |
| 4 | Classement | **Lauriers** | tab bar + /classement title |
| 5 | Salut {pseudo} | **Salve, {pseudo}** | Accueil header |
| 6 | Nouvelle partie | **Aux armes !** | Accueil CTA |
| 7 | Lobby | **Le camp** | lobby screen title + skeleton |
| 8 | Quitter le lobby | **Lever le camp** | lobby screen leave button |
| 9 | Résumé de partie | **Le banquet** | end-of-game summary title |
| 10 | Plus grand dégommeur | **Fléau des Gaules** | leaderboard spotlight |
| 11 | Rejouer | **Revanche !** | rematch button |

Plus two mandated echoes (they are not new words, they are the same words
following their family):

- « Voir le classement » → « **Voir les lauriers** » (follows #4)
- « Winrate par personnage » → « **Victoires par personnage** » (French register;
  the `Winrate` **stat-tile** label on profiles stays — see "Out of scope")

And the subtitle rewrites the renamed titles require:

- /amis: « Ton cercle de dégommeurs » → « **Ceux qui vident les gourdes avec toi** »
- /jouer: « Créer ou rejoindre une partie » → « **Ouvre l'arène ou rejoins la mêlée** »
- /classement: « Le cercle d'amis au grand complet » → « **Toute la tribu, du premier au dernier** »
- « Tes amis » → « **Ta tribu** », EmptyState title « Aucun ami pour l'instant » → « **Tribu déserte** »

## Current state

Every excerpt below was read from `origin/integration/wave-3` (`92214ed`).
Line numbers are from that tree.

### 1. Tab bar — `apps/web/src/components/tab-bar.tsx:15-20`

```tsx
const TABS: Tab[] = [
  { href: '/', label: 'Accueil', icon: 'home', aliases: [] },
  { href: '/amis', label: 'Amis', icon: 'users', aliases: [] },
  { href: '/jouer', label: 'Jouer', icon: 'play', aliases: ['/lobby'] },
  { href: '/classement', label: 'Classement', icon: 'trophy', aliases: ['/parties'] },
]
```

**Uppercase rendering is pure CSS — verified.** `apps/web/src/app/globals.css:632-637`:

```css
.tab-label {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

So the source strings stay title-case (`'Village'`, not `'VILLAGE'`) and the bar
renders VILLAGE / TRIBU / ARÈNE / LAURIERS. **Do not touch `globals.css`.**

**The e2e suite asserts no tab label — verified.** The only tab-bar reference in
`e2e/happy-path.spec.ts` is a class locator, lines 84-85:

```ts
await expect(p1.locator('.tabbar')).toHaveCount(0)
await expect(p2.locator('.tabbar')).toHaveCount(0)
```

Every tab navigation in the spec is by URL, never by clicking a label:
`p1.goto('/amis')` (:35), `p2.goto('/amis')` (:40), `p1.goto('/jouer')` (:58),
`p1.goto('/classement')` (:134), `p1.goto('/')` (:152). Renaming the four labels
therefore cannot break the spec. This was checked with:
`grep -n "Accueil\|'Amis'\|'Jouer'\|'Classement'\|tabbar\|tab-label" e2e/*.ts` → only
the two `.tabbar` lines above plus one prose comment (`happy-path.spec.ts:151`,
`// Accueil with history, light + dark.`).

### 2. Screen titles

- `apps/web/src/app/(tabs)/amis/page.tsx:12`
  ```tsx
  <SectionTitle sub="Ton cercle de dégommeurs">Amis</SectionTitle>
  ```
  **Note**: the /amis title lives in the *page*, not in `friends-screen.tsx`.
- `apps/web/src/components/lobby/play-screen.tsx:147`
  ```tsx
  <SectionTitle sub="Créer ou rejoindre une partie">Jouer</SectionTitle>
  ```
- `apps/web/src/components/stats/leaderboard-screen.tsx:29` **and** `:44` — the
  same line appears **twice** (empty-circle branch and normal branch):
  ```tsx
  <SectionTitle sub="Le cercle d'amis au grand complet">Classement</SectionTitle>
  ```
- `apps/web/src/components/friends/friends-screen.tsx:197-202`
  ```tsx
        <p className="sec-label">Tes amis</p>
        {friends.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aucun ami pour l'instant"
            description="Cherche un pseudo ci-dessus pour envoyer ta première demande."
          />
  ```
- `apps/web/src/app/(tabs)/profil/page.tsx:20-27` — back link to `/`, labelled
  with the tab's name. It must follow the tab rename or it points at « Accueil »
  while the tab says VILLAGE:
  ```tsx
      <Link
        href="/"
        className="sec-label flex items-center gap-1 no-underline"
        style={{ color: 'var(--ink-faint)' }}
      >
        <Icon name="chevron-right" size={12} className="rotate-180" />
        Accueil
      </Link>
  ```

### 3-4. Accueil — `apps/web/src/components/home/home-screen.tsx:55-58` and `:83-87`

```tsx
            <h1 className="s-title m-0" style={{ fontSize: '0.95rem' }}>
              Salut {username}
            </h1>
```

```tsx
      <Link href="/jouer" className="cta no-underline">
        <Icon name="play" size={18} />
        Nouvelle partie
      </Link>
```

### 5. Lobby — `apps/web/src/components/lobby/lobby-screen.tsx`

Three occurrences, all quoted here.

`:146` (skeleton branch, `!lobby`):
```tsx
        <SectionTitle sub="Connexion au lobby…">Lobby</SectionTitle>
```

`:159` (loaded branch):
```tsx
        <SectionTitle sub="Partage le code ou invite tes amis">Lobby</SectionTitle>
```

`:215-217`:
```tsx
      <Button variant="ghost" onClick={() => void handleLeave()} disabled={busy}>
        Quitter le lobby
      </Button>
```

There is **no `aria-label` in `lobby-screen.tsx`** — verified with
`grep -n "aria-label" apps/web/src/components/lobby/lobby-screen.tsx` → no output.
The button is queried by its text content only.

One prose comment quotes the button label as a UI string —
`apps/web/src/components/friends/friends-screen.tsx:136-137`:
```tsx
      // Land in the lobby either way: the user owns a real lobby now, and
      // « Quitter le lobby » is the way back out.
```

**The e2e suite never clicks « Quitter le lobby » — verified.**
`grep -n "Quitter" e2e/*.ts` → no output. The spec leaves the lobby by starting
the game (`'Lancer la partie'`, :81) and never by leaving it.

### 6. Summary title — `apps/web/src/components/live/summary.tsx:119`

```tsx
      <h1 className="s-title relative">Résumé de partie</h1>
```

**E2E ASSERTED, twice** — `e2e/happy-path.spec.ts:126` and `:130`:

```ts
    await expect(p2.getByText('Résumé de partie')).toBeVisible()
    await expect(p2.getByText('Victoire')).toBeVisible()
    await expect(p2.getByTestId(`summary-row-${J2.username}`)).toContainText('vainqueur')
    await expect(p2.getByTestId(`summary-row-${J1.username}`)).toContainText('1')
    await expect(p1.getByText('Résumé de partie')).toBeVisible()
```

### 7. Leaderboard spotlight — `apps/web/src/components/stats/top-degommeur-tile.tsx:10` and `:14`

```tsx
/** Highlighted "Plus grand dégommeur" spotlight card. */
export function TopDegommeurTile({ top }: TopDegommeurTileProps) {
  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Plus grand dégommeur</p>
```

### 8. Rematch button — `apps/web/src/components/rematch-button.tsx`

`:52` is the label; `:13` and `:19` are prose comments quoting it:

```tsx
  /** A finished game the viewer played in (SPECS.md §« Rejouer »). */   // :13
```
```tsx
 * « Rejouer » — asks the server for a fresh lobby at the same format with every  // :19
```
```tsx
      Rejouer                                                            // :52
```

A third prose reference lives at `apps/web/src/app/partie/[gameId]/layout.tsx:11`:
```tsx
 * come from the root layout, which is what keeps them alive when « Rejouer »
```

`RematchButton` is a single component with **three** render sites, all of which
inherit the new label with no edit of their own — verified with
`grep -rn "RematchButton" apps/web/src`:

- `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx:121` (`variant="primary"`)
- `apps/web/src/components/home/home-screen.tsx:104` (`variant="ghost"`)
- `apps/web/src/components/live/summary.tsx:255` and `:269`

**The e2e suite never asserts « Rejouer » — verified.**
`grep -n "Rejouer" e2e/*.ts` → no output.

### 9. « Voir le classement » — `apps/web/src/components/live/summary.tsx:257-267`

Two occurrences (loser branch and winner branch), `:259` and `:266`:

```tsx
              <Button variant="ghost" onClick={() => router.push('/classement')}>
                Voir le classement
              </Button>
```
```tsx
              <Button onClick={() => router.push('/classement')}>Voir le classement</Button>
```

`grep -rn "Voir le classement" apps/web/src e2e` → only those two lines. Not
asserted in e2e.

### 10. Winrate bars — `apps/web/src/components/stats/character-winrate-bars.tsx:14`

```tsx
      <p className="sec-label">Winrate par personnage</p>
```

The stat-tile label that **must survive** —
`apps/web/src/app/(tabs)/amis/[userId]/page.tsx:72`:

```tsx
        <StatTile icon="flag" label="Winrate" value={winrateLabel} />
```

### ws-server French copy — clean

`git grep -ni "Accueil\|Classement\|Résumé\|Rejouer\|Nouvelle partie\|Salut \|Plus grand dégommeur\|Winrate" -- apps/ws-server packages`
→ **no output**. The server never emits any of the renamed words; every French
string in this plan is web-only. This is a STOP condition if it ever stops
being true (see below).

### Repo conventions that apply here

- French user copy uses typographic apostrophes (`’`) in most places but the
  code also contains straight ones (`Aucun ami pour l'instant`,
  `Le cercle d'amis au grand complet`). **Match the file you are editing** —
  none of the new strings in this plan contain an apostrophe, so this only
  matters for the grep commands: quote them exactly as written here.
- Section titles go through `apps/web/src/components/ui/section-title.tsx`
  (`<SectionTitle sub="…">Titre</SectionTitle>`). Keep that shape.
- French copy inside comments is quoted with guillemets: `« Rejouer »`. Keep
  that when updating a comment.
- Commits are conventional: see `git log --oneline -5`, e.g.
  `feat(web): invalidate home and leaderboard caches when a game finishes`.

## Commands you will need

| Purpose      | Command                                                | Expected on success |
|--------------|--------------------------------------------------------|---------------------|
| Install      | `pnpm install`                                          | exit 0              |
| Lint         | `pnpm lint`                                             | exit 0              |
| Typecheck    | `pnpm typecheck`                                        | exit 0, no errors   |
| Unit tests   | `pnpm test`                                             | all pass            |
| E2E          | `pnpm test:e2e`                                         | the happy-path spec passes |
| E2E deps     | `docker compose -f docker-compose.test.yml up -d`       | containers healthy  |

Integration suites need the docker compose stack; serialize them with
`pnpm exec turbo run test --concurrency=1` if you hit DB races.

This plan changes **no logic**, so `pnpm test` (vitest) is expected to be green
before and after every commit — no unit test in the repo asserts any of the
renamed strings (verified: `grep -rn "Résumé de partie\|Nouvelle partie\|Plus grand dégommeur\|Winrate par personnage" apps/web/src --include="*.test.ts"` → no output).
`pnpm test:e2e` is the only suite that changes, and only in step 4.

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/components/tab-bar.tsx`
- `apps/web/src/app/(tabs)/amis/page.tsx`
- `apps/web/src/app/(tabs)/profil/page.tsx`
- `apps/web/src/components/friends/friends-screen.tsx`
- `apps/web/src/components/lobby/play-screen.tsx`
- `apps/web/src/components/stats/leaderboard-screen.tsx`
- `apps/web/src/components/home/home-screen.tsx`
- `apps/web/src/components/lobby/lobby-screen.tsx`
- `apps/web/src/components/live/summary.tsx`
- `apps/web/src/components/stats/top-degommeur-tile.tsx`
- `apps/web/src/components/stats/character-winrate-bars.tsx`
- `apps/web/src/components/rematch-button.tsx`
- `apps/web/src/app/partie/[gameId]/layout.tsx` (one comment line)
- `e2e/happy-path.spec.ts` (two assertion lines, step 4 only)
- `plans/README.md` (status row, at the very end)

**Out of scope — the owner marked these « à garder ». Do NOT rename them:**

- Action verbs under table pressure: `Annuler la dernière action`,
  `Fin de partie`, `Village atteint`, `Confirmer`, `Valider`,
  `Créer la partie`, `Créer`, `Inviter`, `Rejoindre`, `Lancer la partie`.
  These are asserted by the e2e spec and, more importantly, must be
  unambiguous mid-game. `Village atteint` in particular stays literal even
  though `Village` is now also a tab name — the collision is intentional and
  harmless (see "E2E impact").
- All data labels: `Victoires`, `Dégommages`, `Fétiche`, `Durée`, `Format`,
  `Winrate` (the `StatTile` at `apps/web/src/app/(tabs)/amis/[userId]/page.tsx:72`),
  `Demandes reçues`, `Mes demandes envoyées`, `Historique récent`,
  `Invitations reçues`, `Joueurs`, `Choix des personnages`.
- **Second-wave lexicon items — explicitly deferred, not part of this plan**:
  Convocations, Chronique, Faits d'armes, Ta hutte, Vieilles querelles, Duel,
  chef de camp. If you find yourself renaming `Invitations reçues`,
  `Historique récent`, `Profil`, `Rivalités` or `hôte`, **STOP** — that is the
  second wave.
- `apps/web/src/app/globals.css` — the uppercase tab rendering already works.
- `apps/web/src/components/home/resume-banner.tsx:20` (`'Lobby en attente'`) and
  `apps/web/src/components/lobby/host-controls.tsx:95`
  (`'Lobby complet — passe en format supérieur pour inviter.'`). These contain
  the word « Lobby » but were **not** in the validated set; item #7 scopes the
  rename to `lobby-screen.tsx`. Leave them and flag them in the PR body as a
  known coherence gap for the owner to rule on.
- `apps/web/src/components/lobby/lobby-screen.tsx:146` `sub="Connexion au lobby…"`
  — lowercase « lobby » inside a subtitle, not the title token « Lobby ».
  Considered and **excluded**: item #7 renames the title and the skeleton
  *title*, not this subtitle. Leave it exactly as is.
- Code comments that merely *mention* a screen by its old French name
  (`// … the Accueil resume banner …`, `/** Client shell of the Accueil screen …`,
  `// … the Amis lists …`, `// … Accueil and Classement caches …`). ~12 such
  lines exist across `apps/web/src`. They are internal prose, not UI, and
  renaming them is mechanical churn with zero user impact. **Only comments that
  quote a UI label in guillemets** are updated (steps 3 and 6 name them
  individually).
- `apps/web/src/components/rematch-button.tsx:13`
  (`SPECS.md §« Rejouer »`) — this cites a **SPECS.md section title**, which this
  plan does not rename. Leave it. This is why the step-6 grep is written to
  tolerate it.
- `SPECS.md`, `docs/maquette.html`, `docs/superpowers/**` — the design and spec
  reference artefacts. They still say « Résumé de partie », « Rejouer », etc.
  Updating them is a separate docs pass (see "Maintenance notes").
- Any route, URL, query key, testid, socket event name or DB value. The URLs
  stay `/`, `/amis`, `/jouer`, `/classement`, `/lobby/[gameId]`. Renaming a
  route is **not** part of this plan and would break the e2e spec's `goto`s.

## Git workflow

- Branch: `feat/015-lexique-gaulois`, cut from the base you verified above.
- **One word-family, one commit** — eight commits, in the order below. Do not
  squash them; the review value is in seeing each family land whole.
- Conventional commits, French subject after the scope (matches the repo, e.g.
  `feat(web): arcade-style segmented controls with raised selected key`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rename the four tabs and every screen title that echoes them

Files: `tab-bar.tsx`, `(tabs)/amis/page.tsx`, `(tabs)/profil/page.tsx`,
`friends-screen.tsx`, `play-screen.tsx`, `leaderboard-screen.tsx`.

1. `apps/web/src/components/tab-bar.tsx:16-19` — replace the four `label` values
   only. **Do not touch `href`, `icon` or `aliases`.** Target shape:

   ```tsx
   const TABS: Tab[] = [
     { href: '/', label: 'Village', icon: 'home', aliases: [] },
     { href: '/amis', label: 'Tribu', icon: 'users', aliases: [] },
     { href: '/jouer', label: 'Arène', icon: 'play', aliases: ['/lobby'] },
     { href: '/classement', label: 'Lauriers', icon: 'trophy', aliases: ['/parties'] },
   ]
   ```

2. `apps/web/src/app/(tabs)/amis/page.tsx:12`:
   ```tsx
   <SectionTitle sub="Ceux qui vident les gourdes avec toi">Tribu</SectionTitle>
   ```

3. `apps/web/src/components/lobby/play-screen.tsx:147`:
   ```tsx
   <SectionTitle sub="Ouvre l'arène ou rejoins la mêlée">Arène</SectionTitle>
   ```

4. `apps/web/src/components/stats/leaderboard-screen.tsx` — **both** `:29` and
   `:44`:
   ```tsx
   <SectionTitle sub="Toute la tribu, du premier au dernier">Lauriers</SectionTitle>
   ```

5. `apps/web/src/components/friends/friends-screen.tsx:197` and `:201`:
   ```tsx
         <p className="sec-label">Ta tribu</p>
   ```
   ```tsx
             title="Tribu déserte"
   ```
   Leave the EmptyState `description` and `icon` unchanged.

6. `apps/web/src/app/(tabs)/profil/page.tsx:27` — the back-link text
   `Accueil` → `Village`. The link's `href="/"` and its `aria`-free markup are
   unchanged; only the text node moves.

**Verify** (all four must hold):

```bash
grep -rn "label: 'Accueil'\|label: 'Amis'\|label: 'Jouer'\|label: 'Classement'" apps/web/src
# → no output

grep -c "label: 'Village'\|label: 'Tribu'\|label: 'Arène'\|label: 'Lauriers'" apps/web/src/components/tab-bar.tsx
# → 4

grep -rn "Ton cercle de dégommeurs\|Créer ou rejoindre une partie\|Le cercle d'amis au grand complet\|Tes amis\|Aucun ami pour l'instant" apps/web/src
# → no output

grep -rn "SectionTitle" apps/web/src | grep "Amis\|Jouer\|Classement"
# → no output
```

Then `pnpm lint && pnpm typecheck` → exit 0.

**Commit**: `feat(web): lexique gaulois — Village, Tribu, Arène, Lauriers`

### Step 2: Greet in Gaulish and shout the CTA

File: `apps/web/src/components/home/home-screen.tsx`.

1. `:57` — `Salut {username}` → `Salve, {username}`. Note the comma; the JSX
   expression `{username}` is unchanged:
   ```tsx
               Salve, {username}
   ```
2. `:86` — `Nouvelle partie` → `Aux armes !`. Keep the non-breaking-space-free
   plain space before `!` exactly as written here (matches the rest of the
   codebase, which uses a regular space, e.g. `'Invitation envoyée !'` in
   `friends-screen.tsx:109`):
   ```tsx
         <Icon name="play" size={18} />
         Aux armes !
   ```

**Verify**:

```bash
grep -rn "Salut {username}\|Nouvelle partie" apps/web/src
# → no output

grep -n "Salve, {username}\|Aux armes !" apps/web/src/components/home/home-screen.tsx
# → 2 lines
```

Then `pnpm lint && pnpm typecheck` → exit 0.

**Commit**: `feat(web): l'accueil salue en gaulois — « Salve » et « Aux armes ! »`

### Step 3: The lobby becomes « Le camp »

Files: `lobby-screen.tsx`, `friends-screen.tsx` (one comment).

1. `apps/web/src/components/lobby/lobby-screen.tsx:146` — title token only.
   **`sub="Connexion au lobby…"` stays untouched** (see "Out of scope"):
   ```tsx
           <SectionTitle sub="Connexion au lobby…">Le camp</SectionTitle>
   ```
2. `:159`:
   ```tsx
           <SectionTitle sub="Partage le code ou invite tes amis">Le camp</SectionTitle>
   ```
3. `:217`:
   ```tsx
           Lever le camp
   ```
4. `apps/web/src/components/friends/friends-screen.tsx:137` — the comment quotes
   the button label, so it follows it:
   ```tsx
         // « Lever le camp » is the way back out.
   ```

**Verify**:

```bash
grep -rn "Quitter le lobby" apps/web/src e2e
# → no output

grep -n ">Lobby<" apps/web/src/components/lobby/lobby-screen.tsx
# → no output

grep -c "Le camp" apps/web/src/components/lobby/lobby-screen.tsx
# → 2

grep -n "Lever le camp" apps/web/src/components/lobby/lobby-screen.tsx
# → 1 line (:217)

grep -n "Connexion au lobby…" apps/web/src/components/lobby/lobby-screen.tsx
# → 1 line — this MUST still be there
```

Then `pnpm lint && pnpm typecheck` → exit 0.

**Commit**: `feat(web): le lobby devient « Le camp » (et « Lever le camp »)`

### Step 4: The summary becomes « Le banquet » — code and spec together

Files: `summary.tsx`, `e2e/happy-path.spec.ts`. **These two edits must be in the
same commit**; splitting them leaves the e2e suite red at an intermediate commit.

1. `apps/web/src/components/live/summary.tsx:119`:
   ```tsx
         <h1 className="s-title relative">Le banquet</h1>
   ```
2. `e2e/happy-path.spec.ts:126`:
   ```ts
       await expect(p2.getByText('Le banquet')).toBeVisible()
   ```
3. `e2e/happy-path.spec.ts:130`:
   ```ts
       await expect(p1.getByText('Le banquet')).toBeVisible()
   ```

Change nothing else in the spec. In particular leave `:127`
(`getByText('Victoire')`), the two `summary-row-*` testid assertions at `:128-129`
and the `shot(p2, '13-resume')` screenshot name at `:131` exactly as they are —
the screenshot filename is a QA artefact name, not UI copy.

**Verify**:

```bash
grep -rn "Résumé de partie" apps/web/src e2e
# → no output

grep -n "Le banquet" e2e/happy-path.spec.ts
# → exactly 2 lines: 126 and 130

grep -n "Le banquet" apps/web/src/components/live/summary.tsx
# → 1 line (:119)
```

Then `pnpm lint && pnpm typecheck` → exit 0, and run the e2e suite:

```bash
docker compose -f docker-compose.test.yml up -d
pnpm test:e2e
```
→ `1 passed`. This is the one step that genuinely needs the browser run; do not
skip it and do not claim it passed without the output.

**Commit**: `feat(web): le résumé de partie devient « Le banquet »`

### Step 5: The top dégommeur becomes « Fléau des Gaules »

File: `apps/web/src/components/stats/top-degommeur-tile.tsx`.

Both `:10` (the JSDoc, which quotes the label) and `:14` (the label itself):

```tsx
/** Highlighted « Fléau des Gaules » spotlight card. */
```
```tsx
      <p className="sec-label">Fléau des Gaules</p>
```

Do **not** rename the component `TopDegommeurTile`, its props interface, the
`TopDegommeur` type, the `topDegommeur` payload field or the file name — those
are code identifiers and part of the API payload contract
(`apps/web/src/lib/api-payloads.ts`, `apps/web/src/lib/queries/stats.ts`).

**Verify**:

```bash
grep -rn "Plus grand dégommeur" apps/web/src
# → no output

grep -c "Fléau des Gaules" apps/web/src/components/stats/top-degommeur-tile.tsx
# → 2

grep -rn "topDegommeur" apps/web/src/lib/api-payloads.ts apps/web/src/lib/queries/stats.ts
# → still present, unchanged
```

Then `pnpm lint && pnpm typecheck && pnpm test` → exit 0 (the payload tests in
`apps/web/src/lib/api-payloads.test.ts` reference `topDegommeur` and must stay
green).

**Commit**: `feat(web): le meilleur dégommeur devient « Fléau des Gaules »`

### Step 6: « Rejouer » becomes « Revanche ! »

Files: `rematch-button.tsx`, `app/partie/[gameId]/layout.tsx`.

1. `apps/web/src/components/rematch-button.tsx:52` — the label:
   ```tsx
         Revanche !
   ```
2. `apps/web/src/components/rematch-button.tsx:19` — the JSDoc quoting the label:
   ```tsx
    * « Revanche ! » — asks the server for a fresh lobby at the same format with every
   ```
3. `apps/web/src/app/partie/[gameId]/layout.tsx:11` — the comment quoting the label:
   ```tsx
    * come from the root layout, which is what keeps them alive when « Revanche ! »
   ```
4. **Leave `apps/web/src/components/rematch-button.tsx:13` alone** — it reads
   `SPECS.md §« Rejouer »` and cites a SPECS.md section this plan does not rename.

Do not rename `RematchButton`, `finishedGameId`, or the `replay:create` socket
event. The three render sites listed in "Current state" need no edit.

**Verify**:

```bash
grep -rn "Rejouer" apps/web/src
# → exactly 1 line: apps/web/src/components/rematch-button.tsx:13 (the SPECS.md citation)

grep -rn "Revanche !" apps/web/src
# → 3 lines (rematch-button.tsx :19 and :52, partie/[gameId]/layout.tsx:11)

grep -rn "Rejouer\|Revanche" e2e
# → no output (the spec never asserts either)
```

Then `pnpm lint && pnpm typecheck` → exit 0.

**Commit**: `feat(web): « Rejouer » devient « Revanche ! »`

### Step 7: « Voir le classement » becomes « Voir les lauriers »

File: `apps/web/src/components/live/summary.tsx`, both occurrences.

`:257-260` (loser branch):
```tsx
               <Button variant="ghost" onClick={() => router.push('/classement')}>
                 Voir les lauriers
               </Button>
```

`:266` (winner branch):
```tsx
               <Button onClick={() => router.push('/classement')}>Voir les lauriers</Button>
```

**The `router.push('/classement')` route is unchanged.** Only the button text moves.

**Verify**:

```bash
grep -rn "Voir le classement" apps/web/src e2e
# → no output

grep -c "Voir les lauriers" apps/web/src/components/live/summary.tsx
# → 2

grep -c "router.push('/classement')" apps/web/src/components/live/summary.tsx
# → 2  (routes untouched)
```

Then `pnpm lint && pnpm typecheck` → exit 0.

**Commit**: `feat(web): « Voir le classement » devient « Voir les lauriers »`

### Step 8: « Winrate par personnage » becomes « Victoires par personnage »

File: `apps/web/src/components/stats/character-winrate-bars.tsx:14`.

```tsx
      <p className="sec-label">Victoires par personnage</p>
```

Change **only** that string. Do not rename `CharacterWinrateBars`,
`CharacterWinrate`, `characterWinrates`, the `winrate` field, the file, or the
`title={...partie...}` tooltip. Do not touch
`apps/web/src/components/stats/leaderboard-screen.tsx:55-57`, whose fallback text
reads « Les winrates par personnage apparaîtront après vos premières parties » —
lowercase prose, not the validated label, and not in the set.

**Verify**:

```bash
grep -rn "Winrate par personnage" apps/web/src
# → no output

grep -n "Victoires par personnage" apps/web/src/components/stats/character-winrate-bars.tsx
# → 1 line (:14)

grep -rn 'label="Winrate"' apps/web/src
# → 1 line: apps/web/src/app/(tabs)/amis/[userId]/page.tsx:72 — this MUST survive
```

Then `pnpm lint && pnpm typecheck && pnpm test` → exit 0.

**Commit**: `feat(web): « Winrate par personnage » devient « Victoires par personnage »`

## E2E impact table

`e2e/happy-path.spec.ts` is the **only** spec file in the repo
(`find . -name "*.spec.ts" -not -path "*/node_modules/*"` → one result).
`e2e/helpers.ts` contains three French strings (`'Créer mon compte'`,
`'Pseudo disponible'`, `"C'est parti"`) — **none of them change**.

Full audit of every user-facing string the spec locates on:

| Spec line | Locator | Verdict |
|-----------|---------|---------|
| helpers.ts:24 / :27 / :28 | `'Créer mon compte'`, `'Pseudo disponible'`, `"C'est parti"` | unchanged — auth flow, not in the lexicon |
| :24 | `'Créer mon compte'` | unchanged |
| :27 | `'Pseudo disponible'` | unchanged |
| :29 | `"C'est parti"` | unchanged |
| :35 | `p1.goto('/amis')` | unchanged — **navigation is by URL, not by tab label** |
| :36 | `getByLabel('Chercher un pseudo')` | unchanged |
| :37 | `'Demander en ami'` | unchanged |
| :38 | `'Demande en attente'` | unchanged |
| :40 | `p2.goto('/amis')` | unchanged |
| :41 | `getByText('Demandes reçues')` | unchanged — « à garder » |
| :43 | `` `Accepter la demande de ${J1.username}` `` | unchanged |
| :52 / :54 | `'hors ligne'` / `'en ligne'` | unchanged |
| :58 | `p1.goto('/jouer')` | unchanged — URL |
| :60 | `'Créer la partie'` | unchanged — « à garder » |
| :65 | `'Inviter'` | unchanged — « à garder » |
| :67 | `` `${J1.username} t’invite` `` | unchanged |
| :69 | `'Rejoindre'` | unchanged — « à garder » |
| :73 / :75 | `'Astérix'` / `'Obélix'` (exact) | unchanged |
| :79 | `'Lancer la partie'` | unchanged — « à garder » |
| :84 / :85 | `locator('.tabbar')` | unchanged — **class selector; the four tab renames cannot reach it** |
| :86 / :87 | `getByTestId('game-clock')` | unchanged |
| :90 | `getByTestId('tap-zone')` | unchanged |
| :102 | `'Annuler la dernière action'` | unchanged — « à garder » |
| :109 / :113 | `'Fin de partie'` (button, then dialog name) | unchanged — « à garder » |
| :111 | `'Village atteint'` (button role) | unchanged — « à garder »; role-scoped, no collision with the new `Village` tab label |
| :116 | `` `Village atteint par ${J2.username}` `` | unchanged — a strict superstring of `Village`; the tab label's text node is exactly `Village`, so `getByText` cannot match it here |
| :117 | `'Confirmer'` | unchanged — « à garder » |
| :119 | `'Demande de fin de partie'` (dialog) | unchanged |
| :121 | `` `${J2.username} a atteint le village` `` | unchanged |
| :123 | `'Valider'` | unchanged — « à garder » |
| **:126** | `p2.getByText('Résumé de partie')` | **→ `p2.getByText('Le banquet')`** (step 4) |
| :127 | `p2.getByText('Victoire')` | unchanged |
| :128 / :129 | `getByTestId('summary-row-*')` | unchanged |
| **:130** | `p1.getByText('Résumé de partie')` | **→ `p1.getByText('Le banquet')`** (step 4) |
| :134 | `p1.goto('/classement')` | unchanged — URL |
| :135 / :136 | `getByTestId('ranking-row-*')` | unchanged |
| :140 | `` p1.goto(`/parties/${gameId}`) `` | unchanged — URL |
| :142 / :146 | journal lines (`a dégommé`, `a annulé le dégommage`) | unchanged |
| :148 | `RegExp('village atteint par …')` | unchanged — lowercase `village`, no collision |
| :151 | `// Accueil with history, light + dark.` | **prose comment, not a locator** — leave it (see "Out of scope": comments that merely mention a screen) |
| :152 | `p1.goto('/')` | unchanged — URL |
| :153 | `getByText('Historique récent')` | unchanged — second-wave item, deferred |
| :154 | `getByText(/1 dégommage/)` | unchanged |

**Net e2e change: exactly two lines, 126 and 130, both in step 4.**

Screenshot names (`shot(p1, '06-jouer')`, `shot(p2, '13-resume')`,
`shot(p1, '14-classement')`, `shot(p1, '16-accueil')`) are QA artefact filenames,
**not** UI copy — leave every one of them alone.

## Test plan

- **No new tests.** This plan changes no behaviour, so a new test would assert a
  string against itself. The regression surface is the existing e2e spec, and it
  is covered by step 4.
- Existing suites that must stay green at every commit:
  - `pnpm test` — vitest across `apps/web`, `apps/ws-server`, `packages/*`. No
    unit test asserts a renamed string (verified in "Commands you will need").
  - `pnpm test:e2e` — required after step 4, and once more at the end.
- Manual smoke, after the last commit (`pnpm dev`, one browser):
  1. `/` shows « Salve, <pseudo> » and an « Aux armes ! » key; the bar reads
     VILLAGE · TRIBU · ARÈNE · LAURIERS in uppercase.
  2. `/amis` title « Tribu », subtitle « Ceux qui vident les gourdes avec toi »,
     section « Ta tribu »; with no friends, « Tribu déserte ».
  3. `/jouer` title « Arène », subtitle « Ouvre l'arène ou rejoins la mêlée ».
  4. `/classement` title « Lauriers », spotlight « Fléau des Gaules », bars
     « Victoires par personnage ».
  5. `/profil` back link reads « Village ».
  6. A lobby reads « Le camp » with a « Lever le camp » ghost button.
  7. An end-of-game screen reads « Le banquet », with « Voir les lauriers » and
     « Revanche ! ».

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm test:e2e` exits 0 — real output pasted into the PR, not asserted
- [ ] `grep -rn "label: 'Accueil'\|label: 'Amis'\|label: 'Jouer'\|label: 'Classement'" apps/web/src` → no output
- [ ] `grep -rn "Ton cercle de dégommeurs\|Créer ou rejoindre une partie\|Le cercle d'amis au grand complet" apps/web/src` → no output
- [ ] `grep -rn "Tes amis\|Aucun ami pour l'instant" apps/web/src` → no output
- [ ] `grep -rn "Salut {username}\|Nouvelle partie" apps/web/src` → no output
- [ ] `grep -rn "Quitter le lobby" apps/web/src e2e` → no output
- [ ] `grep -n ">Lobby<" apps/web/src/components/lobby/lobby-screen.tsx` → no output
- [ ] `grep -rn "Résumé de partie" apps/web/src e2e` → no output
- [ ] `grep -rn "Plus grand dégommeur" apps/web/src` → no output
- [ ] `grep -rn "Rejouer" apps/web/src` → **exactly one** line (`rematch-button.tsx:13`, the SPECS.md citation)
- [ ] `grep -rn "Voir le classement" apps/web/src e2e` → no output
- [ ] `grep -rn "Winrate par personnage" apps/web/src` → no output
- [ ] `grep -rn 'label="Winrate"' apps/web/src` → **exactly one** line (`(tabs)/amis/[userId]/page.tsx:72`) — the profile stat tile survived
- [ ] `grep -rn "Village\|Tribu\|Arène\|Lauriers\|Le camp\|Le banquet\|Fléau des Gaules\|Revanche" apps/ws-server packages` → no output (no French copy leaked server-side)
- [ ] `git diff --name-only <base>..HEAD` lists only the files in "In scope"
- [ ] Eight commits, one per word family, in the step order
- [ ] `plans/README.md` has a row for 015

## STOP conditions

Stop and report back (do not improvise) if:

- **Any e2e assertion on a renamed string exists beyond lines 126 and 130.**
  Run this before step 1:
  ```bash
  grep -rn "Accueil\|'Amis'\|'Jouer'\|'Classement'\|Lobby\|Quitter le lobby\|Résumé de partie\|Rejouer\|Nouvelle partie\|Salut\|Plus grand dégommeur\|Winrate par personnage\|Voir le classement\|Tes amis\|Aucun ami" e2e/
  ```
  Expected: **exactly three hits** —
  - `happy-path.spec.ts:126` and `:130` — the two assertions step 4 rewrites;
  - `happy-path.spec.ts:151` — `// Accueil with history, light + dark.`, a prose
    comment, **not** a locator. Leave it alone.

  Anything beyond those three means the spec changed since this plan was
  written — STOP.
- **Any occurrence of the renamed words in ws-server or packages French copy.**
  Run before step 1:
  ```bash
  grep -rni "Accueil\|Classement\|Résumé\|Rejouer\|Nouvelle partie\|Salut \|Plus grand dégommeur\|Winrate" apps/ws-server packages --include="*.ts"
  ```
  Expected: **no output**. Any hit means a French label now lives server-side and
  the rename has a surface this plan does not cover — STOP and report the file.
- `apps/web/src/components/live/summary.tsx` does not contain
  `<h1 className="s-title relative">Résumé de partie</h1>` at or near line 119,
  or the file is under 200 lines (you are on the wrong base — see "Base").
- Any "Current state" excerpt does not match the live code.
- A step's verification fails twice after a reasonable fix attempt.
- The change appears to require touching a file outside the "In scope" list —
  in particular `globals.css`, any route, any query key, any socket event, or
  any `data-testid`.
- You are tempted to rename something not in the eleven-item table (Convocations,
  Chronique, Faits d'armes, Ta hutte, Vieilles querelles, Duel, chef de camp,
  Historique récent, Invitations reçues, Profil…). That is the deliberately
  deferred second wave — STOP rather than sneak it in.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinise**: (a) that the eight commits are one
  word-family each and none of them mixes a rename with a behaviour change;
  (b) that no route, query key, testid or socket event moved — `git diff` should
  contain only string literals and comments; (c) that `label="Winrate"` on the
  profile stat tile survived, since it is the one deliberate survivor of the
  winrate rename; (d) the e2e diff is exactly two lines.
- **Known coherence gaps left on purpose** (flag these in the PR body for the
  owner to rule on, do not fix them here):
  - `resume-banner.tsx:20` still says « Lobby en attente ».
  - `host-controls.tsx:95` still says « Lobby complet — passe en format
    supérieur pour inviter. »
  - `lobby-screen.tsx:146` subtitle still says « Connexion au lobby… ».
  - `leaderboard-screen.tsx:37` empty-state still says « …comparer victoires,
    winrate et dégommages ».
- **Deferred docs pass**: `SPECS.md` (3 hits), `docs/maquette.html` (7 hits) and
  `docs/superpowers/**` still use the old vocabulary. They are historical design
  artefacts; a follow-up plan should decide whether SPECS.md gets a lexicon
  section rather than a find-and-replace. `rematch-button.tsx:13` deliberately
  still cites `SPECS.md §« Rejouer »` and must be updated *with* that docs pass,
  not before it.
- **Deferred second-wave lexicon** (owner-listed, not validated): Convocations,
  Chronique, Faits d'armes, Ta hutte, Vieilles querelles, Duel, chef de camp.
  A future plan 0NN should carry them as its own eight-commit pass.
- **Future interaction**: any new screen title must be cut from this register
  (village / tribu / camp / arène / banquet / lauriers) while any new *action
  verb* stays literal. That split — nouns dress up, verbs stay plain — is the
  rule this plan encodes and the thing to defend in review.
