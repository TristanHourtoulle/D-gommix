# Dégommix v1 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la v1 complète de Dégommix — PWA mobile de suivi des parties de petits chevaux Astérix (comptes, amis, lobby temps réel, partie live synchronisée, classement) — déployée sur Railway sous `degommix.tristanhourtoulle.fr`.

**Architecture:** Monorepo pnpm + Turborepo. `apps/web` (Next.js 15, App Router) porte l'auth Better Auth et toutes les lectures HTTP ; `apps/ws-server` (Node + Socket.IO, instance unique) est le serveur temps réel autoritaire (amis, lobby, partie, présence) ; `packages/game-core` (TypeScript pur) contient les types d'événements, le réducteur et `validateCommand` partagés client/serveur ; `packages/db` (Drizzle + Postgres) est partagé par les deux apps. État de partie en event sourcing append-only (`game_events`, `seq` serveur, undo = événement `UNDO`).

**Tech Stack:** pnpm ≥ 9, Turborepo 2, Node 22, TypeScript 5 (strict), Next.js 15, Tailwind CSS 4, Better Auth (plugin JWT), Socket.IO 4, `socket.io-client`, Drizzle ORM + drizzle-kit, Postgres 16, Zod, jose, sharp (script assets), Serwist 9, Vitest 3, Playwright, Railway.

**Documents de référence (source de vérité, ne pas re-discuter les décisions) :**
- `SPECS.md` (v2) — périmètre fonctionnel.
- `docs/superpowers/specs/2026-07-25-degommix-design.md` — design technique (schéma SQL §2, événements §3.2, protocole WS §4.3-4.4, écrans §5, codes d'erreur §6.1, tests §7).
- `docs/maquette.html` — maquette interactive : tokens CSS, sprite d'icônes, structure exacte de chaque écran.

## Contraintes globales

Chaque tâche hérite implicitement de ces contraintes :

- **Code 100 % en anglais** (identifiants, commentaires, commits) ; **toute copie UI en français** (l'app est français uniquement).
- TypeScript `strict: true` + `noUncheckedIndexedAccess: true` + `noImplicitReturns: true` partout. Jamais `any` (utiliser `unknown` + type guards). Pas de `console.log` en production (logs structurés via `console.error`/logger minimal côté serveur uniquement).
- Zod à toutes les frontières : variables d'env au boot, payloads WS, bodies HTTP.
- `packages/game-core` n'importe **rien** (ni `db`, ni framework). `packages/db` n'importe aucun framework.
- Fichiers 200-400 lignes max (800 absolu) ; organisation par feature.
- Commits au format Conventional Commits `type(scope): description`, un commit par étape de commit indiquée. Ne jamais amend/force-push.
- Mobile uniquement (viewport ~390 px, pas d'optimisation desktop). Thèmes clair/sombre via tokens CSS + `prefers-color-scheme` + `data-theme`.
- Variables d'environnement : `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_WS_URL`, `WEB_ORIGIN`, `PORT` (ws-server). Aucun secret en dur.
- Pseudo : **20 caractères max, unique insensible à la casse**. Code de partie : **6 caractères**, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, jamais réutilisé.
- Personnages (ordre canonique) : `asterix` (#b23a2e), `obelix` (#2c5b82), `caius_bonus` (#b9861f), `caligula_minus` (#3f6b3c).
- Base Postgres de test locale : `docker compose -f docker-compose.test.yml up -d` (définie en Tâche 8), `postgres://degommix:degommix@localhost:54329/degommix_test`.
- Commandes de vérification transverses : `pnpm turbo run typecheck lint test` doit passer à la fin de chaque tâche.

---

## Phase 0 — Scaffolding du monorepo

### Tâche 1 : Monorepo pnpm + Turborepo + tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.nvmrc`
- Create: `apps/.gitkeep`, `packages/.gitkeep` (supprimés dès que les packages existent)

**Interfaces:**
- Produces: pipelines Turbo `build`, `lint`, `typecheck`, `test` que toutes les tâches suivantes utilisent ; `tsconfig.base.json` que chaque package étend.

- [ ] **Étape 1 : Fichiers racine**

`package.json` :

```json
{
  "name": "degommix",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.19.0",
    "@eslint/js": "^9.17.0"
  }
}
```

`pnpm-workspace.yaml` :

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json` :

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

`eslint.config.mjs` (flat config partagée) :

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["error", "warn"] }]
    }
  }
);
```

`.gitignore` : `node_modules/`, `dist/`, `.next/`, `.turbo/`, `.env`, `.env.local`, `*.tsbuildinfo`, `test-results/`, `playwright-report/`.
`.nvmrc` : `22`.

- [ ] **Étape 2 : Installer et vérifier**

Run: `pnpm install && pnpm turbo run build lint typecheck test`
Expected: succès (aucun package encore — turbo affiche "no tasks were executed" ou 0 packages, exit 0).

- [ ] **Étape 3 : Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .gitignore .nvmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

## Phase 1 — `packages/game-core` (TDD strict)

Toute la phase suit le cycle test rouge → implémentation → test vert. Le réducteur est le cœur métier : couverture exhaustive exigée (design §7.1).

### Tâche 2 : Squelette du package + types d'événements et d'état

**Files:**
- Create: `packages/game-core/package.json`, `packages/game-core/tsconfig.json`, `packages/game-core/vitest.config.ts`
- Create: `packages/game-core/src/types.ts`, `packages/game-core/src/protocol.ts`, `packages/game-core/src/index.ts`
- Test: `packages/game-core/src/types.test.ts`

**Interfaces:**
- Produces: tous les types partagés du projet — `GameEvent`, `GameState`, `PlayerState`, `Command`, `EndKind`, `CharacterId`, `ErrorCode`, `CHARACTERS` — consommés par toutes les tâches suivantes. **Ces définitions sont le contrat : les tâches 3-30 doivent les utiliser telles quelles.**

- [ ] **Étape 1 : Package**

`packages/game-core/package.json` :

```json
{
  "name": "@degommix/game-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "devDependencies": { "vitest": "^3.0.0" }
}
```

`tsconfig.json` : extends `../../tsconfig.base.json`, `"outDir": "dist"`, `"rootDir": "src"`, `"declaration": true`, include `src`.
`vitest.config.ts` : `export default { test: { include: ["src/**/*.test.ts"] } }` (import `defineConfig` de vitest/config).

- [ ] **Étape 2 : Types (`src/types.ts`)** — recopier exactement :

```ts
export const CHARACTERS = ["asterix", "obelix", "caius_bonus", "caligula_minus"] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export type GameFormat = 2 | 3 | 4;
export type EndKind = "village" | "abandon_individual" | "abandon_total";
export type GameOutcome = "village_reached" | "aborted";

export interface SeatSnapshot {
  userId: string;
  character: CharacterId;
}

interface BaseEvent {
  seq: number;
  createdAt: string; // ISO 8601, informative only (order = seq)
}

export type GameEvent =
  | (BaseEvent & { type: "GAME_STARTED"; actorId: string; targetId: null; payload: { players: SeatSnapshot[]; format: GameFormat } })
  | (BaseEvent & { type: "DEGOMMAGE"; actorId: string; targetId: string; payload: null })
  | (BaseEvent & { type: "UNDO"; actorId: string; targetId: null; payload: { targetSeq: number } })
  | (BaseEvent & { type: "PLAYER_QUIT"; actorId: string; targetId: null; payload: null })
  | (BaseEvent & { type: "END_REQUESTED"; actorId: string; targetId: string | null; payload: { kind: EndKind } })
  | (BaseEvent & { type: "END_REJECTED"; actorId: string; targetId: null; payload: { requestSeq: number } })
  | (BaseEvent & { type: "END_VALIDATED"; actorId: string; targetId: null; payload: { requestSeq: number } })
  | (BaseEvent & { type: "GAME_AUTO_CLOSED"; actorId: null; targetId: null; payload: { reason: "zombie" } });

export type GameEventType = GameEvent["type"];

export interface PlayerState {
  userId: string;
  character: CharacterId;
  degommages: number; // non-undone count
  inGame: boolean;    // false after PLAYER_QUIT
}

export interface DegommageEntry {
  seq: number;
  actorId: string;
  targetId: string;
}

export interface PendingEndRequest {
  requestSeq: number;
  requesterId: string;
  kind: EndKind;
  designatedWinnerId: string | null; // set only when kind === "village"
}

export interface GameState {
  status: "active" | "finished";
  format: GameFormat;
  seats: string[];                       // userIds in GAME_STARTED order
  players: Record<string, PlayerState>;
  degommageLog: DegommageEntry[];        // every DEGOMMAGE, in seq order
  undoneSeqs: ReadonlySet<number>;
  pendingEndRequest: PendingEndRequest | null;
  outcome: GameOutcome | null;
  winnerId: string | null;
  lastSeq: number;
}

export type Command =
  | { type: "degommage"; targetId: string }
  | { type: "undo" }
  | { type: "request_end"; kind: EndKind; winnerId?: string }
  | { type: "respond_end"; accept: boolean }
  | { type: "withdraw_end" };
```

- [ ] **Étape 3 : Protocole (`src/protocol.ts`)** — codes d'erreur du design §6.1 :

```ts
export const ERROR_CODES = [
  "AUTH_FAILED", "NOT_FOUND", "NOT_MEMBER", "NOT_HOST", "ALREADY_IN_GAME",
  "LOBBY_FULL", "LOBBY_ALREADY_STARTED", "INVALID_CODE", "CHARACTER_TAKEN",
  "FORMAT_INCOMPATIBLE", "PENDING_INVITES", "GAME_NOT_ACTIVE", "GAME_FINISHED",
  "PLAYER_LEFT", "INVALID_TARGET", "NOTHING_TO_UNDO", "END_REQUEST_PENDING",
  "NO_PENDING_REQUEST", "USERNAME_TAKEN", "RATE_LIMITED", "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type Ack<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: ErrorCode; message: string };

export type Presence = "online" | "in_game" | "offline";
```

`src/index.ts` : `export * from "./types.js"; export * from "./protocol.js";`

- [ ] **Étape 4 : Test de fumée (`src/types.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { CHARACTERS, ERROR_CODES } from "./index.js";

describe("game-core contracts", () => {
  it("exposes the 4 characters in canonical order", () => {
    expect(CHARACTERS).toEqual(["asterix", "obelix", "caius_bonus", "caligula_minus"]);
  });
  it("exposes all 21 error codes", () => {
    expect(ERROR_CODES).toHaveLength(21);
  });
});
```

- [ ] **Étape 5 : Vérifier**

Run: `pnpm install && pnpm --filter @degommix/game-core test && pnpm --filter @degommix/game-core build`
Expected: 2 tests PASS, build OK.

- [ ] **Étape 6 : Commit**

```bash
git add packages/game-core pnpm-lock.yaml
git commit -m "feat(game-core): add event, state, command and protocol types"
```

### Tâche 3 : Réducteur — `GAME_STARTED` + `DEGOMMAGE`

**Files:**
- Create: `packages/game-core/src/reducer.ts`, `packages/game-core/src/test-helpers.ts`
- Test: `packages/game-core/src/reducer.test.ts`
- Modify: `packages/game-core/src/index.ts` (exporter `reduce`, `buildGameState`)

**Interfaces:**
- Consumes: types de la Tâche 2.
- Produces: `reduce(state: GameState, event: GameEvent): GameState` (pur, immutable) et `buildGameState(events: GameEvent[]): GameState` (fold ; lève `Error` si le premier événement n'est pas `GAME_STARTED`).

- [ ] **Étape 1 : Helpers de test (`src/test-helpers.ts`)** — fabrique d'événements utilisée par tous les tests de la phase :

```ts
import type { GameEvent, SeatSnapshot, GameFormat, EndKind } from "./types.js";

let seqCounter = 0;
export const resetSeq = () => { seqCounter = 0; };
const next = () => ++seqCounter;
const at = () => new Date(2026, 6, 25, 12, 0, seqCounter).toISOString();

export const started = (players: SeatSnapshot[], format?: GameFormat): GameEvent => {
  const first = players[0];
  if (!first) throw new Error("players required");
  return { seq: next(), createdAt: at(), type: "GAME_STARTED", actorId: first.userId, targetId: null, payload: { players, format: format ?? (players.length as GameFormat) } };
};
export const degommage = (actorId: string, targetId: string): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "DEGOMMAGE", actorId, targetId, payload: null });
export const undo = (actorId: string, targetSeq: number): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "UNDO", actorId, targetId: null, payload: { targetSeq } });
export const quit = (actorId: string): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "PLAYER_QUIT", actorId, targetId: null, payload: null });
export const endRequested = (actorId: string, kind: EndKind, winnerId: string | null = null): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "END_REQUESTED", actorId, targetId: winnerId, payload: { kind } });
export const endRejected = (actorId: string, requestSeq: number): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "END_REJECTED", actorId, targetId: null, payload: { requestSeq } });
export const endValidated = (actorId: string, requestSeq: number): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "END_VALIDATED", actorId, targetId: null, payload: { requestSeq } });
export const autoClosed = (): GameEvent =>
  ({ seq: next(), createdAt: at(), type: "GAME_AUTO_CLOSED", actorId: null, targetId: null, payload: { reason: "zombie" } });

export const SEATS_2: SeatSnapshot[] = [
  { userId: "u1", character: "asterix" },
  { userId: "u2", character: "obelix" },
];
export const SEATS_4: SeatSnapshot[] = [
  ...SEATS_2,
  { userId: "u3", character: "caius_bonus" },
  { userId: "u4", character: "caligula_minus" },
];
```

- [ ] **Étape 2 : Tests rouges (`src/reducer.test.ts`)**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { buildGameState } from "./reducer.js";
import { resetSeq, started, degommage, SEATS_2, SEATS_4 } from "./test-helpers.js";

beforeEach(resetSeq);

describe("GAME_STARTED", () => {
  it("initializes seats, counters at 0, status active", () => {
    const s = buildGameState([started(SEATS_4)]);
    expect(s.status).toBe("active");
    expect(s.format).toBe(4);
    expect(s.seats).toEqual(["u1", "u2", "u3", "u4"]);
    expect(s.players["u1"]).toEqual({ userId: "u1", character: "asterix", degommages: 0, inGame: true });
    expect(s.lastSeq).toBe(1);
  });
  it("throws if the log does not start with GAME_STARTED", () => {
    expect(() => buildGameState([degommage("u1", "u2")])).toThrow();
  });
});

describe("DEGOMMAGE", () => {
  it("one tap = one pawn: increments the actor counter", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2"), degommage("u1", "u2")]);
    expect(s.players["u1"]?.degommages).toBe(2);
    expect(s.players["u2"]?.degommages).toBe(0);
    expect(s.degommageLog).toHaveLength(2);
  });
  it("counters depend only on seq order", () => {
    const a = buildGameState([started(SEATS_2), degommage("u1", "u2"), degommage("u2", "u1")]);
    resetSeq();
    const b = buildGameState([started(SEATS_2), degommage("u2", "u1"), degommage("u1", "u2")]);
    expect(a.players["u1"]?.degommages).toBe(1);
    expect(b.players["u1"]?.degommages).toBe(1);
  });
  it("two identical events with distinct seq count twice (idempotency is a server contract)", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2"), degommage("u1", "u2")]);
    expect(s.players["u1"]?.degommages).toBe(2);
  });
});
```

- [ ] **Étape 3 : Vérifier l'échec** — Run: `pnpm --filter @degommix/game-core test` — Expected: FAIL (`reducer.js` introuvable).

- [ ] **Étape 4 : Implémentation (`src/reducer.ts`)**

```ts
import type { GameEvent, GameState, PlayerState } from "./types.js";

export function buildGameState(events: GameEvent[]): GameState {
  const first = events[0];
  if (!first || first.type !== "GAME_STARTED") throw new Error("log must start with GAME_STARTED");
  let state = initialState(first);
  for (const event of events.slice(1)) state = reduce(state, event);
  return state;
}

function initialState(event: Extract<GameEvent, { type: "GAME_STARTED" }>): GameState {
  const players: Record<string, PlayerState> = {};
  for (const seat of event.payload.players) {
    players[seat.userId] = { userId: seat.userId, character: seat.character, degommages: 0, inGame: true };
  }
  return {
    status: "active",
    format: event.payload.format,
    seats: event.payload.players.map((p) => p.userId),
    players,
    degommageLog: [],
    undoneSeqs: new Set(),
    pendingEndRequest: null,
    outcome: null,
    winnerId: null,
    lastSeq: event.seq,
  };
}

export function reduce(state: GameState, event: GameEvent): GameState {
  const base = { ...state, lastSeq: event.seq };
  switch (event.type) {
    case "GAME_STARTED":
      throw new Error("GAME_STARTED must be the first event");
    case "DEGOMMAGE": {
      const actor = state.players[event.actorId];
      if (!actor) return base;
      return {
        ...base,
        players: { ...state.players, [event.actorId]: { ...actor, degommages: actor.degommages + 1 } },
        degommageLog: [...state.degommageLog, { seq: event.seq, actorId: event.actorId, targetId: event.targetId }],
      };
    }
    // UNDO / PLAYER_QUIT / END_* / GAME_AUTO_CLOSED : tâches 4 et 5
    default:
      return base;
  }
}
```

- [ ] **Étape 5 : Vérifier le vert** — Run: `pnpm --filter @degommix/game-core test` — Expected: PASS (les 3 describe de l'étape 2 + tâche 2).

- [ ] **Étape 6 : Exporter** — dans `src/index.ts`, ajouter `export { reduce, buildGameState } from "./reducer.js";`. Run `pnpm --filter @degommix/game-core typecheck`.

- [ ] **Étape 7 : Commit**

```bash
git add packages/game-core
git commit -m "feat(game-core): reducer for GAME_STARTED and DEGOMMAGE"
```

### Tâche 4 : Réducteur — `UNDO` (pile, profondeur illimitée)

**Files:**
- Modify: `packages/game-core/src/reducer.ts`
- Test: `packages/game-core/src/reducer.test.ts` (ajout d'un `describe("UNDO")`)

**Interfaces:**
- Consumes: `reduce` de la Tâche 3.
- Produces: sémantique UNDO : `undoneSeqs` marque `payload.targetSeq` ; le compteur du dégommeur ciblé est décrémenté. Fonction exportée `resolveUndoTarget(state: GameState): number | null` — retourne le `seq` du `DEGOMMAGE` non annulé le plus récent (utilisée par le serveur, Tâche 17).

- [ ] **Étape 1 : Tests rouges** (ajouter à `reducer.test.ts`) :

```ts
import { undo } from "./test-helpers.js";
import { resolveUndoTarget } from "./reducer.js";

describe("UNDO", () => {
  it("cancels the most recent non-undone DEGOMMAGE (stack)", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2"), degommage("u2", "u1"), undo("u1", 3)]);
    expect(s.players["u2"]?.degommages).toBe(0);
    expect(s.players["u1"]?.degommages).toBe(1);
  });
  it("any player can undo, not only the author", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2"), undo("u2", 2)]);
    expect(s.players["u1"]?.degommages).toBe(0);
  });
  it("successive undos empty the whole stack", () => {
    const s = buildGameState([
      started(SEATS_2), degommage("u1", "u2"), degommage("u1", "u2"),
      undo("u2", 3), undo("u1", 2),
    ]);
    expect(s.players["u1"]?.degommages).toBe(0);
    expect(resolveUndoTarget(s)).toBeNull();
  });
  it("resolveUndoTarget skips already-undone seqs", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2"), degommage("u2", "u1"), undo("u1", 3)]);
    expect(resolveUndoTarget(s)).toBe(2);
  });
  it("counting stays correct when rebuilding a log with an undo in the middle", () => {
    const events = [started(SEATS_2), degommage("u1", "u2"), undo("u2", 2), degommage("u1", "u2")];
    expect(buildGameState(events).players["u1"]?.degommages).toBe(1);
  });
});
```

- [ ] **Étape 2 : Vérifier l'échec** — Run: `pnpm --filter @degommix/game-core test` — Expected: FAIL (`resolveUndoTarget` non exporté, cas UNDO non traité).

- [ ] **Étape 3 : Implémentation** — dans `reduce`, ajouter :

```ts
case "UNDO": {
  const targetSeq = event.payload.targetSeq;
  const entry = state.degommageLog.find((d) => d.seq === targetSeq);
  if (!entry || state.undoneSeqs.has(targetSeq)) return base;
  const actor = state.players[entry.actorId];
  if (!actor) return base;
  return {
    ...base,
    undoneSeqs: new Set([...state.undoneSeqs, targetSeq]),
    players: { ...state.players, [entry.actorId]: { ...actor, degommages: actor.degommages - 1 } },
  };
}
```

Et en bas du fichier :

```ts
export function resolveUndoTarget(state: GameState): number | null {
  for (let i = state.degommageLog.length - 1; i >= 0; i--) {
    const entry = state.degommageLog[i];
    if (entry && !state.undoneSeqs.has(entry.seq)) return entry.seq;
  }
  return null;
}
```

Exporter `resolveUndoTarget` depuis `src/index.ts`.

- [ ] **Étape 4 : Vérifier le vert** — Run: `pnpm --filter @degommix/game-core test` — Expected: PASS.

- [ ] **Étape 5 : Commit**

```bash
git add packages/game-core
git commit -m "feat(game-core): UNDO semantics and resolveUndoTarget"
```

### Tâche 5 : Réducteur — `PLAYER_QUIT` + machine à états de fin de partie

**Files:**
- Modify: `packages/game-core/src/reducer.ts`
- Test: `packages/game-core/src/reducer.test.ts` (describe `PLAYER_QUIT`, `end of game`)

**Interfaces:**
- Consumes: Tâches 3-4.
- Produces: sémantique complète design §3.4 : `pendingEndRequest`, clôtures (`village_reached`/`aborted`), continuation après abandon individuel si ≥ 2 joueurs `inGame`, `GAME_AUTO_CLOSED`. Helper exporté `activePlayers(state: GameState): PlayerState[]` (joueurs `inGame`).

- [ ] **Étape 1 : Tests rouges** :

```ts
describe("PLAYER_QUIT", () => {
  it("player leaves but his degommages remain", () => {
    const s = buildGameState([started(SEATS_4), degommage("u3", "u1"), quit("u3")]);
    expect(s.players["u3"]?.inGame).toBe(false);
    expect(s.players["u3"]?.degommages).toBe(1);
    expect(s.status).toBe("active");
  });
});

describe("end of game", () => {
  it("village: END_REQUESTED sets pendingEndRequest with designated winner", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u2", "village", "u2")]);
    expect(s.pendingEndRequest).toEqual({ requestSeq: 2, requesterId: "u2", kind: "village", designatedWinnerId: "u2" });
    expect(s.status).toBe("active");
  });
  it("village validated: winner frozen, game finished", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u2", "village", "u2"), endValidated("u1", 2)]);
    expect(s.status).toBe("finished");
    expect(s.outcome).toBe("village_reached");
    expect(s.winnerId).toBe("u2");
    expect(s.pendingEndRequest).toBeNull();
  });
  it("rejected: pending cleared, game continues", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u2", "village", "u2"), endRejected("u1", 2)]);
    expect(s.pendingEndRequest).toBeNull();
    expect(s.status).toBe("active");
  });
  it("abandon_individual validated with >= 2 remaining: requester quits, game continues", () => {
    const s = buildGameState([
      started(SEATS_4), endRequested("u3", "abandon_individual"), endValidated("u1", 2), quit("u3"),
    ]);
    expect(s.status).toBe("active");
    expect(s.players["u3"]?.inGame).toBe(false);
  });
  it("abandon_individual validated with < 2 remaining: game aborted", () => {
    const s = buildGameState([
      started(SEATS_2), endRequested("u2", "abandon_individual"), endValidated("u1", 2), quit("u2"),
    ]);
    expect(s.status).toBe("finished");
    expect(s.outcome).toBe("aborted");
    expect(s.winnerId).toBeNull();
  });
  it("abandon_total validated: aborted, no winner", () => {
    const s = buildGameState([started(SEATS_4), endRequested("u1", "abandon_total"), endValidated("u1", 2)]);
    expect(s.outcome).toBe("aborted");
    expect(s.winnerId).toBeNull();
    expect(s.status).toBe("finished");
  });
  it("GAME_AUTO_CLOSED: aborted", () => {
    const s = buildGameState([started(SEATS_2), autoClosed()]);
    expect(s.status).toBe("finished");
    expect(s.outcome).toBe("aborted");
  });
  it("no event has any effect after closure", () => {
    const s = buildGameState([
      started(SEATS_2), endRequested("u1", "abandon_total"), endValidated("u1", 2), degommage("u1", "u2"),
    ]);
    expect(s.players["u1"]?.degommages).toBe(0);
    expect(s.status).toBe("finished");
  });
});
```

Note : la clôture « < 2 restants » est matérialisée par le **serveur** qui append `PLAYER_QUIT` puis constate qu'il reste < 2 joueurs — le réducteur passe alors `status: "finished"`, `outcome: "aborted"` quand un `PLAYER_QUIT` laisse moins de 2 joueurs `inGame` (cohérent fold/incrémental).

- [ ] **Étape 2 : Vérifier l'échec** — Run: `pnpm --filter @degommix/game-core test` — Expected: FAIL sur les nouveaux tests.

- [ ] **Étape 3 : Implémentation** — dans `reduce` (tous les cas ci-dessous commencent par `if (state.status === "finished") return { ...state, lastSeq: event.seq };` — placer ce garde en tête de `reduce`, après le cas `GAME_STARTED`) :

```ts
case "PLAYER_QUIT": {
  const actor = state.players[event.actorId];
  if (!actor || !actor.inGame) return base;
  const players = { ...state.players, [event.actorId]: { ...actor, inGame: false } };
  const remaining = Object.values(players).filter((p) => p.inGame).length;
  if (remaining < 2) {
    return { ...base, players, status: "finished", outcome: "aborted", pendingEndRequest: null };
  }
  return { ...base, players };
}
case "END_REQUESTED": {
  if (state.pendingEndRequest) return base;
  return {
    ...base,
    pendingEndRequest: {
      requestSeq: event.seq,
      requesterId: event.actorId,
      kind: event.payload.kind,
      designatedWinnerId: event.payload.kind === "village" ? event.targetId : null,
    },
  };
}
case "END_REJECTED": {
  if (state.pendingEndRequest?.requestSeq !== event.payload.requestSeq) return base;
  return { ...base, pendingEndRequest: null };
}
case "END_VALIDATED": {
  const pending = state.pendingEndRequest;
  if (pending?.requestSeq !== event.payload.requestSeq) return base;
  if (pending.kind === "village") {
    return { ...base, pendingEndRequest: null, status: "finished", outcome: "village_reached", winnerId: pending.designatedWinnerId };
  }
  if (pending.kind === "abandon_total") {
    return { ...base, pendingEndRequest: null, status: "finished", outcome: "aborted", winnerId: null };
  }
  // abandon_individual: the server appends PLAYER_QUIT right after (same transaction)
  return { ...base, pendingEndRequest: null };
}
case "GAME_AUTO_CLOSED":
  return { ...base, pendingEndRequest: null, status: "finished", outcome: "aborted", winnerId: null };
```

Ajouter et exporter :

```ts
export function activePlayers(state: GameState): PlayerState[] {
  return state.seats
    .map((id) => state.players[id])
    .filter((p): p is PlayerState => p !== undefined && p.inGame);
}
```

- [ ] **Étape 4 : Vérifier le vert** — Run: `pnpm --filter @degommix/game-core test` — Expected: PASS.

- [ ] **Étape 5 : Commit**

```bash
git add packages/game-core
git commit -m "feat(game-core): player quit and end-of-game state machine"
```

### Tâche 6 : `validateCommand` + parité fold/incrémental

**Files:**
- Create: `packages/game-core/src/validate.ts`
- Test: `packages/game-core/src/validate.test.ts`, `packages/game-core/src/parity.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Consumes: Tâches 2-5.
- Produces: `validateCommand(state: GameState, actorId: string, cmd: Command, ctx: { isHost: boolean }): { ok: true } | { ok: false; code: ErrorCode }` — exécutée côté client (désactivation UI) ET côté serveur (autorité). Règles = design §3.3, §3.4, §3.5.

- [ ] **Étape 1 : Tests rouges (`src/validate.test.ts`)** — cas exigés par le design §7.1 :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { buildGameState } from "./reducer.js";
import { validateCommand } from "./validate.js";
import { resetSeq, started, degommage, quit, endRequested, endValidated, SEATS_2, SEATS_4 } from "./test-helpers.js";

beforeEach(resetSeq);
const host = { isHost: true };
const guest = { isHost: false };

describe("validateCommand", () => {
  it("rejects self-degommage (INVALID_TARGET)", () => {
    const s = buildGameState([started(SEATS_2)]);
    expect(validateCommand(s, "u1", { type: "degommage", targetId: "u1" }, host)).toEqual({ ok: false, code: "INVALID_TARGET" });
  });
  it("rejects degommage on a player outside the game (INVALID_TARGET)", () => {
    const s = buildGameState([started(SEATS_2)]);
    expect(validateCommand(s, "u1", { type: "degommage", targetId: "ghost" }, host)).toEqual({ ok: false, code: "INVALID_TARGET" });
  });
  it("rejects degommage on a player who left (INVALID_TARGET)", () => {
    const s = buildGameState([started(SEATS_4), quit("u3")]);
    expect(validateCommand(s, "u1", { type: "degommage", targetId: "u3" }, host)).toEqual({ ok: false, code: "INVALID_TARGET" });
  });
  it("a player who left can no longer act (PLAYER_LEFT)", () => {
    const s = buildGameState([started(SEATS_4), quit("u3")]);
    expect(validateCommand(s, "u3", { type: "degommage", targetId: "u1" }, guest)).toEqual({ ok: false, code: "PLAYER_LEFT" });
  });
  it("a non-member cannot act (NOT_MEMBER)", () => {
    const s = buildGameState([started(SEATS_2)]);
    expect(validateCommand(s, "stranger", { type: "undo" }, guest)).toEqual({ ok: false, code: "NOT_MEMBER" });
  });
  it("undo with empty stack (NOTHING_TO_UNDO)", () => {
    const s = buildGameState([started(SEATS_2)]);
    expect(validateCommand(s, "u1", { type: "undo" }, host)).toEqual({ ok: false, code: "NOTHING_TO_UNDO" });
  });
  it("second end request while one is pending (END_REQUEST_PENDING)", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u2", "village", "u2")]);
    expect(validateCommand(s, "u1", { type: "request_end", kind: "abandon_total" }, host)).toEqual({ ok: false, code: "END_REQUEST_PENDING" });
  });
  it("non-host cannot validate an end request (NOT_HOST)", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u1", "village", "u1")]);
    expect(validateCommand(s, "u2", { type: "respond_end", accept: true }, guest)).toEqual({ ok: false, code: "NOT_HOST" });
  });
  it("respond_end with no pending request (NO_PENDING_REQUEST)", () => {
    const s = buildGameState([started(SEATS_2)]);
    expect(validateCommand(s, "u1", { type: "respond_end", accept: true }, host)).toEqual({ ok: false, code: "NO_PENDING_REQUEST" });
  });
  it("withdraw_end only by the requester (NO_PENDING_REQUEST otherwise)", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u2", "abandon_total")]);
    expect(validateCommand(s, "u1", { type: "withdraw_end" }, host)).toEqual({ ok: false, code: "NO_PENDING_REQUEST" });
    expect(validateCommand(s, "u2", { type: "withdraw_end" }, guest)).toEqual({ ok: true });
  });
  it("village request must designate a player still in game (INVALID_TARGET)", () => {
    const s = buildGameState([started(SEATS_4), quit("u3")]);
    expect(validateCommand(s, "u1", { type: "request_end", kind: "village", winnerId: "u3" }, host)).toEqual({ ok: false, code: "INVALID_TARGET" });
    expect(validateCommand(s, "u1", { type: "request_end", kind: "village" }, host)).toEqual({ ok: false, code: "INVALID_TARGET" });
  });
  it("everything is rejected once finished (GAME_FINISHED)", () => {
    const s = buildGameState([started(SEATS_2), endRequested("u1", "abandon_total"), endValidated("u1", 2)]);
    expect(validateCommand(s, "u1", { type: "degommage", targetId: "u2" }, host)).toEqual({ ok: false, code: "GAME_FINISHED" });
  });
  it("happy paths are accepted", () => {
    const s = buildGameState([started(SEATS_2), degommage("u1", "u2")]);
    expect(validateCommand(s, "u1", { type: "degommage", targetId: "u2" }, host)).toEqual({ ok: true });
    expect(validateCommand(s, "u2", { type: "undo" }, guest)).toEqual({ ok: true });
    expect(validateCommand(s, "u2", { type: "request_end", kind: "village", winnerId: "u2" }, guest)).toEqual({ ok: true });
  });
});
```

- [ ] **Étape 2 : Vérifier l'échec** — Run: `pnpm --filter @degommix/game-core test` — Expected: FAIL.

- [ ] **Étape 3 : Implémentation (`src/validate.ts`)**

```ts
import type { Command, GameState } from "./types.js";
import type { ErrorCode } from "./protocol.js";
import { resolveUndoTarget } from "./reducer.js";

export type ValidationResult = { ok: true } | { ok: false; code: ErrorCode };
const fail = (code: ErrorCode): ValidationResult => ({ ok: false, code });
const OK: ValidationResult = { ok: true };

export function validateCommand(
  state: GameState,
  actorId: string,
  cmd: Command,
  ctx: { isHost: boolean },
): ValidationResult {
  if (state.status === "finished") return fail("GAME_FINISHED");
  const actor = state.players[actorId];
  if (!actor) return fail("NOT_MEMBER");
  if (!actor.inGame) return fail("PLAYER_LEFT");

  switch (cmd.type) {
    case "degommage": {
      const target = state.players[cmd.targetId];
      if (cmd.targetId === actorId || !target || !target.inGame) return fail("INVALID_TARGET");
      return OK;
    }
    case "undo":
      return resolveUndoTarget(state) === null ? fail("NOTHING_TO_UNDO") : OK;
    case "request_end": {
      if (state.pendingEndRequest) return fail("END_REQUEST_PENDING");
      if (cmd.kind === "village") {
        const winner = cmd.winnerId ? state.players[cmd.winnerId] : undefined;
        if (!winner || !winner.inGame) return fail("INVALID_TARGET");
      }
      return OK;
    }
    case "respond_end":
      if (!state.pendingEndRequest) return fail("NO_PENDING_REQUEST");
      return ctx.isHost ? OK : fail("NOT_HOST");
    case "withdraw_end":
      if (!state.pendingEndRequest || state.pendingEndRequest.requesterId !== actorId) return fail("NO_PENDING_REQUEST");
      return OK;
  }
}
```

Exporter depuis `src/index.ts`.

- [ ] **Étape 4 : Test de parité (`src/parity.test.ts`)** — fold complet vs application incrémentale :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { buildGameState, reduce } from "./reducer.js";
import { resetSeq, started, degommage, undo, quit, endRequested, endValidated, SEATS_4 } from "./test-helpers.js";

beforeEach(resetSeq);

describe("fold vs incremental parity", () => {
  it("produces identical states on a mixed log", () => {
    const events = [
      started(SEATS_4),
      degommage("u1", "u2"), degommage("u2", "u1"), undo("u3", 3),
      degommage("u4", "u1"), quit("u3"), degommage("u1", "u4"),
      endRequested("u2", "village", "u1"), endValidated("u1", 8),
    ];
    const folded = buildGameState(events);
    const first = events[0];
    if (!first) throw new Error("unreachable");
    let incremental = buildGameState([first]);
    for (const e of events.slice(1)) incremental = reduce(incremental, e);
    expect(incremental).toEqual(folded);
  });
});
```

- [ ] **Étape 5 : Vérifier le vert** — Run: `pnpm --filter @degommix/game-core test && pnpm --filter @degommix/game-core lint && pnpm --filter @degommix/game-core typecheck` — Expected: tous PASS.

- [ ] **Étape 6 : Commit**

```bash
git add packages/game-core
git commit -m "feat(game-core): validateCommand and fold/incremental parity tests"
```

---

## Phase 2 — `packages/db` (Drizzle + Postgres)

### Tâche 7 : Schéma Drizzle complet + migrations

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/auth.ts`, `packages/db/src/schema/friends.ts`, `packages/db/src/schema/games.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/src/client.ts`, `packages/db/src/index.ts`
- Create: `docker-compose.test.yml` (racine)
- Generated: `packages/db/drizzle/0000_*.sql`

**Interfaces:**
- Consumes: enums `CharacterId` de game-core (valeurs recopiées dans les pgEnum — pas d'import runtime croisé nécessaire, mais garder les mêmes littéraux).
- Produces: `createDb(url: string)` → client Drizzle typé ; tables `user`, `session`, `account`, `verification`, `friendRequests`, `friendships`, `games`, `gamePlayers`, `gameEvents` ; migrations SQL appliquables via `drizzle-kit migrate`.

- [ ] **Étape 1 : Package** — `packages/db/package.json` : name `@degommix/db`, `type: module`, scripts `build` (tsc), `typecheck`, `lint`, `test` (`vitest run --passWithNoTests`), `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`). Deps : `drizzle-orm`, `postgres` (driver postgres.js) ; devDeps : `drizzle-kit`, `vitest`. `tsconfig.json` comme game-core.

- [ ] **Étape 2 : Docker compose de test (racine)** — `docker-compose.test.yml` :

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: degommix
      POSTGRES_PASSWORD: degommix
      POSTGRES_DB: degommix_test
    ports:
      - "54329:5432"
```

- [ ] **Étape 3 : Schéma** — transcrire **exactement** le SQL du design §2 en Drizzle.

`src/schema/auth.ts` (tables Better Auth standard + `username`) :

```ts
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username"), // NULL until onboarding is done; max 20 chars enforced by Zod
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("user_username_ci_unique").on(sql`lower(${t.username})`)]);
```

Ajouter `session` (id, userId FK, token unique, expiresAt, ipAddress, userAgent, createdAt, updatedAt), `account` (id, userId FK, accountId, providerId, password, createdAt, updatedAt, accessToken/refreshToken/idToken/scope/expiresAt nullable), `verification` (id, identifier, value, expiresAt, createdAt, updatedAt) et `jwks` (id, publicKey, privateKey, createdAt) — schéma standard Better Auth (`npx @better-auth/cli generate` en Tâche 10 sert de contrôle : le schéma généré doit correspondre ; ajuster ici si l'outil exige d'autres colonnes).

`src/schema/friends.ts` :

```ts
import { pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.js";

export const friendRequestStatus = pgEnum("friend_request_status", ["pending", "accepted", "declined", "canceled"]);

export const friendRequests = pgTable("friend_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderId: text("sender_id").notNull().references(() => user.id),
  receiverId: text("receiver_id").notNull().references(() => user.id),
  status: friendRequestStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("friend_requests_no_self", sql`${t.senderId} <> ${t.receiverId}`),
  uniqueIndex("friend_requests_pending_unique").on(t.senderId, t.receiverId).where(sql`${t.status} = 'pending'`),
]);

export const friendships = pgTable("friendships", {
  userLow: text("user_low").notNull().references(() => user.id),
  userHigh: text("user_high").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userLow, t.userHigh] }),
  check("friendships_canonical", sql`${t.userLow} < ${t.userHigh}`),
]);
```

`src/schema/games.ts` :

```ts
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.js";

export const gameStatus = pgEnum("game_status", ["lobby", "active", "finished"]);
export const gameOutcome = pgEnum("game_outcome", ["village_reached", "aborted"]);
export const characterId = pgEnum("character_id", ["asterix", "obelix", "caius_bonus", "caligula_minus"]);
export const gamePlayerStatus = pgEnum("game_player_status", ["invited", "joined", "declined", "kicked", "left"]);

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  status: gameStatus("status").notNull().default("lobby"),
  format: smallint("format").notNull(),
  hostId: text("host_id").notNull().references(() => user.id),
  winnerId: text("winner_id").references(() => user.id),
  outcome: gameOutcome("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("games_format_check", sql`${t.format} IN (2, 3, 4)`)]);

export const gamePlayers = pgTable("game_players", {
  gameId: uuid("game_id").notNull().references(() => games.id),
  userId: text("user_id").notNull().references(() => user.id),
  status: gamePlayerStatus("status").notNull(),
  character: characterId("character"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
  degommages: integer("degommages").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.gameId, t.userId] }),
  uniqueIndex("game_players_character_unique").on(t.gameId, t.character)
    .where(sql`${t.character} IS NOT NULL AND ${t.status} IN ('invited', 'joined')`),
]);

export const gameEvents = pgTable("game_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  gameId: uuid("game_id").notNull().references(() => games.id),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  actorId: text("actor_id").references(() => user.id),
  targetId: text("target_id").references(() => user.id),
  payload: jsonb("payload"),
  clientEventId: uuid("client_event_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_events_game_seq_unique").on(t.gameId, t.seq),
  index("game_events_game_seq").on(t.gameId, t.seq),
]);
```

`src/schema/index.ts` ré-exporte tout. `src/client.ts` :

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Db = ReturnType<typeof createDb>;
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}
```

`drizzle.config.ts` : dialect `postgresql`, schema `./src/schema/index.ts`, out `./drizzle`, `dbCredentials.url = process.env.DATABASE_URL`.

- [ ] **Étape 4 : Générer et appliquer la migration**

Run:
```bash
docker compose -f docker-compose.test.yml up -d
pnpm install
pnpm --filter @degommix/db db:generate
DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test pnpm --filter @degommix/db db:migrate
```
Expected: migration `0000_*.sql` générée (vérifier qu'elle contient bien `lower("username")` et les deux index partiels `WHERE`), migration appliquée sans erreur. Si drizzle-kit ne génère pas l'index d'expression `lower(username)`, l'ajouter à la main dans le fichier SQL généré.

- [ ] **Étape 5 : Vérifier** — Run: `pnpm turbo run typecheck lint test` — Expected: PASS.

- [ ] **Étape 6 : Commit**

```bash
git add packages/db docker-compose.test.yml pnpm-lock.yaml
git commit -m "feat(db): drizzle schema and initial migration"
```

### Tâche 8 : Utilitaires de test DB

**Files:**
- Create: `packages/db/src/test-utils.ts`
- Test: `packages/db/src/test-utils.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `createDb`, schéma (Tâche 7).
- Produces: `TEST_DATABASE_URL` (constante `postgres://degommix:degommix@localhost:54329/degommix_test`, surchargée par `process.env.TEST_DATABASE_URL`), `migrateTestDb(): Promise<void>` (applique `packages/db/drizzle` via `drizzle-orm/postgres-js/migrator`), `truncateAll(db: Db): Promise<void>` (TRUNCATE toutes les tables sauf migrations, `RESTART IDENTITY CASCADE`), `createTestUser(db: Db, { id, username }): Promise<void>` (insère un user minimal). Utilisés par les tests d'intégration du ws-server (Tâches 14-19) et l'E2E.

- [ ] **Étape 1 : Test rouge** — `test-utils.test.ts` : appeler `migrateTestDb()`, insérer un user via `createTestUser`, `truncateAll`, vérifier `select count(*)` = 0. Run: `pnpm --filter @degommix/db test` → FAIL.
- [ ] **Étape 2 : Implémenter** `test-utils.ts` (résoudre le dossier `drizzle` via `new URL("../drizzle", import.meta.url)`).
- [ ] **Étape 3 : Vérifier** — Run: `docker compose -f docker-compose.test.yml up -d && pnpm --filter @degommix/db test` — Expected: PASS.
- [ ] **Étape 4 : Commit** — `git add packages/db && git commit -m "feat(db): test utilities (migrate, truncate, seed)"`

---

## Phase 3 — `apps/web` : socle Next.js + Better Auth + onboarding

### Tâche 9 : Squelette Next.js 15 + Tailwind 4 + tokens design + env

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx` (placeholder redirigé plus tard)
- Create: `apps/web/src/lib/env.ts`

**Interfaces:**
- Produces: app Next.js bootée ; tokens CSS `--parchment`, `--ink`, `--bronze`, `--asterix`… disponibles globalement ; `env` validé Zod côté serveur. Toutes les tâches web suivantes s'appuient dessus.

- [ ] **Étape 1 : Créer l'app** — `package.json` (name `web`, scripts `dev`, `build`, `start`, `lint`, `typecheck` = `tsc --noEmit`, `test` = `vitest run --passWithNoTests`) avec deps `next@^15`, `react@^19`, `react-dom@^19`, `zod`, `@degommix/game-core: workspace:*`, `@degommix/db: workspace:*`, `tailwindcss@^4`, `@tailwindcss/postcss`. `tsconfig.json` : extends base mais `module: "esnext"`, `moduleResolution: "bundler"`, `jsx: "preserve"`, plugin next. `next.config.ts` : `transpilePackages: ["@degommix/game-core", "@degommix/db"]`.

- [ ] **Étape 2 : Tokens (`globals.css`)** — recopier **exactement** les valeurs de `docs/maquette.html` (lignes 10-60) : bloc `:root { … }` clair (`--parchment:#ece0c4; --parchment-deep:#d9c393; --parchment-line:#c2a978; --ink:#251a10; --ink-soft:#6d5a3f; --ink-faint:#8d7955; --asterix:#b23a2e; --obelix:#2c5b82; --caius:#b9861f; --caligula:#3f6b3c; --bronze:#8c5a2b; --bronze-strong:#6f4620; --bronze-tint:#f1d9ab; --good:#3c7a4d; --bad:#a4372a; --surface:#f6eed7; --surface-2:#fbf6e9; --pawn-opacity:0.10; --shadow:…; --font-display:'Cinzel',…; --font-body:…; --font-mono:…; }`, bloc `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ … } }` et blocs `:root[data-theme="dark"]` / `:root[data-theme="light"]` (valeurs sombres lignes 35-51 de la maquette). Charger Cinzel via `next/font/google` dans `layout.tsx` (variable `--font-display`). `@theme` Tailwind 4 mappant les tokens (`--color-parchment: var(--parchment)`, etc.).

- [ ] **Étape 3 : Layout racine** — `layout.tsx` : `lang="fr"`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, fond `var(--parchment)`, texte `var(--ink)`. `page.tsx` : `<main>Dégommix</main>` provisoire.

- [ ] **Étape 4 : Env (`src/lib/env.ts`)** :

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url(),
});
export const env = schema.parse(process.env);
```

Créer `apps/web/.env.example` avec les 4 clés (valeurs locales : `postgres://degommix:degommix@localhost:54329/degommix_test`, secret dev, `http://localhost:3000`, `http://localhost:3001`).

- [ ] **Étape 5 : Vérifier** — Run: `pnpm install && pnpm --filter web build` — Expected: build Next OK (fournir un `.env` local copié de `.env.example` pour le build). Puis `pnpm turbo run typecheck lint`.

- [ ] **Étape 6 : Commit** — `git add apps/web pnpm-lock.yaml && git commit -m "feat(web): next.js 15 skeleton with design tokens and env validation"`

### Tâche 10 : Better Auth (email + mot de passe, plugin JWT, champ username)

**Files:**
- Create: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/lib/db.ts`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`

**Interfaces:**
- Consumes: `createDb` (Tâche 7), `env` (Tâche 9).
- Produces: `auth` (instance Better Auth serveur : `auth.api.getSession({ headers })`), `authClient` (client React : `signIn.email`, `signUp.email`, `signOut`), endpoints `/api/auth/*` dont `/api/auth/jwks` et `/api/auth/token` (plugin JWT, tokens 15 min). Le JWT contient `sub` = userId et `username`. Consommé par le ws-server (Tâche 12) et tous les écrans.

- [ ] **Étape 1 : Installer** — `pnpm --filter web add better-auth`.

- [ ] **Étape 2 : Config serveur (`src/lib/auth.ts`)** :

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { db } from "./db.js";
import * as schema from "@degommix/db/schema";
import { env } from "./env.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  user: { additionalFields: { username: { type: "string", required: false } } },
  plugins: [
    jwt({
      jwt: {
        expirationTime: "15m",
        definePayload: ({ user }) => ({ username: user.username ?? null }),
      },
    }),
  ],
});
```

`src/lib/db.ts` : `export const db = createDb(env.DATABASE_URL);` (singleton). Route handler `app/api/auth/[...all]/route.ts` : `toNextJsHandler(auth)`.
Exposer le sous-chemin `@degommix/db/schema` dans les `exports` de `packages/db/package.json` si absent.

- [ ] **Étape 3 : Contrôle de schéma** — Run: `pnpm --filter web exec npx @better-auth/cli@latest generate --config src/lib/auth.ts --output /tmp/ba-schema.ts` puis comparer avec `packages/db/src/schema/auth.ts`. Si des colonnes manquent (ex. table `jwks`), les ajouter au schéma + `pnpm --filter @degommix/db db:generate` + migrate.

- [ ] **Étape 4 : Client (`src/lib/auth-client.ts`)** : `createAuthClient` de `better-auth/react` avec `inferAdditionalFields`.

- [ ] **Étape 5 : Vérification manuelle**

Run:
```bash
docker compose -f docker-compose.test.yml up -d
DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test pnpm --filter @degommix/db db:migrate
pnpm --filter web dev &
sleep 5
curl -s -X POST http://localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"email":"test@degommix.fr","password":"motdepasse1","name":"Test"}'
curl -s http://localhost:3000/api/auth/jwks
```
Expected: sign-up renvoie un user JSON ; jwks renvoie `{"keys":[…]}`. Tuer le serveur dev ensuite.

- [ ] **Étape 6 : Commit** — `git add apps/web packages/db && git commit -m "feat(web): better auth with jwt plugin and username field"`

### Tâche 11 : Écrans login / register / onboarding pseudo + garde globale

**Files:**
- Create: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/register/page.tsx`, `apps/web/src/app/(auth)/onboarding/page.tsx`, `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/api/username/check/route.ts`, `apps/web/src/app/api/username/route.ts` (POST : fixer le pseudo)
- Create: `apps/web/src/lib/session.ts` (helper `requireSession()` / `requireOnboardedSession()`)
- Create: `apps/web/src/components/ui/field.tsx` (input + label + erreur inline, style maquette)

**Interfaces:**
- Consumes: `auth`, `authClient` (Tâche 10).
- Produces: `requireOnboardedSession(): Promise<{ user: { id: string; username: string } }>` — redirige `/login` si non connecté, `/onboarding` si `username` NULL. Utilisé par tous les écrans à onglets. `POST /api/username` body `{ username }` (Zod : 1-20 chars, `^[a-zA-Z0-9_.-]+$`) → 200 ou 409 `USERNAME_TAKEN` (contrainte `lower(username)` attrapée). `GET /api/username/check?u=` → `{ available: boolean }`.

- [ ] **Étape 1 : Pages auth** — formulaires client (`"use client"`) email + mot de passe, validation Zod inline, erreurs en français (« Email ou mot de passe incorrect », « Cet email est déjà utilisé »). Register → `authClient.signUp.email` → redirect `/onboarding`. Login → redirect `/` (la garde renverra vers `/onboarding` si besoin). Style : carte parchemin, titre Cinzel, wordmark « DÉGOMMIX » (voir header de la maquette). Pas de « mot de passe oublié ».

- [ ] **Étape 2 : Onboarding** — input pseudo (maxLength 20), disponibilité live (`/api/username/check`, debounce 300 ms), aperçu avatar (initiale majuscule dans un anneau `border: 2px solid var(--bronze)` sur fond `--bronze-tint`, cf. classe `.avatar` de la maquette). CTA « C'est parti » → POST `/api/username` → redirect `/`.

- [ ] **Étape 3 : Route username** — POST : session requise, Zod, `update(user).set({ username }).where(eq(user.id, session.user.id))` avec catch de la violation d'unicité → 409. Refuser si l'utilisateur a déjà un username (400).

- [ ] **Étape 4 : Garde (`src/lib/session.ts`)** :

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth.js";

export async function requireOnboardedSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!session.user.username) redirect("/onboarding");
  return { user: { id: session.user.id, username: session.user.username } };
}
```

- [ ] **Étape 5 : Vérification** — Run: `pnpm --filter web build && pnpm turbo run typecheck lint`. Puis manuel : `pnpm --filter web dev`, parcours inscription → onboarding → pseudo pris deux fois (le 2ᵉ compte reçoit « Ce pseudo est déjà pris »).

- [ ] **Étape 6 : Commit** — `git add apps/web && git commit -m "feat(web): login, register and username onboarding with global guard"`

---

## Phase 4 — `apps/ws-server` (temps réel autoritaire)

Tous les tests d'intégration : Vitest + `socket.io-client`, serveur sur port éphémère, Postgres de test (Tâche 8), `truncateAll` entre les tests (design §7.2). Fichier de setup partagé créé en Tâche 12.

### Tâche 12 : Squelette ws-server + handshake JWT + harnais d'intégration

**Files:**
- Create: `apps/ws-server/package.json`, `apps/ws-server/tsconfig.json`, `apps/ws-server/vitest.config.ts`
- Create: `apps/ws-server/src/env.ts`, `apps/ws-server/src/server.ts`, `apps/ws-server/src/index.ts`, `apps/ws-server/src/auth.ts`
- Create: `apps/ws-server/test/harness.ts`
- Test: `apps/ws-server/test/handshake.test.ts`

**Interfaces:**
- Consumes: `@degommix/db` (client + test-utils), `@degommix/game-core`.
- Produces: `createServer(deps: { db: Db; verifyToken: (token: string) => Promise<{ userId: string }> }): { io: Server; httpServer: http.Server }` — factory injectable (les tests injectent un `verifyToken` factice signé localement) ; `src/auth.ts` exporte `makeJwksVerifier(jwksUrl: string)` (jose `createRemoteJWKSet` + `jwtVerify`, cache, erreur → `AUTH_FAILED`). Harnais : `startTestServer()` → `{ url, io, db, stop }` et `connectAs(url, userId)` → socket client authentifié (token signé avec la clé de test) ; consommés par toutes les tâches 13-18.

- [ ] **Étape 1 : Package** — deps : `socket.io`, `jose`, `zod`, `@degommix/db`, `@degommix/game-core` ; devDeps : `socket.io-client`, `vitest`, `tsx`. Scripts : `dev` (`tsx watch src/index.ts`), `build` (tsc), `start` (`node dist/index.js`), `test`, `typecheck`, `lint`. `src/env.ts` : Zod sur `DATABASE_URL`, `WEB_ORIGIN`, `JWKS_URL` (défaut `${WEB_ORIGIN}/api/auth/jwks`), `PORT` (défaut 3001).

- [ ] **Étape 2 : Test rouge (`test/handshake.test.ts`)** — via le harnais : (a) connexion avec token valide → event `connect` reçu ; (b) token invalide/absent → `connect_error` avec `err.message === "AUTH_FAILED"`. Le harnais génère une paire de clés jose en mémoire (`generateKeyPair("EdDSA")`), signe les tokens de test (`sub` = userId), et injecte un `verifyToken` qui vérifie contre cette clé. Run: `pnpm --filter ws-server test` → FAIL.

- [ ] **Étape 3 : Implémenter `createServer`** — `http.createServer()` + `new Server(httpServer, { cors: { origin: env.WEB_ORIGIN } })` ; middleware :

```ts
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth["token"];
    if (typeof token !== "string") throw new Error();
    const { userId } = await deps.verifyToken(token);
    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("AUTH_FAILED"));
  }
});
io.on("connection", (socket) => { void socket.join(`user:${socket.data.userId}`); });
```

`src/index.ts` (entrée prod) : `createServer({ db: createDb(env.DATABASE_URL), verifyToken: makeJwksVerifier(env.JWKS_URL) })` + `httpServer.listen(env.PORT)` + route HTTP `GET /health` → `200 ok`.

- [ ] **Étape 4 : Vert** — Run: `docker compose -f docker-compose.test.yml up -d && pnpm --filter ws-server test` — Expected: PASS.
- [ ] **Étape 5 : Commit** — `git add apps/ws-server pnpm-lock.yaml && git commit -m "feat(ws-server): socket.io server with jwt handshake and test harness"`

### Tâche 13 : Présence (rooms, compteur de sockets, diffusion aux amis)

**Files:**
- Create: `apps/ws-server/src/presence.ts`
- Modify: `apps/ws-server/src/server.ts`
- Test: `apps/ws-server/test/presence.test.ts`

**Interfaces:**
- Consumes: harnais (T12), table `friendships` (T7).
- Produces: `PresenceTracker` : `onConnect(userId)`, `onDisconnect(userId)`, `getPresence(userId): Presence`, `setInGame(userId, inGame)` ; broadcast `presence:update` `{ userId, presence }` vers `user:{friendId}` de chaque ami à chaque transition. Ping/pong Socket.IO : `pingInterval: 25000, pingTimeout: 20000` dans les options du serveur. Consommé par T14 (liste amis) et T16 (in_game).

- [ ] **Étape 1 : Tests rouges** — (a) u2 (ami de u1 via insert `friendships`) connecté reçoit `presence:update {u1, online}` quand u1 se connecte ; (b) u1 ouvre 2 sockets, en ferme 1 → pas de passage offline ; ferme la 2ᵉ → `offline` ; (c) non-ami ne reçoit rien. Run → FAIL.
- [ ] **Étape 2 : Implémenter** — Map `userId → Set<socketId>` ; requête amis (`friendships` où `userLow = me OR userHigh = me`) ; émettre sur chaque `user:{friendId}`.
- [ ] **Étape 3 : Vert** — Run: `pnpm --filter ws-server test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): presence tracking with friend broadcast"`

### Tâche 14 : Commandes amis + rate limiting

**Files:**
- Create: `apps/ws-server/src/handlers/friends.ts`, `apps/ws-server/src/rate-limit.ts`, `apps/ws-server/src/ack.ts`
- Modify: `apps/ws-server/src/server.ts`
- Test: `apps/ws-server/test/friends.test.ts`

**Interfaces:**
- Consumes: harnais, presence, schéma friends.
- Produces: événements `friends:request {receiverId}` → `{requestId}`, `friends:respond {requestId, accept}`, `friends:cancel {requestId}`, `friends:remove {friendId}` (design §4.3) ; broadcast `friends:event { kind: "request_received" | "request_accepted" | "request_canceled", requestId, from: { id, username } }` sur `user:{id}` (§4.4). `src/ack.ts` : `withAck(schema, handler)` — wrapper générique : parse Zod du payload (payload malformé → `{ok:false, code:"INTERNAL", message:"invalid payload"}`), try/catch autour du handler (erreur inattendue → `{ok:false, code:"INTERNAL"}` + `console.error` structuré). `RateLimiter` en mémoire (fenêtre glissante) : clé `socketId:eventName`, config par événement. Réutilisés par T15-18.

- [ ] **Étape 1 : Tests rouges** — accepter crée la ligne `friendships` canonique (low < high) ; demande dupliquée refusée (index partiel → mappée sur un ack `{ok:false}`) ; demande à un ami existant refusée ; annulation → statut `canceled` puis renvoyable (nouvelle ligne pending OK) ; `friends:remove` supprime la ligne et **n'émet rien** vers l'ex-ami (assert absence d'événement pendant 200 ms) ; 11ᵉ `friends:request` en 1 min → `RATE_LIMITED`. Run → FAIL.
- [ ] **Étape 2 : Implémenter** — handlers Drizzle transactionnels ; rate limit : `friends:*` et recherche 10/min.
- [ ] **Étape 3 : Vert** — `pnpm --filter ws-server test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): friends commands with rate limiting"`

### Tâche 15 : Lobby complet (create, code, invitations, personnages, format, kick, leave)

**Files:**
- Create: `apps/ws-server/src/handlers/lobby.ts`, `apps/ws-server/src/game-code.ts`, `apps/ws-server/src/lobby-state.ts`
- Modify: `apps/ws-server/src/server.ts`
- Test: `apps/ws-server/test/lobby.test.ts`, `apps/ws-server/src/game-code.test.ts`

**Interfaces:**
- Consumes: harnais, tables games/gamePlayers.
- Produces (design §4.3-4.4) : `lobby:create {format}` → `{gameId, code}` (refus `ALREADY_IN_GAME` si EXISTS partie non-finished où je suis invited/joined) ; `lobby:invite {gameId, friendId}` (ami uniquement, refus si ami déjà en partie) → broadcast `invite:received {gameId, hostUsername, format}` sur `user:{friendId}` ; `lobby:cancel_invite` (host only) → `invite:canceled` ; `lobby:respond_invite {gameId, accept}` ; `lobby:join_by_code {code}` → `{gameId, lobbyState}` (`INVALID_CODE` si inexistant ou `status !== 'lobby'`, `LOBBY_FULL`) ; `lobby:pick_character {gameId, character}` (`CHARACTER_TAKEN` via index unique partiel — premier arrivé au serveur) ; `lobby:set_format` (host, `FORMAT_INCOMPATIBLE` si joueurs+invites > format) ; `lobby:kick` (host) → `game:kicked` sur `user:{id}` + sortie de room ; `lobby:leave` (host seul restant → dissolution `finished/aborted`). Chaque mutation rebroadcast `lobby:state` intégral sur `game:{id}` : `{ gameId, code, format, hostId, players: [{ userId, username, status, character }] }` (type `LobbyState` exporté de `lobby-state.ts`, importé plus tard par le front). `generateGameCode()` : alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 6 chars, `crypto.randomInt` ; boucle d'insertion bornée à 5 essais sur collision.

- [ ] **Étape 1 : Tests unitaires `game-code.test.ts`** — longueur 6, alphabet respecté (regex `^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$` sur 200 tirages). Puis tests d'intégration rouges `lobby.test.ts` : create → join par code → pick des personnages ; **conflit simultané** : deux `lobby:pick_character` concurrents sur `obelix` (Promise.all) → exactement un `{ok:true}` et un `{ok:false, code:"CHARACTER_TAKEN"}` ; kick → le kické reçoit `game:kicked` ; set_format 4→2 avec 3 joueurs → `FORMAT_INCOMPATIBLE` ; create alors que déjà dans un lobby → `ALREADY_IN_GAME` ; join d'un code de lobby dissous → `INVALID_CODE`. Run → FAIL.
- [ ] **Étape 2 : Implémenter** — statuts `game_players` : invité=`invited`, accepté/join=`joined` (+`joinedAt: now()`), refus=`declined`, kick=`kicked`, départ=`left`. Rooms : join `game:{id}` à l'acceptation/join, leave au kick/leave.
- [ ] **Étape 3 : Vert** — `pnpm --filter ws-server test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): full lobby flow with character picking and codes"`

### Tâche 16 : `lobby:start` + GameManager (file par partie, seq, idempotence) + `DEGOMMAGE`

**Files:**
- Create: `apps/ws-server/src/game-manager.ts`
- Create: `apps/ws-server/src/handlers/game.ts`
- Modify: `apps/ws-server/src/server.ts`, `apps/ws-server/src/handlers/lobby.ts`
- Test: `apps/ws-server/test/game-commands.test.ts`

**Interfaces:**
- Consumes: `buildGameState`, `reduce`, `validateCommand`, `resolveUndoTarget` (game-core) ; harnais.
- Produces: classe `GameManager` — cœur de la sérialisation (design §4.6) :

```ts
export class GameManager {
  constructor(private db: Db, private io: Server) {}
  // one in-memory promise chain per gameId = mutex; state cache rebuilt from DB on first access
  submitCommand(gameId: string, actorId: string, clientEventId: string, command: Command): Promise<Ack<{ seq: number }>>;
  appendSystemEvent(gameId: string, event: Omit<GameEvent, "seq" | "createdAt">): Promise<void>; // zombie job
  getState(gameId: string): Promise<GameState | null>;
  getEventsSince(gameId: string, lastSeq: number): Promise<GameEvent[]>;
}
```

Pipeline `submitCommand` : file par partie → idempotence (`SELECT seq FROM game_events WHERE client_event_id = $1` → si présent, ack `{ok:true, seq}` sans append ni broadcast) → `validateCommand` sur l'état mémoire → traduction commande→événement(s) (undo : `targetSeq` résolu **serveur** via `resolveUndoTarget`) → transaction (INSERT événement(s) avec `seq = lastSeq + 1…`, UPDATE `games.last_activity_at`, et dénormalisations si clôture) → `reduce` sur l'état mémoire → broadcast `game:event` (un par événement appendé) sur `game:{id}`.
`lobby:start` (host only ; sièges complets = joueurs `joined` === format, tous avec personnage, zéro `invited` pending sinon `PENDING_INVITES`) : transaction — `games.status='active'`, `started_at=now()`, personnages figés, INSERT `GAME_STARTED` seq 1 → ack `{ firstEvents: [gameStartedEvent] }` + broadcast.

- [ ] **Étape 1 : Tests rouges** — lobby 2 joueurs lancé puis : (a) start bloqué par invitation pending puis débloqué après `lobby:cancel_invite` ; (b) 3 dégommages émis par u1 → les 2 clients reçoivent les `game:event` **dans le même ordre de seq** (1..4) ; (c) **idempotence** : ré-émission du même `clientEventId` → même `seq` en ack, `SELECT count(*)` sur `game_events` inchangé, aucun re-broadcast ; (d) commande d'un non-membre → `NOT_MEMBER` ; (e) auto-dégommage → `INVALID_TARGET`. Run → FAIL.
- [ ] **Étape 2 : Implémenter** GameManager + handlers + start.
- [ ] **Étape 3 : Vert** — `pnpm --filter ws-server test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): game manager with per-game queue, seq and idempotency"`

### Tâche 17 : Undo, demandes de fin, clôture + dénormalisations

**Files:**
- Modify: `apps/ws-server/src/game-manager.ts`, `apps/ws-server/src/handlers/game.ts`
- Create: `apps/ws-server/src/finalize.ts`
- Test: `apps/ws-server/test/game-end.test.ts`

**Interfaces:**
- Consumes: GameManager (T16).
- Produces: traitement complet de `game:command` pour `undo` / `request_end {kind, winnerId?}` / `respond_end {accept}` / `withdraw_end` (design §3.4) : host demandeur → `END_REQUESTED` + `END_VALIDATED` appendés dans la même transaction (le client envoie `request_end` normal, le serveur détecte `actorId === hostId` et auto-valide) ; `respond_end {accept:false}` → `END_REJECTED` ; `withdraw_end` → `END_REJECTED` avec `actorId` = demandeur ; abandon individuel validé → `PLAYER_QUIT` appendé dans la même transaction (+ `game_players.status='left'`, `left_at`). `finalize.ts` : `finalizeGame(tx, gameId, state)` — appelé quand `reduce` fait passer l'état à `finished` : UPDATE `games` (`status`, `outcome`, `winner_id`, `ended_at`) + recalcul `game_players.degommages` depuis les événements non annulés.

- [ ] **Étape 1 : Tests rouges** — (a) undo concurrent : 2 dégommages puis deux `undo` simultanés (Promise.all) → deux `UNDO` avec des `targetSeq` **distincts**, compteur final 0 ; (b) undo sur journal vide → `NOTHING_TO_UNDO` ; (c) village : demande par non-host, validation host → `games.winner_id`/`outcome`/`ended_at` corrects en DB, `game_players.degommages` recalculés (avec un undo au milieu pour vérifier le non-comptage) ; (d) demande host → **deux** événements appendés (`END_REQUESTED` puis `END_VALIDATED`), un seul ack ; (e) rejet → la partie continue ; (f) 2ᵉ demande pendant une pendante → `END_REQUEST_PENDING` ; (g) abandon individuel en 3 joueurs → `PLAYER_QUIT` appendé, partie continue ; en 2 joueurs → partie `aborted` ; (h) toute commande après clôture → `GAME_FINISHED`. Run → FAIL.
- [ ] **Étape 2 : Implémenter.**
- [ ] **Étape 3 : Vert** — `pnpm --filter ws-server test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): undo and end-of-game flows with finalization"`

### Tâche 18 : Resync, reprise de room, transfert d'host, job zombie, replay

**Files:**
- Create: `apps/ws-server/src/host-transfer.ts`, `apps/ws-server/src/zombie-job.ts`
- Modify: `apps/ws-server/src/server.ts`, `apps/ws-server/src/handlers/game.ts`, `apps/ws-server/src/handlers/lobby.ts`
- Test: `apps/ws-server/test/resilience.test.ts`

**Interfaces:**
- Consumes: GameManager, PresenceTracker, harnais (timers factices : `vi.useFakeTimers` — injecter `setTimeout`/`clearTimeout` et `now()` dans host-transfer et zombie-job pour les rendre testables).
- Produces:
  - `game:resync {gameId, lastSeq}` → `{ events, serverNow }` (`events` = seq > lastSeq dans l'ordre ; `serverNow = Date.now()` pour le chrono client).
  - Au handshake : si l'utilisateur a une partie/lobby actif → `socket.join('game:'+id)` + émission immédiate de `lobby:state` (lobby) ou `game:resync`-équivalent (`game:state_snapshot { events, serverNow, hostId }`).
  - Transfert d'host (§4.7) : à la déconnexion de la **dernière** socket de l'host, timer 60 s (annulé à la reconnexion) ; à échéance → nouvel host = joueur `joined` **connecté** au `joined_at` le plus ancien ; UPDATE `games.host_id` + broadcast `game:host_changed {newHostId}`. Valable lobby et partie. Host qui `lobby:leave` avec d'autres joueurs → même règle immédiate.
  - Job zombie : `setInterval` 15 min — parties `active` avec `last_activity_at < now() - 24h` → `appendSystemEvent(GAME_AUTO_CLOSED {reason:'zombie'})` via la file (finalisation incluse).
  - `replay:create {finishedGameId}` → `{gameId, code}` : nouveau lobby, host = émetteur, mêmes joueurs ré-invités (`invited` + `invite:received`) ; refus `ALREADY_IN_GAME` si l'émetteur a déjà une partie active.

- [ ] **Étape 1 : Tests rouges** — (a) client A déconnecté, 4 événements passent, A se reconnecte et émet `game:resync {lastSeq:2}` → reçoit exactement les seq 3-6 ; (b) refresh simulé (`lastSeq: 0`) → journal complet ; (c) host déconnecté, avance de 61 s (fake timers) → `game:host_changed` vers le plus ancien connecté, l'ancien host revenu est simple joueur ; reconnexion avant 60 s → pas de transfert ; (d) horloge à +24 h + tick du job → partie `aborted`, événement `GAME_AUTO_CLOSED` en base ; (e) `replay:create` → nouveau lobby avec les mêmes joueurs invités, code différent. Run → FAIL.
- [ ] **Étape 2 : Implémenter.**
- [ ] **Étape 3 : Vert** — `pnpm --filter ws-server test && pnpm turbo run typecheck lint test` — PASS.
- [ ] **Étape 4 : Commit** — `git commit -am "feat(ws-server): resync, host transfer, zombie job and replay"`

---

## Phase 5 — `apps/web` : assets, design system, écrans

### Tâche 19 : Préparation des assets personnages + icônes

**Files:**
- Create: `scripts/prepare-characters.mjs`, `scripts/character-crops.json`
- Create: `apps/web/public/characters/{asterix,obelix,caius-bonus,caligula-minus}.png` (détourés) et `…-head.png` (crops têtes, carrés)
- Create: `apps/web/src/components/icons.tsx`

**Interfaces:**
- Consumes: `assets/characters/*.png` (fond parchemin, 435 px), sprite SVG de `docs/maquette.html`.
- Produces: PNG détourés (alpha) + crops têtes 256×256 utilisés par `CharBadge` (T20), Live, Résumé, Classement. `icons.tsx` : composant `<Icon name="…" size={24} />` (stroke 1.8, grille 24) avec les noms utilisés par la maquette : `home`, `friends`, `play`, `trophy`, `sword`, `clock`, `undo`, `flag`, `plus`, `search`, `check`, `close`, `crown`, `pawn`, `share`, `exit`.

- [ ] **Étape 1 : Script de détourage** — `pnpm add -D -w sharp`. `scripts/prepare-characters.mjs` : pour chaque PNG source, échantillonner la couleur des 4 coins (fond parchemin quasi uniforme), passer en alpha tout pixel dont la distance euclidienne RGB à cette couleur est < 48 (flood fill depuis les bords pour ne pas trouer l'intérieur : implémenter un BFS sur le masque), léger `blur(0.4)` sur le canal alpha pour adoucir le bord, `trim` puis export vers `apps/web/public/characters/`. Crops têtes : lire `scripts/character-crops.json` — boîtes initiales `{ "asterix": {left:0.18,top:0.02,size:0.62}, "obelix": {left:0.22,top:0.00,size:0.5}, "caius-bonus": {left:0.2,top:0.0,size:0.5}, "caligula-minus": {left:0.2,top:0.0,size:0.5} }` (fractions de la largeur), extraire, redimensionner en 256×256, export `…-head.png`.

- [ ] **Étape 2 : Prévisualisation et ajustement** — le script génère aussi `scripts/characters-preview.html` (les 8 images sur fond quadrillé clair/sombre + dans un cercle CSS pour les têtes). Run: `node scripts/prepare-characters.mjs && open scripts/characters-preview.html`. Inspecter (via lecture du fichier image par l'agent) : contours propres, tête entière et centrée dans le cercle. Ajuster `character-crops.json` et relancer jusqu'à satisfaction.

- [ ] **Étape 3 : Vérifier l'alpha** — Run: `node -e "import('sharp').then(async ({default:s})=>{for (const n of ['asterix','obelix','caius-bonus','caligula-minus']) { const m=await s('apps/web/public/characters/'+n+'.png').metadata(); if(!m.hasAlpha) throw new Error(n); } console.error('alpha OK')})"` — Expected: `alpha OK`.

- [ ] **Étape 4 : Icônes** — extraire le `<svg>` sprite de `docs/maquette.html` (bloc `<defs>` avec les `<symbol id="icon-…">`) dans `icons.tsx` : un objet `paths: Record<IconName, ReactNode>` + composant `Icon` (`stroke="currentColor"`, `strokeWidth={1.8}`, `viewBox="0 0 24 24"`, `fill="none"`). **Note assumée v1** : c'est le set de substitution de la maquette (mêmes conventions que Nucleo) ; l'export Nucleo réel (webapp Nucleo, compte Chrome connecté) est une étape manuelle humaine — signaler dans le rapport de tâche qu'elle reste à faire par Tristan, les noms/props ne changeront pas.

- [ ] **Étape 5 : Vérifier + commit**

```bash
pnpm turbo run typecheck lint
git add scripts apps/web/public/characters apps/web/src/components/icons.tsx package.json pnpm-lock.yaml
git commit -m "feat(web): character asset pipeline and icon set"
```

### Tâche 20 : Design system (composants de base)

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`, `card.tsx`, `avatar.tsx`, `char-badge.tsx`, `stat-tile.tsx`, `sheet.tsx` (bottom sheet), `toast.tsx` (provider + hook `useToast`), `banner.tsx`
- Create: `apps/web/src/components/theme-toggle.tsx`, `apps/web/src/lib/characters.ts`

**Interfaces:**
- Consumes: tokens (T9), assets + icônes (T19).
- Produces (props exactes, consommées par T22-27) :
  - `lib/characters.ts` : `CHARACTER_META: Record<CharacterId, { label: string; colorVar: string; slug: string }>` (labels français « Astérix », « Obélix », « Caïus Bonus », « Caligula Minus » ; `slug` = nom de fichier ; `colorVar` = `var(--asterix)` etc.).
  - `<Button variant="primary" | "secondary" | "danger" | "ghost" fullWidth? disabled? onClick?>` — primary = fond bronze, texte parchemin, Cinzel, coins 12px (classe `.btn` maquette).
  - `<Avatar username size={32|44|56} />` — initiale + anneau bronze.
  - `<CharBadge character size="sm"|"md"|"lg" />` — cercle bordé de la couleur du personnage, image `…-head.png` (classes `.char-badge` maquette).
  - `<Card>`, `<StatTile icon label value />`, `<Sheet open onClose title>` (montée du bas, backdrop), `<ToastProvider>` + `useToast(): (msg: string) => void`, `<Banner tone="info"|"action">`.
  - `<ThemeToggle />` : cycle système→clair→sombre, pose `data-theme` sur `<html>`, persiste en `localStorage("degommix-theme")`, script inline anti-flash dans `layout.tsx`.
- Style : reprendre les classes correspondantes de `docs/maquette.html` (les convertir en CSS modules ou classes Tailwind sur les tokens — rester fidèle : textures parchemin, ombres `--shadow`, Cinzel pour titres/boutons).

- [ ] **Étape 1 : Implémenter les composants** (fichiers listés, props ci-dessus, styles depuis la maquette).
- [ ] **Étape 2 : Page de démo temporaire** — `apps/web/src/app/dev/ui/page.tsx` affichant tous les composants dans les deux thèmes (page conservée, exclue de la prod par un `notFound()` si `process.env.NODE_ENV === "production"`).
- [ ] **Étape 3 : Vérifier** — Run: `pnpm --filter web build && pnpm turbo run typecheck lint`. Manuel : `pnpm --filter web dev` → `http://localhost:3000/dev/ui`, contrôle visuel clair/sombre.
- [ ] **Étape 4 : Commit** — `git add apps/web && git commit -m "feat(web): design system components"`

### Tâche 21 : Tab bar « liquid glass » + layout à onglets

**Files:**
- Create: `apps/web/src/components/tab-bar.tsx`, `apps/web/src/app/(tabs)/layout.tsx`
- Create: `apps/web/src/app/(tabs)/page.tsx`, `(tabs)/amis/page.tsx`, `(tabs)/jouer/page.tsx`, `(tabs)/classement/page.tsx` (placeholders « en construction » remplacés en T23-27)

**Interfaces:**
- Consumes: `Icon` (T19), `requireOnboardedSession` (T11).
- Produces: layout `(tabs)` = garde session + `<TabBar />` fixée en bas ; 4 onglets Accueil `/`, Amis `/amis`, Jouer `/jouer`, Classement `/classement`. Effet liquid glass : conteneur pilule `backdrop-filter: blur(18px) saturate(1.4)`, fond translucide sur token, bulle indicatrice absolue qui glisse sous l'onglet actif (`transition: transform 350ms cubic-bezier(0.34,1.56,0.64,1)`), léger squash à la transition ; `padding-bottom: env(safe-area-inset-bottom)` ; reprendre la structure `.tabbar` de la maquette. La tab bar n'existe pas hors du groupe `(tabs)` (donc masquée d'office sur `/partie/*`, `/lobby/*`, auth).

- [ ] **Étape 1 : Implémenter** (composant client, `usePathname` pour l'onglet actif).
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel : navigation entre les 4 onglets, animation de la bulle, safe-area OK en simulateur mobile (devtools).
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): liquid glass tab bar and tabs layout"`

### Tâche 22 : Client socket + hooks temps réel + mapping erreurs

**Files:**
- Create: `apps/web/src/lib/socket.ts`, `apps/web/src/lib/ws-errors.ts`
- Create: `apps/web/src/components/socket-provider.tsx`
- Create: `apps/web/src/hooks/use-game.ts`, `apps/web/src/hooks/use-lobby.ts`, `apps/web/src/hooks/use-invites.ts`
- Modify: `apps/web/src/app/(tabs)/layout.tsx` (envelopper dans `SocketProvider`)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_WS_URL`, `/api/auth/token` (T10), types game-core.
- Produces:
  - `SocketProvider` : récupère le JWT (`GET /api/auth/token` → `{token}`), ouvre `io(NEXT_PUBLIC_WS_URL, { auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 5000 })` ; sur token expiré à la reconnexion → re-fetch du token ; expose `useSocket(): { socket: Socket | null; connected: boolean }` ; bandeau « Reconnexion… » discret quand `!connected`.
  - `emitWithAck<T>(socket, event, payload): Promise<Ack<T>>` — wrapper typé ; pour `game:command` : **retry** même `clientEventId` si pas d'ack sous 3 s, 3 tentatives (~10 s), puis toast « Action non transmise — vérifie ta connexion » (design §4.5).
  - `useGame(gameId)` : état = `GameState | null` via `buildGameState`/`reduce` sur les `game:event` reçus ; à la connexion/reconnexion émet `game:resync {lastSeq}` ; ignore les seq déjà connus ; trou de seq → resync défensif ; expose `{ state, hostId, serverOffset, sendCommand(cmd): Promise<Ack<{seq:number}>> }` (`clientEventId` = `crypto.randomUUID()` par tap). Écoute `game:host_changed`, `game:state_snapshot`.
  - `useLobby(gameId)` : état `LobbyState` via `lobby:state`, + actions typées (`pickCharacter`, `invite`, `kick`, `setFormat`, `start`, `leave`, `cancelInvite`).
  - `useInvites()` : liste des `invite:received` reçues (et retraits via `invite:canceled`) pour la bannière Accueil et l'onglet Jouer.
  - `ws-errors.ts` : `wsErrorMessage(code: ErrorCode): string` — mapping français complet des 21 codes (ex. `CHARACTER_TAKEN` → « Trop tard, ce personnage est déjà pris » ; `ALREADY_IN_GAME` → « Tu as déjà une partie en cours » ; `INTERNAL` → « Une erreur est survenue, réessaie »).

- [ ] **Étape 1 : Installer** — `pnpm --filter web add socket.io-client`.
- [ ] **Étape 2 : Implémenter** les fichiers ci-dessus.
- [ ] **Étape 3 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint`. Manuel : lancer ws-server + web (`pnpm dev` à la racine, `.env` locaux), vérifier dans les devtools la connexion socket authentifiée (frame engine.io) et le bandeau reconnexion en coupant le ws-server.
- [ ] **Étape 4 : Commit** — `git add apps/web && git commit -m "feat(web): socket client, realtime hooks and error mapping"`

### Tâche 23 : Écran Accueil

**Files:**
- Modify: `apps/web/src/app/(tabs)/page.tsx`
- Create: `apps/web/src/lib/queries/home.ts`, `apps/web/src/components/home/game-history-item.tsx`, `apps/web/src/components/home/invite-banner.tsx`, `apps/web/src/components/home/resume-banner.tsx`

**Interfaces:**
- Consumes: session (T11), db, `useInvites` (T22).
- Produces: `getLastGames(userId): Promise<HomeGame[]>` — 20 dernières parties `finished` où je suis `joined` : `{ id, outcome, winnerUsername, myResult: "won" | "lost" | "aborted", format, durationSec, endedAt, participants: { username, character }[] }` ; `getActiveGame(userId): Promise<{ gameId, status: "lobby" | "active" } | null>` — réutilisé par toutes les pages à onglets pour la bannière « Reprendre la partie » (placée dans le layout `(tabs)`).
- Contenu (design §5.2) : bannière invitation temps réel (accepter → `/lobby/[id]`, décliner), bannière reprendre (→ `/lobby/[id]` ou `/partie/[id]`), header wordmark + `ThemeToggle` + avatar, liste des 20 parties (résultat, format, durée, participants en mini-badges, heure relative) → `/parties/[id]`. État vide illustré (« Aucune partie — lance ta première ! »).

- [ ] **Étape 1 : Implémenter** (Server Component pour la liste ; bannières en client).
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel avec des parties de test insérées via un script SQL rapide dans la DB locale.
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): home screen with history and banners"`

### Tâche 24 : Écrans Amis + profil ami + recherche

**Files:**
- Create: `apps/web/src/app/(tabs)/amis/page.tsx` (remplace le placeholder), `apps/web/src/app/amis/[userId]/page.tsx`
- Create: `apps/web/src/app/api/users/search/route.ts`
- Create: `apps/web/src/lib/queries/friends.ts`, `apps/web/src/lib/queries/stats.ts` (stats individuelles)
- Create: `apps/web/src/components/friends/friend-row.tsx`, `request-row.tsx`, `search-bar.tsx`

**Interfaces:**
- Consumes: commandes WS amis (T14), `presence:update` (T13), db.
- Produces:
  - `GET /api/users/search?q=` (session requise, Zod min 2 chars, max 20, ILIKE `%q%` sur username, limite 10, exclut soi) → `{ users: { id, username, relation: "none" | "friend" | "pending_sent" | "pending_received" }[] }`.
  - `queries/friends.ts` : `getFriendsPageData(userId)` → demandes reçues, demandes envoyées, amis (`{ id, username }[]`) ; `areFriends(a, b): Promise<boolean>` (réutilisé par les gardes 403 de T24/T27).
  - `queries/stats.ts` : `getPlayerStats(userId)` → `{ wins, winrate, degommages, favoriteCharacter, gamesPlayed }` — SQL du design §5.3 : wins = `winner_id = user` ; dénominateur winrate = parties `village_reached` où statut `joined` ; dégommages = somme non annulée toutes parties finies (via `game_players.degommages` dénormalisé) ; fétiche = personnage le plus joué (parties finished démarrées), égalité → le plus récent. Réutilisé par le Classement (T27).
- Écran Amis : recherche (debounce 300 ms, bouton « Ajouter » → `friends:request`), 3 sections (reçues : accepter/refuser ; envoyées : annuler ; amis : pastille présence temps réel verte/bronze/grise + « Inviter » si lobby actif possible + suppression via confirmation dans une `Sheet`). Profil ami `/amis/[userId]` : 403 → écran « Profil réservé aux amis » si `!areFriends` ; sinon stats + fétiche avec `CharBadge`.

- [ ] **Étape 1 : Implémenter** (page Amis en client component nourri par un fetch initial SSR + événements WS).
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel à 2 comptes (2 navigateurs) : demande, acceptation, présence qui bascule, suppression silencieuse.
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): friends screens with realtime presence and search"`

### Tâche 25 : Écrans Jouer + Lobby

**Files:**
- Create: `apps/web/src/app/(tabs)/jouer/page.tsx` (remplace le placeholder), `apps/web/src/app/lobby/[gameId]/page.tsx`
- Create: `apps/web/src/components/lobby/seat-card.tsx`, `character-grid.tsx`, `host-controls.tsx`, `code-display.tsx`

**Interfaces:**
- Consumes: `useLobby`, `useInvites`, `emitWithAck` (T22), design system.
- Produces: navigation `lobby:create` → `router.push('/lobby/'+gameId)` ; `lobby:start` ok → tous les clients naviguent vers `/partie/[gameId]` (déclenché à réception du premier `game:event` `GAME_STARTED` ou de l'ack start pour l'host).
- Écran Jouer : CTA « Créer une partie » (sélecteur format 2/3/4 dans une `Sheet`) + « Rejoindre » (champ code 6 chars uppercase auto, `lobby:join_by_code`) + liste des invitations en attente (accepter/décliner). Erreurs en toast via `wsErrorMessage`.
- Écran Lobby (design §5.2) : code en grand (`code-display`, boutons copier/partager via `navigator.share` si dispo), sièges (avatar, pseudo, `CharBadge` ou « choisit… », badge host), grille des 4 personnages (pris = verrouillé grisé ; `CHARACTER_TAKEN` → toast « Trop tard, X a pris Obélix ») ; contrôles host (`set_format`, annuler invitation, expulser, **Lancer** — désactivé tant que sièges incomplets, personnages manquants ou invitation pending, avec raison affichée) ; bouton Quitter (host : avertissement transfert/dissolution). Réception `game:kicked` → toast + redirect `/`.

- [ ] **Étape 1 : Implémenter.**
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel à 2 navigateurs : create → join code → pick → start, conflit de personnage (2 taps rapprochés).
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): play and lobby screens"`

### Tâche 26 : Écran Live plein écran + Résumé + Wake Lock

**Files:**
- Create: `apps/web/src/app/partie/[gameId]/page.tsx`
- Create: `apps/web/src/components/live/player-card.tsx`, `tap-zone.tsx`, `live-journal.tsx`, `end-request-sheet.tsx`, `host-decision-modal.tsx`, `game-clock.tsx`, `summary.tsx`
- Create: `apps/web/src/hooks/use-wake-lock.ts`

**Interfaces:**
- Consumes: `useGame` (T22), `CHARACTER_META`, design system ; `activePlayers` (game-core).
- Produces: l'écran central de l'app (design §5.2 Live) :
  - Layout plein écran (groupe hors `(tabs)` → pas de tab bar), fond parchemin, personnages en fond basse opacité (`--pawn-opacity`).
  - `game-clock.tsx` : chrono `mm:ss` calculé `Date.now() + serverOffset - startedAt`, tick 1 s — jamais de compteur local seul.
  - Cartes joueurs : portrait (`CharBadge lg`) + compteur de dégommages, **rien d'autre** ; joueur sorti → carte grisée « a quitté la partie ».
  - `tap-zone.tsx` : « Tu viens de dégommer qui ? » — un chip par **adversaire en jeu** (portrait + pseudo + `+1`), 1 tap = `sendCommand({type:"degommage", targetId})`, aucun dialogue de confirmation ; feedback optimiste visuel léger (pulse) mais compteur mis à jour **uniquement** à réception du `game:event`.
  - Bouton pleine largeur **Annuler** (`{type:"undo"}`, désactivé si `validateCommand` client dit `NOTHING_TO_UNDO`).
  - Bouton pleine largeur **Fin de partie** → `end-request-sheet` : « Village atteint » (choix du vainqueur parmi les joueurs en jeu) / « J'abandonne » / « Tout arrêter ». Host demandeur → modale de confirmation simple puis envoi (le serveur auto-valide).
  - `host-decision-modal.tsx` : si `state.pendingEndRequest` et je suis host et pas demandeur → modale valider/rejeter (`respond_end`). Demandeur non-host → bandeau « En attente de l'host » + bouton retirer (`withdraw_end`).
  - `live-journal.tsx` : **les 2 dernières actions uniquement**, non dépliable — libellés français : « X a dégommé un pion de Y », « X a annulé le dégommage de Y sur Z », « X a quitté la partie », « X demande la fin (village : Y) »…
  - `use-wake-lock.ts` : `navigator.wakeLock.request("screen")` au montage, re-demande sur `visibilitychange` visible, release au démontage, échecs silencieux (design §6.4).
  - `summary.tsx` : rendu quand `state.status === "finished"` (même route) — vainqueur en grand avec personnage en fond basse opacité, ou « Partie abandonnée » ; récap par joueur avec icône épée = dégommages (pas d'icône pion) ; tuiles durée / total dégommages / format (« 1v1 » / « 3J » / « 4J ») ; boutons « Voir le classement » (→ `/classement`) et « Rejouer » (`replay:create` → `/lobby/[newId]`).

- [ ] **Étape 1 : Implémenter.**
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel à 2 navigateurs : partie complète — taps synchronisés, undo tracé au journal, demande de fin non-host validée par l'host, résumé identique des deux côtés, refresh en pleine partie → retour direct dans l'état courant.
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): fullscreen live screen with summary and wake lock"`

### Tâche 27 : Détail de partie + Classement

**Files:**
- Create: `apps/web/src/app/parties/[gameId]/page.tsx`, `apps/web/src/app/(tabs)/classement/page.tsx` (remplace le placeholder)
- Create: `apps/web/src/lib/queries/game-detail.ts`, `apps/web/src/lib/queries/leaderboard.ts`
- Create: `apps/web/src/components/leaderboard/ranking-row.tsx`, `character-winrate-bars.tsx`, `top-degommeur-tile.tsx`

**Interfaces:**
- Consumes: `getPlayerStats`, `areFriends` (T24), db, game-core (`buildGameState` pour re-vérifier les dénormalisations si besoin — non : lecture SQL directe).
- Produces:
  - `getGameDetail(gameId, viewerId)` : accès = participant **ou** ami d'un participant, sinon 403/notFound ; retourne récap (comme Résumé) + **journal complet** horodaté (tous les `game_events` traduits en libellés français, y compris undos et join/quit/fin).
  - `getLeaderboard(userId)` : lignes = **moi + mes amis** uniquement ; par ligne `{ rank, userId, username, wins, winrate, degommages, favoriteCharacter }` ; tri victoires > winrate > dégommages ; + `topDegommeur` ; + `characterWinrates: { character, winrate, games }[]` calculés sur les **sièges tenus par les membres du cercle** dans leurs parties `village_reached` (les inconnus ne contribuent pas).
- Écran Classement : tableau rangs (avatar, pseudo, V, %, épées, mini `CharBadge` fétiche), tuile « Plus grand dégommeur », barres winrate par personnage (portrait + barre à la couleur du personnage + %) — structure `.char-bar-row` de la maquette.

- [ ] **Étape 1 : Implémenter** (Server Components purs, SQL Drizzle paramétré).
- [ ] **Étape 2 : Vérifier** — `pnpm --filter web build && pnpm turbo run typecheck lint` ; manuel : après les parties de test de T26, classement cohérent (partie abandonnée exclue du dénominateur winrate mais dégommages comptés), détail affiche le journal complet, accès refusé à un non-ami non-participant.
- [ ] **Étape 3 : Commit** — `git add apps/web && git commit -m "feat(web): game detail and friends-scoped leaderboard"`

---

## Phase 6 — PWA

### Tâche 28 : Manifest + Serwist + installabilité

**Files:**
- Create: `apps/web/src/app/manifest.ts`, `apps/web/src/sw.ts`, `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- Modify: `apps/web/next.config.ts` (wrapper `@serwist/next`), `apps/web/src/app/layout.tsx` (meta theme-color, apple-touch-icon)

**Interfaces:**
- Consumes: assets (T19 — générer les icônes PWA depuis la tête d'Astérix sur fond parchemin via un ajout au script `prepare-characters.mjs`).
- Produces: PWA installable — manifest `{ name: "Dégommix", short_name: "Dégommix", lang: "fr", display: "standalone", orientation: "portrait", start_url: "/", background_color: "#ece0c4", theme_color: "#ece0c4", icons: [192, 512, maskable 512] }` ; service worker Serwist : `defaultCache` du shell statique **uniquement**, et `runtimeCaching` avec `NetworkOnly` explicite pour `/api/*` et `/socket.io/*` — aucune réponse dynamique cachée (design §6.4).

- [ ] **Étape 1 : Installer** — `pnpm --filter web add @serwist/next serwist`.
- [ ] **Étape 2 : Implémenter** manifest, `sw.ts`, config, icônes.
- [ ] **Étape 3 : Vérifier** — Run: `pnpm --filter web build && pnpm --filter web start &` puis `curl -s http://localhost:3000/manifest.webmanifest | head -20` (JSON correct) et `curl -sI http://localhost:3000/sw.js` (200). Manuel : Chrome devtools → Application → installable, SW actif ; vérifier dans l'onglet Network qu'une requête `/api/auth/token` n'est **jamais** servie par le SW.
- [ ] **Étape 4 : Commit** — `git add apps/web scripts && git commit -m "feat(web): installable pwa with serwist (static shell only)"`

---

## Phase 7 — E2E

### Tâche 29 : Playwright multi-contextes — happy path complet

**Files:**
- Create: `e2e/package.json` (name `e2e`, scripts `test` = `playwright test`), `e2e/playwright.config.ts`, `e2e/happy-path.spec.ts`, `e2e/helpers.ts`
- Modify: `turbo.json` (tâche `test:e2e` hors pipeline `test` par défaut), `package.json` racine (script `test:e2e`)

**Interfaces:**
- Consumes: stack complète (web 3000, ws-server 3001, Postgres test) ; `truncateAll` (T8) en `globalSetup`.
- Produces: le parcours du design §7.3, en un seul spec, deux `browser.newContext()` (J1 « Panoramix », J2 « Bonemine »), viewport 390×844 :
  1. inscription + pseudo pour J1 et J2 ;
  2. J1 recherche « Bonemine », envoie la demande ; J2 accepte ;
  3. J1 crée un lobby 1v1 et invite J2 ; J2 voit la bannière et rejoint ;
  4. choix des personnages (J1 Astérix, J2 Obélix), J1 lance ; assert : tab bar absente (`locator(".tabbar")` count 0 — adapter au sélecteur réel) et chrono visible sur les deux pages ;
  5. J1 tape 2 dégommages ; assert compteur « 2 » sur l'écran de J2 ;
  6. J2 annule ; assert journal « Bonemine a annulé » sur les deux écrans, compteur 1 ;
  7. J2 demande village en se désignant ; J1 valide dans la modale host ;
  8. assert résumé : « Bonemine » vainqueur, 1 dégommage pour J1 ; classement de J1 : Bonemine rang 1 ; détail de la partie : journal complet (dégommages + undo + fin).
- `playwright.config.ts` : `webServer` : deux commandes (`pnpm --filter ws-server dev` port 3001, `pnpm --filter web dev` port 3000) avec `env` pointant sur la DB de test ; `use: { baseURL: "http://localhost:3000" }` ; projet unique chromium mobile.

- [ ] **Étape 1 : Setup** — `pnpm add -D --filter e2e @playwright/test && pnpm --filter e2e exec playwright install chromium`.
- [ ] **Étape 2 : Écrire le spec** (helpers : `registerAndOnboard(page, email, username)`, `expectCounter(page, username, n)`).
- [ ] **Étape 3 : Vérifier** — Run: `docker compose -f docker-compose.test.yml up -d && pnpm test:e2e` — Expected: 1 passed. En cas d'échec : `superpowers:systematic-debugging` (cause racine, pas de sleep arbitraire — utiliser les auto-waits Playwright).
- [ ] **Étape 4 : Commit** — `git add e2e turbo.json package.json pnpm-lock.yaml && git commit -m "test(e2e): two-player happy path with playwright"`

---

## Phase 8 — Déploiement Railway

### Tâche 30 : Railway (web + ws-server + Postgres) + domaine

**Files:**
- Create: `apps/web/railway.json`, `apps/ws-server/railway.json` (build/start commands), `docs/deploy.md` (runbook court : variables, migrations, domaine)
- Modify: `packages/db/package.json` (script `db:migrate:prod` si besoin)

**Interfaces:**
- Consumes: MCP/CLI Railway (skill `use-railway` au moment de l'exécution), builds des tâches précédentes.
- Produces: projet Railway `degommix` avec 3 services — `postgres` (plugin), `web` (root `apps/web`, build `pnpm install --frozen-lockfile && pnpm turbo run build --filter=web`, start `pnpm --filter web start`), `ws-server` (build filtré, start `node apps/ws-server/dist/index.js`) ; migrations exécutées en pre-deploy (`pnpm --filter @degommix/db db:migrate`) ; variables : `DATABASE_URL` (référence au service postgres), `BETTER_AUTH_SECRET` (généré `openssl rand -hex 32`), `BETTER_AUTH_URL=https://degommix.tristanhourtoulle.fr`, `WEB_ORIGIN` idem, `NEXT_PUBLIC_WS_URL=https://<ws-server>.up.railway.app`, `JWKS_URL` interne ; **une seule instance** ws-server (pas d'autoscaling) ; domaine custom `degommix.tristanhourtoulle.fr` sur `web` (fournir à Tristan la cible CNAME à créer chez son registrar — étape humaine).

- [ ] **Étape 1 : Invoquer le skill `use-railway`**, créer projet + services + variables + pre-deploy migrations.
- [ ] **Étape 2 : Déployer et vérifier**

Run (après propagation) :
```bash
curl -sI https://degommix.tristanhourtoulle.fr | head -1        # HTTP/2 200
curl -s https://<ws-server-domain>/health                        # ok
curl -s https://degommix.tristanhourtoulle.fr/api/auth/jwks | head -c 80  # {"keys":[
```
Expected: les trois répondent. Test de fumée manuel sur téléphone : inscription, installation PWA, partie 1v1 réelle à deux téléphones.

- [ ] **Étape 3 : Commit** — `git add apps/*/railway.json docs/deploy.md packages/db && git commit -m "chore(deploy): railway services and deployment runbook"`

---

## Auto-revue (faite à la rédaction)

- **Couverture spec** : comptes/onboarding (T10-11), amis + présence + recherche (T13-14, T24), création/join/code/invitations/personnages/format/kick (T15, T25), start + live (dégommages, undo, fins, journal 2 lignes, chrono, wake lock, plein écran) (T16-17, T26), resync/retry/idempotence (T16, T18, T22), transfert d'host + zombie + replay (T18), résumé (T26), détail + journal complet (T27), classement + stats + fétiche + winrate personnage + plus grand dégommeur (T24, T27), DA/tokens/tab bar/thèmes (T9, T19-21), PWA (T28), E2E (T29), Railway + domaine (T30). Hors périmètre v1 respecté (pas de push, pas d'offline, pas de récupération de mot de passe).
- **Étapes humaines signalées** (non bloquantes pour le code) : export d'icônes Nucleo réel (T19, set de substitution en attendant) ; création du CNAME chez le registrar (T30).
- **Cohérence de types** : les signatures de `reduce`/`buildGameState`/`validateCommand`/`resolveUndoTarget`/`activePlayers`, `Ack`, `ErrorCode`, `LobbyState`, `GameManager.submitCommand` sont définies une fois (T2-T6, T15, T16) et référencées à l'identique par T22-T27.
