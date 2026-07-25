# Dégommix — Design technique d'implémentation

*Version du 25 juillet 2026 — découle de `SPECS.md` v2 (arbitrages du 25 juillet 2026). Ce document est le plan d'implémentation de référence : architecture, modèle de données, protocole temps réel, écrans, gestion d'erreurs, tests.*

---

## 1. Architecture générale

### 1.1 Monorepo

```
degommix/
├── apps/
│   ├── web/          # Next.js 15 (App Router), TypeScript, Tailwind CSS
│   └── ws-server/    # Node + Socket.IO, serveur temps réel autoritaire
├── packages/
│   ├── game-core/    # TypeScript pur : types d'événements + réducteur + validations
│   └── db/           # Schéma Drizzle ORM + client Postgres, partagé web/ws-server
├── pnpm-workspace.yaml
└── turbo.json
```

- **pnpm workspaces + Turborepo** (pipelines `build`, `lint`, `typecheck`, `test`).
- `game-core` et `db` ne dépendent d'aucun framework. `game-core` n'importe **rien** de `db` (types purs, exécutable côté client).
- TypeScript strict partout (`strict: true`, `noUncheckedIndexedAccess: true`).

### 1.2 Répartition des responsabilités

| Domaine | Service | Transport |
|---|---|---|
| Auth (inscription, connexion, session, onboarding pseudo) | `apps/web` (Better Auth, route handlers) | HTTP |
| Lectures : historique, détail de partie, classement, stats, profil, liste d'amis | `apps/web` (Server Components + route handlers) | HTTP |
| Recherche de pseudo (amis) | `apps/web` (route handler, debounce côté client) | HTTP |
| Mutations amis (demande, acceptation, refus, annulation, suppression) | `apps/ws-server` | WebSocket |
| Lobby (création, code, invitations, personnages, format, expulsion, lancement) | `apps/ws-server` | WebSocket |
| Partie live (dégommages, undo, demandes/validations de fin, quit) | `apps/ws-server` | WebSocket |
| Présence (en ligne / en partie / hors ligne) | `apps/ws-server` | WebSocket |

Règle de partage : **tout ce qui doit être notifié en temps réel à un autre joueur passe par le ws-server** (unique écrivain des données temps réel) ; le reste passe par Next.js. Les deux services partagent la même base Postgres via `packages/db`.

### 1.3 Hébergement (Railway)

- 3 services Railway : `web` (Next.js), `ws-server` (Node), `postgres`.
- Domaine `degommix.tristanhourtoulle.fr` (CNAME) → `web`. Le ws-server est exposé sur son propre sous-domaine Railway (`NEXT_PUBLIC_WS_URL`), CORS restreint à l'origine du web.
- **Contrainte assumée : une seule instance de ws-server** (pas d'adapter Redis, pas de sticky sessions). L'état des rooms et les verrous par partie vivent en mémoire du process ; Postgres reste la source de vérité durable (au redémarrage, tout se reconstruit depuis la DB).
- Variables d'environnement validées au boot avec Zod (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_WS_URL`, `WEB_ORIGIN`).

### 1.4 Auth et handshake WebSocket

- Better Auth (email + mot de passe) dans `apps/web`, avec le **plugin JWT** : endpoint JWKS exposé par le web (`/api/auth/jwks`), tokens courts (15 min).
- Flux client : session cookie classique côté Next ; avant d'ouvrir la socket, le client récupère un JWT (`/api/auth/token`) et le passe dans `socket.handshake.auth.token`.
- Le ws-server vérifie le JWT via le JWKS du web (clé mise en cache, re-fetch sur `kid` inconnu). Échec de vérification → refus de connexion (`connect_error`, code `AUTH_FAILED`). Le JWT n'est vérifié qu'au handshake ; une socket établie reste valide jusqu'à déconnexion.
- Pseudo : 20 caractères max, unique insensible à la casse (index unique sur `lower(username)`), choisi à l'onboarding (étape bloquante après inscription). V1 sans récupération de mot de passe ni suppression de compte.

---

## 2. Modèle de données (Postgres, Drizzle)

Better Auth gère ses propres tables (`user`, `session`, `account`, `verification`). On étend `user` avec `username` (et on n'y touche pas autrement).

```sql
-- Extension de la table user de Better Auth (additionalFields)
-- username text NULL (NULL tant que l'onboarding n'est pas fini)
CREATE UNIQUE INDEX user_username_ci_unique ON "user" (lower(username));

CREATE TYPE friend_request_status AS ENUM ('pending', 'accepted', 'declined', 'canceled');

CREATE TABLE friend_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   text NOT NULL REFERENCES "user"(id),
  receiver_id text NOT NULL REFERENCES "user"(id),
  status      friend_request_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);
-- Une seule demande en attente par paire orientée ; refusée/annulée => renvoyable (nouvelle ligne)
CREATE UNIQUE INDEX friend_requests_pending_unique
  ON friend_requests (sender_id, receiver_id) WHERE status = 'pending';

CREATE TABLE friendships (
  user_low   text NOT NULL REFERENCES "user"(id),
  user_high  text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)   -- paire canonique non orientée
);
-- Suppression d'ami = DELETE silencieux de la ligne.

CREATE TYPE game_status  AS ENUM ('lobby', 'active', 'finished');
CREATE TYPE game_outcome AS ENUM ('village_reached', 'aborted');  -- aborted = abandon total, zombie, ou lobby dissous
CREATE TYPE character_id AS ENUM ('asterix', 'obelix', 'caius_bonus', 'caligula_minus');

CREATE TABLE games (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,        -- 6 caractères, jamais réutilisé (les lignes ne sont jamais supprimées)
  status           game_status NOT NULL DEFAULT 'lobby',
  format           smallint NOT NULL CHECK (format IN (2, 3, 4)),
  host_id          text NOT NULL REFERENCES "user"(id),
  winner_id        text REFERENCES "user"(id),  -- NULL sauf village_reached
  outcome          game_outcome,                -- NULL tant que status <> 'finished'
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,                 -- chrono serveur : démarre ici
  ended_at         timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now()  -- pour la clôture zombie 24 h
);

CREATE TYPE game_player_status AS ENUM ('invited', 'joined', 'declined', 'kicked', 'left');

CREATE TABLE game_players (
  game_id     uuid NOT NULL REFERENCES games(id),
  user_id     text NOT NULL REFERENCES "user"(id),
  status      game_player_status NOT NULL,
  character   character_id,                     -- NULL tant que non choisi ; figé au lancement
  joined_at   timestamptz,                      -- ancienneté pour le transfert d'host
  left_at     timestamptz,
  degommages  int NOT NULL DEFAULT 0,           -- dénormalisé, recalculé depuis les événements à la clôture
  PRIMARY KEY (game_id, user_id)
);
-- Personnage unique par partie (parmi les joueurs effectivement à la table)
CREATE UNIQUE INDEX game_players_character_unique
  ON game_players (game_id, character)
  WHERE character IS NOT NULL AND status IN ('invited', 'joined');
-- Une seule partie/lobby actif par compte : vérifié applicativement sous verrou
-- (requête "EXISTS partie non finished où je suis invited/joined") au join/create/invite.

CREATE TABLE game_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id         uuid NOT NULL REFERENCES games(id),
  seq             int  NOT NULL,                -- attribué par le serveur, contigu à partir de 1
  type            text NOT NULL,                -- cf. §3.2
  actor_id        text REFERENCES "user"(id),   -- NULL pour les événements système (zombie)
  target_id       text REFERENCES "user"(id),   -- victime d'un dégommage, vainqueur désigné…
  payload         jsonb,                        -- champs additionnels typés par `type` (cf. §3.2)
  client_event_id uuid NOT NULL UNIQUE,         -- idempotence (généré serveur pour les événements système)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, seq)
);
CREATE INDEX game_events_game_seq ON game_events (game_id, seq);
```

### Génération du code de partie

6 caractères tirés de l'alphabet non ambigu `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 chars, ~887 M de combinaisons). Génération aléatoire + insertion ; collision sur l'index unique → nouveau tirage (boucle bornée à 5 essais). Le code n'est **jamais réutilisé** : les lignes `games` sont conservées indéfiniment, y compris les lobbies dissous (`finished`/`aborted` sans `started_at`). Un lobby dissous ou une partie lancée rendent le code inutilisable (le join vérifie `status = 'lobby'`).

---

## 3. `packages/game-core` — événements, réducteur, validations

### 3.1 Principe

Event sourcing append-only. L'état d'une partie **active** est une pure fonction du journal :

```ts
buildGameState(events: GameEvent[]): GameState        // fold complet
reduce(state: GameState, event: GameEvent): GameState  // application incrémentale
validateCommand(state: GameState, cmd: Command): ValidationResult  // partagé client/serveur
```

Le client applique le même réducteur que le serveur : il affiche l'état issu des événements **confirmés (avec `seq`)** uniquement — pas d'application optimiste, la latence LAN/4G d'un ack est imperceptible pour un compteur.

### 3.2 Types d'événements

| `type` | `actor_id` | `target_id` | `payload` | Effet dans le réducteur |
|---|---|---|---|---|
| `GAME_STARTED` | host | — | `{ players: [{userId, character}], format }` | Initialise l'état live (snapshot des sièges figés au lancement) |
| `DEGOMMAGE` | dégommeur | victime | — | `degommages[actor] += 1` (1 tap = 1 pion) |
| `UNDO` | annuleur | — | `{ targetSeq: number }` | Marque `targetSeq` comme annulé ; l'effet du `DEGOMMAGE` ciblé est ignoré |
| `PLAYER_QUIT` | joueur sorti | — | — | Le joueur sort du jeu (pions rangés hors plateau) ; ses dégommages restent |
| `END_REQUESTED` | demandeur | vainqueur désigné (si `village`) | `{ kind: 'village' \| 'abandon_individual' \| 'abandon_total' }` | Pose `pendingEndRequest` (une seule à la fois) |
| `END_REJECTED` | host | — | `{ requestSeq: number }` | Efface `pendingEndRequest` |
| `END_VALIDATED` | host | — | `{ requestSeq: number }` | Applique la demande (cf. §3.4) ; la partie passe en clôture |
| `GAME_AUTO_CLOSED` | *(système)* | — | `{ reason: 'zombie' }` | Clôture en `aborted` après 24 h d'inactivité |

Ordre des événements = ordre d'arrivée au serveur (le `seq` fait foi, jamais l'horloge client).

### 3.3 Règles de l'undo

- `UNDO` cible **le `DEGOMMAGE` non annulé le plus récent** du journal (pile). C'est le **serveur** qui résout `targetSeq` au moment de l'append (le client envoie juste la commande `undo`), ce qui rend le journal déterministe même en cas d'undos concurrents.
- Seuls les `DEGOMMAGE` sont annulables. `PLAYER_QUIT`, les demandes de fin et leurs validations ne le sont pas (elles ont leurs propres flux : rejet par l'host, etc.).
- Undo illimité en profondeur, déclenchable par **n'importe quel joueur encore en jeu**, jusqu'à `END_VALIDATED`. Pas de redo.
- S'il ne reste aucun `DEGOMMAGE` non annulé → commande refusée (`NOTHING_TO_UNDO`).
- Le journal affiche l'undo comme une action à part entière : « X a annulé le dégommage de Y sur Z ».

### 3.4 Machine à états d'une partie

```
lobby ──(start par host, sièges complets)──► active ──(END_VALIDATED | GAME_AUTO_CLOSED)──► finished
  └─(dissolution : host quitte seul / annulation)──► finished (outcome = aborted, jamais démarrée)
```

Transitions de fin (dans `active`) :

1. **`END_REQUESTED` kind=`village`** (+ `target_id` = vainqueur désigné, qui doit être un joueur encore en jeu) → attente host. `END_VALIDATED` → `games.winner_id = target_id`, `outcome = 'village_reached'`, `ended_at = now()`, `status = 'finished'`.
2. **kind=`abandon_individual`** (le demandeur s'abandonne lui-même) → `END_VALIDATED` → append `PLAYER_QUIT` pour le demandeur dans la même transaction. S'il reste ≥ 2 joueurs en jeu, la partie continue ; sinon clôture immédiate en `aborted`.
3. **kind=`abandon_total`** → `END_VALIDATED` → `outcome = 'aborted'`, pas de vainqueur.
4. **Host demandeur** : le client affiche une modale de confirmation, puis envoie la commande avec `autoValidate: true` ; le serveur append `END_REQUESTED` **puis** `END_VALIDATED` dans la même transaction (journal complet et cohérent, un seul chemin de code).
5. Pendant qu'une demande est en attente : la partie continue normalement (dégommages, undo autorisés) ; une nouvelle demande est refusée tant que la première n'est pas validée/rejetée (`END_REQUEST_PENDING`). Le demandeur peut la retirer (traitée comme un `END_REJECTED` avec `actor_id` = demandeur).
6. Après `END_VALIDATED` clôturant : plus **aucun** événement accepté (`GAME_FINISHED`).

À la clôture, le serveur recalcule et fige les dénormalisations : `game_players.degommages` (dégommages non annulés par joueur), `games.ended_at`, `winner_id`, `outcome`.

### 3.5 Validations serveur (toutes commandes)

Rejet avec code d'erreur si : partie inexistante ou non `active` ; émetteur non membre `joined` ; émetteur déjà `left` ; `DEGOMMAGE` sur soi-même, sur un joueur sorti ou hors partie ; `UNDO` sans cible ; demande de fin dupliquée ; validation/rejet de fin par un non-host ; vainqueur désigné invalide. `validateCommand` de `game-core` est aussi exécuté côté client pour désactiver les boutons invalides (UX), mais le serveur reste seul juge.

---

## 4. Protocole temps réel (Socket.IO)

### 4.1 Connexion, rooms, présence

- Namespace unique `/`. À la connexion (JWT vérifié) : `socket.join('user:' + userId)` ; si l'utilisateur a une partie/lobby actif, `socket.join('game:' + gameId)` + envoi immédiat de l'état (cf. resync).
- **Présence** : un utilisateur est *en ligne* s'il a ≥ 1 socket connectée, *en partie* si sa partie active est `active`. Socket.IO ping/pong (intervalle 25 s, timeout 20 s) fait office de heartbeat → un joueur injoignable est détecté *hors ligne* au bout de ~45-60 s. Diffusion des changements de présence aux amis (`room user:{friendId}`), payload `{ userId, presence: 'online' | 'in_game' | 'offline' }`.
- Multi-onglets/appareils : compteur de sockets par userId ; *hors ligne* quand il tombe à 0.

### 4.2 Convention d'échange

Toutes les commandes client→serveur utilisent l'**ack Socket.IO** : `socket.emit(name, payload, callback)` avec réponse `{ ok: true, ...data } | { ok: false, code: ErrorCode, message: string }`. Les mises à jour serveur→client sont des broadcasts sur les rooms.

### 4.3 Commandes client → serveur

| Événement | Payload | Réponse ok | Notes |
|---|---|---|---|
| `friends:request` | `{ receiverId }` | `{ requestId }` | Refusé si déjà amis ou demande pending |
| `friends:respond` | `{ requestId, accept: boolean }` | `{}` | Accept → crée `friendships` |
| `friends:cancel` | `{ requestId }` | `{}` | Annulation par l'émetteur ; renvoyable ensuite |
| `friends:remove` | `{ friendId }` | `{}` | Silencieux : aucun événement émis vers l'ex-ami |
| `lobby:create` | `{ format }` | `{ gameId, code }` | Refusé si partie active existante (`ALREADY_IN_GAME`) |
| `lobby:invite` | `{ gameId, friendId }` | `{}` | Ami uniquement ; refusé si l'ami a une partie active |
| `lobby:cancel_invite` | `{ gameId, userId }` | `{}` | Host only ; débloque le lancement |
| `lobby:respond_invite` | `{ gameId, accept }` | `{ lobbyState? }` | Décliner → host notifié |
| `lobby:join_by_code` | `{ code }` | `{ gameId, lobbyState }` | Ouvert aux inconnus ; lobby non plein, non lancé |
| `lobby:pick_character` | `{ gameId, character }` | `{}` | Premier arrivé au serveur ; conflit → `CHARACTER_TAKEN` |
| `lobby:set_format` | `{ gameId, format }` | `{}` | Host only ; refusé si joueurs présents > format |
| `lobby:kick` | `{ gameId, userId }` | `{}` | Host only |
| `lobby:leave` | `{ gameId }` | `{}` | Host qui part → transfert ou dissolution |
| `lobby:start` | `{ gameId }` | `{ firstEvents }` | Host only ; sièges complets, personnages choisis, aucune invitation pending |
| `game:command` | `{ gameId, clientEventId, command }` | `{ seq }` | `command` ∈ `degommage {targetId}` / `undo` / `request_end {kind, winnerId?}` / `respond_end {accept}` / `withdraw_end` — « quitter la partie » côté UI = `request_end { kind: 'abandon_individual' }` |
| `game:resync` | `{ gameId, lastSeq }` | `{ events: GameEvent[] }` | Événements `seq > lastSeq`, dans l'ordre |
| `replay:create` | `{ finishedGameId }` | `{ gameId, code }` | Nouveau lobby, mêmes joueurs ré-invités, host = l'émetteur |

### 4.4 Broadcasts serveur → client

| Événement | Room | Payload |
|---|---|---|
| `game:event` | `game:{id}` | `GameEvent` confirmé (avec `seq`) — les clients le passent à `reduce()` |
| `lobby:state` | `game:{id}` | État complet du lobby (joueurs, statuts, personnages, format, code) — rebroadcast intégral à chaque changement (volume trivial) |
| `invite:received` | `user:{id}` | `{ gameId, hostUsername, format }` — bannière accueil + onglet Rejoindre |
| `invite:canceled` | `user:{id}` | `{ gameId }` |
| `friends:event` | `user:{id}` | `{ kind: 'request_received' \| 'request_accepted' \| 'request_canceled', ... }` |
| `presence:update` | `user:{id}` (amis) | `{ userId, presence }` |
| `game:host_changed` | `game:{id}` | `{ newHostId }` |
| `game:kicked` | `user:{id}` | `{ gameId }` — retour forcé à l'accueil |

### 4.5 Idempotence, retry, resync

- Chaque commande de jeu porte un `clientEventId` (UUID v4 généré au tap). Insertion sous contrainte unique : un doublon (retry d'un tap déjà persisté) renvoie l'ack `{ ok: true, seq }` de l'événement existant, **sans** ré-append ni re-broadcast.
- **Retry court du tap** : si l'ack n'arrive pas sous 3 s, le client ré-émet (même `clientEventId`), 3 tentatives max sur ~10 s ; au-delà, l'action est abandonnée côté UI avec un toast « Action non transmise — vérifie ta connexion » (l'utilisateur re-tape ; pas de file offline, conformément au « pas de mode offline »).
- **Reconnexion** (reconnect automatique Socket.IO, backoff 1 s → 5 s) : le client ré-émet `game:resync { lastSeq }` ; le serveur renvoie la suite du journal (ou tout le journal si `lastSeq = 0`, cas du refresh de page). Le client rejoue les événements dans le réducteur. Les événements reçus avec `seq` déjà connu sont ignorés ; un trou de `seq` détecté sur un `game:event` broadcast déclenche un `game:resync` défensif.

### 4.6 Sérialisation des écritures et attribution de `seq`

Par partie : une **file en mémoire** (mutex par `gameId`) dans le ws-server — une seule commande traitée à la fois par partie. Traitement : `validateCommand` sur l'état courant (maintenu en mémoire, reconstruit depuis la DB au premier accès) → transaction Postgres (`INSERT game_events` avec `seq = dernier + 1`, mises à jour `games.last_activity_at`, et le cas échéant `games`/`game_players`) → mise à jour de l'état mémoire → broadcast. L'instance unique du ws-server garantit l'absence de concurrence inter-process.

### 4.7 Transfert d'host et cycle de vie

- **Host injoignable** (lobby ou partie) : quand toutes les sockets de l'host sont déconnectées depuis **60 s** (timer armé à la déconnexion, annulé à la reconnexion), l'host passe au **joueur connecté dont `joined_at` est le plus ancien**. Broadcast `game:host_changed`. L'ancien host qui revient redevient simple joueur.
- **Lobby** : si l'host part explicitement (`lobby:leave`) et qu'il reste des joueurs, même règle de transfert ; s'il est seul, le lobby est dissous (`finished`/`aborted`, code définitivement brûlé).
- **Partie zombie** : job périodique du ws-server (toutes les 15 min) — toute partie `active` avec `last_activity_at < now() - 24 h` reçoit `GAME_AUTO_CLOSED` (système) et passe en `aborted`.
- **Quit définitif en partie** : l'action « Quitter » de l'UI envoie `request_end { kind: 'abandon_individual' }` — validée par l'host comme toute demande de fin (auto-validée si c'est l'host qui quitte). Une simple déconnexion réseau n'est **pas** un quit : le joueur reste à la table et peut revenir.

---

## 5. Écrans et navigation

### 5.1 Structure de navigation (`apps/web`, App Router)

```
/login, /register, /onboarding          # hors tab bar (auth)
/(tabs)/                                # layout avec bottom tab bar "liquid glass"
  /            → Accueil
  /amis        → Amis
  /jouer       → Jouer (Créer / Rejoindre)
  /classement  → Classement
/lobby/[gameId]                         # tab bar visible
/partie/[gameId]                        # LIVE — plein écran, tab bar MASQUÉE
/parties/[gameId]                       # détail d'une partie terminée (journal complet)
/amis/[userId]                          # profil/stats d'un ami
```

- Tab bar : 4 onglets (Accueil, Amis, Jouer, Classement), style iOS 26 / « liquid glass » (bulle animée qui glisse entre les onglets), icônes Nucleo 24 px / trait 1.8. Composant client fixé en bas, masqué sur `/partie/*`.
- Thèmes clair/sombre : tokens CSS, `prefers-color-scheme` + toggle `data-theme`.
- Garde globale : utilisateur connecté sans pseudo → redirection `/onboarding` ; utilisateur avec partie/lobby actif → bannière persistante « Reprendre la partie » sur tous les écrans à onglets.

### 5.2 Détail par écran

| Écran | Contenu | Données |
|---|---|---|
| **Login / Register** | Formulaires email + mot de passe (Zod), erreurs inline. Pas de « mot de passe oublié » (v1). | Better Auth |
| **Onboarding** | Choix du pseudo (≤ 20 chars), vérification de dispo en direct (debounce 300 ms), aperçu de l'avatar (initiale, anneau bronze). | HTTP |
| **Accueil** | Bannière d'invitation reçue (temps réel), bannière « Reprendre la partie », **mes 20 dernières parties** (résultat, format, durée, participants, heure) → lien `/parties/[id]`. | SSR + WS |
| **Amis** | 3 sections : demandes reçues (accepter/refuser), mes demandes envoyées (annuler), liste d'amis avec présence temps réel (en ligne / en partie / hors ligne) et suppression (silencieuse). Barre de recherche globale par pseudo partiel (debounce 300 ms, min 2 chars). | SSR + WS |
| **Profil ami** | Stats (victoires, winrate, dégommages, personnage fétiche), accessibles **aux amis uniquement** (403 sinon). | SSR |
| **Jouer** | Deux CTA : **Créer** (choix format 2/3/4 → `lobby:create`) et **Rejoindre** (champ code 6 chars + liste des invitations en attente). | WS |
| **Lobby** | Code partageable en grand, sièges (avatar, pseudo, personnage choisi ou « choisit… »), grille des 4 personnages (les pris sont verrouillés ; conflit → toast « Trop tard, X a pris Obélix »), contrôles host (format, annuler invitation, expulser, **Lancer** — actif seulement si complet + personnages choisis + zéro invitation pending), bouton Quitter/Décliner. | WS (`lobby:state`) |
| **Live** (`/partie/[id]`) | Plein écran, tab bar masquée. Chrono serveur (affiché depuis `started_at`, re-synchronisé, jamais compté côté client seul). Cartes joueurs : **portrait + compteur de dégommages uniquement** (aucun pion). Zone « Tu viens de dégommer qui ? » : portraits des adversaires en jeu, 1 tap = 1 pion, sans confirmation. Boutons pleine largeur : **Annuler** et **Fin de partie** (ouvre la feuille : village atteint → choisir le vainqueur / abandonner la partie / tout arrêter). Modale host pour valider/rejeter les demandes reçues ; modale de confirmation si l'host demande lui-même. **Journal : les 2 dernières actions, non dépliable.** Joueur sorti : carte grisée « a quitté la partie ». **Wake Lock** actif (§6.4). | WS (`game:event`) |
| **Résumé** | Affiché à la clôture (broadcast final) : vainqueur en grand (personnage en fond basse opacité) ou « Partie abandonnée » ; récap par joueur (épée = dégommages — pas d'icône pion) ; tuiles durée / total dégommages / format ; actions « Voir le classement » et « Rejouer » (`replay:create`). | État final |
| **Détail partie** (`/parties/[id]`) | Même récap + **journal complet** (dégommages, undos « X a annulé… », join/quit/fin, horodatés). Accessible aux participants et à leurs amis. | SSR |
| **Classement** | Scopé **cercle d'amis + soi**. Tableau : rang, avatar, pseudo, victoires, winrate, dégommages, personnage fétiche ; tri victoires > winrate > dégommages. Tuile « Plus grand dégommeur ». Barres **winrate par personnage** (portrait + couleur). | SSR |

### 5.3 Règles de calcul des stats

- **Périmètre du classement** : lignes = moi + mes amis. Un inconnu croisé via code n'apparaît jamais (mais ses actions restent dans les stats de chaque partie).
- **Stats d'un joueur** (sur toutes ses parties `finished`) :
  - `victoires` = parties où `winner_id = joueur`.
  - `winrate` = victoires / parties `outcome = 'village_reached'` auxquelles il a participé (statut `joined`, même s'il a quitté en cours — c'est une défaite). Les parties `aborted` sont **exclues du dénominateur**.
  - `dégommages` = somme des `DEGOMMAGE` non annulés, **toutes parties finies confondues, abandons inclus**.
  - Winrate brut toutes tailles de partie confondues ; le format est purement indicatif.
- **Personnage fétiche** = personnage le plus joué (parties `finished` démarrées) ; égalité → le plus récemment joué.
- **Winrate par personnage** (écran Classement) : calculé sur les **sièges tenus par les membres du cercle** dans leurs parties `village_reached` — un siège = 1 partie jouée avec ce personnage, victoire si son occupant a gagné. Les sièges des inconnus n'y contribuent pas.
- Tout est calculé en SQL à la lecture (volumes de petit comité) ; `game_players.degommages` dénormalisé sert d'accélérateur.

---

## 6. Gestion d'erreurs et résilience

### 6.1 Codes d'erreur WS (ack `{ ok: false, code }`)

`AUTH_FAILED` · `NOT_FOUND` · `NOT_MEMBER` · `NOT_HOST` · `ALREADY_IN_GAME` · `LOBBY_FULL` · `LOBBY_ALREADY_STARTED` · `INVALID_CODE` · `CHARACTER_TAKEN` · `FORMAT_INCOMPATIBLE` · `PENDING_INVITES` · `GAME_NOT_ACTIVE` · `GAME_FINISHED` · `PLAYER_LEFT` · `INVALID_TARGET` · `NOTHING_TO_UNDO` · `END_REQUEST_PENDING` · `NO_PENDING_REQUEST` · `USERNAME_TAKEN` · `RATE_LIMITED` · `INTERNAL`.

Côté client : mapping code → message français (toast ou état inline) ; `INTERNAL` → « Une erreur est survenue, réessaie » + log console structuré.

### 6.2 Scénarios réseau

| Scénario | Comportement |
|---|---|
| Micro-coupure pendant un tap | Retry automatique (même `clientEventId`, 3× / ~10 s) ; idempotence serveur ⇒ jamais de double comptage |
| Reconnexion socket | `game:resync { lastSeq }` systématique + resouscription aux rooms ; état reconstruit par le réducteur |
| Refresh / réouverture de l'app en pleine partie | Le serveur remet le client dans sa room au handshake ; resync complet (`lastSeq = 0`) ; retour direct sur `/partie/[id]` via la bannière « Reprendre » |
| Trou de `seq` détecté | Resync défensif immédiat |
| Hors-partie, socket coupée | Bandeau discret « Reconnexion… » ; les écrans SSR restent consultables tant que la navigation HTTP répond (pas de cache offline) |

### 6.3 Cas limites métier

- **Conflit de personnage** : résolu par la file par-partie (premier arrivé au serveur) ; le perdant reçoit `CHARACTER_TAKEN` + `lobby:state` à jour.
- **Expulsion / annulation d'invitation** : le joueur concerné reçoit `game:kicked` / `invite:canceled`, est sorti de la room et redirigé vers l'accueil.
- **Changement de format** : refusé si le nombre de joueurs présents + invitations pending dépasse le nouveau format.
- **Deux demandes de fin simultanées** : la première arrivée pose `pendingEndRequest`, la seconde reçoit `END_REQUEST_PENDING`.
- **Host quitte pendant une demande de fin en attente** : le nouvel host hérite du pouvoir de validation (la demande reste posée).
- **« Rejouer »** : refusé pour tout joueur ayant déjà une partie active ; les invités indisponibles sont simplement notifiés comme invitations classiques.

### 6.4 Wake Lock et PWA

- `/partie/[id]` : `navigator.wakeLock.request('screen')` au montage, re-demande sur `visibilitychange` (retour au premier plan), libération au démontage. Échec (navigateur non compatible) silencieux : l'app fonctionne, l'écran peut juste se verrouiller.
- Service worker **Serwist** : precache du shell statique (pages app, CSS, JS, fonts, images personnages) ; stratégie `NetworkOnly` explicite pour `/api/*` et le endpoint Socket.IO — **aucune réponse dynamique n'est jamais cachée**. Manifest : installable, `display: standalone`, portrait, icônes maskable.

### 6.5 Sécurité

- Toutes les entrées validées avec Zod (payloads WS inclus) avant tout traitement ; le ws-server ne fait jamais confiance au client (autorité totale sur `seq`, `targetSeq`, transitions).
- Accès aux lectures HTTP contrôlé par session : profil/stats d'un joueur → 403 si non ami ; détail de partie → participants et leurs amis.
- Rate limiting en mémoire sur le ws-server : recherche de pseudo et demandes d'ami (10/min), commandes de jeu (20/s par socket — large pour du jeu humain, bloque les boucles).
- Requêtes SQL exclusivement paramétrées (Drizzle) ; secrets en variables d'environnement Railway.

---

## 7. Stratégie de tests

### 7.1 Unitaires — `packages/game-core` (Vitest)

Le réducteur et `validateCommand`, testés à fond :
- fold complet vs application incrémentale (mêmes résultats) ;
- ordre : les compteurs ne dépendent que de l'ordre des `seq` ;
- undo : pile simple, undos successifs jusqu'au journal vide, `NOTHING_TO_UNDO`, undo par un autre joueur que l'auteur du dégommage, comptage correct après undo au milieu de l'historique reconstruit ;
- doublons : deux événements identiques avec `seq` distincts comptent double (l'idempotence est un contrat serveur, testée en 7.2) ;
- fins de partie : village (vainqueur figé), abandon individuel avec continuation (≥ 2 restants) et avec clôture (< 2), abandon total, rejet, demande pendante bloquant la suivante, refus de tout événement après clôture ;
- quit : joueur sorti ne peut plus agir ni être ciblé, ses dégommages persistent ;
- validations : auto-dégommage, cible hors partie, non-host validant une fin.

### 7.2 Intégration — `apps/ws-server` (Vitest + `socket.io-client`)

Serveur démarré sur port éphémère + Postgres de test (base dédiée, migrations appliquées, truncate entre tests). 2 à 4 clients simulés :
- handshake : JWT valide accepté, invalide refusé ;
- lobby : create → join par code → pick personnages ; **conflit de sélection simultanée** (deux `pick` concurrents : un `ok`, un `CHARACTER_TAKEN`) ; kick ; format ; start bloqué par invitation pending puis débloqué par `cancel_invite` ;
- partie : dégommages broadcastés à tous dans le même ordre de `seq` ; **idempotence** (ré-émission du même `clientEventId` → même `seq`, un seul événement en base) ; undo concurrent (deux undos simultanés annulent deux dégommages distincts) ;
- resync : client déconnecté pendant N événements → `game:resync { lastSeq }` renvoie exactement la suite ;
- fins : demande par non-host + validation host ; demande host auto-validée (deux événements appendés) ; rejet ;
- transfert d'host après déconnexion > 60 s (timers factices) ; clôture zombie (horloge factice à +24 h).

### 7.3 E2E — Playwright multi-contextes (happy path, un seul parcours)

Deux contextes navigateur (deux joueurs) contre la stack complète (`web` + `ws-server` + Postgres de test) :
1. J1 et J2 s'inscrivent (email + mot de passe) et choisissent leur pseudo ;
2. J1 recherche J2, envoie une demande d'ami, J2 accepte ;
3. J1 crée un lobby 1v1, invite J2 ; J2 voit la bannière d'invitation et rejoint ;
4. Choix des personnages, J1 lance ; vérification : tab bar masquée, chrono visible sur les deux écrans ;
5. J1 loggue 2 dégommages (2 taps) ; les compteurs se mettent à jour chez J2 ;
6. J2 annule le dernier dégommage ; le journal affiche « J2 a annulé… » des deux côtés ;
7. J2 demande « village atteint » en se désignant vainqueur ; J1 (host) valide ;
8. Résumé : J2 vainqueur, dégommages corrects ; le classement de J1 montre J2 en tête ; le détail de la partie affiche le journal complet.

### 7.4 Outillage

`turbo run test` orchestre le tout ; lint (ESLint) + `tsc --noEmit` en pipeline ; l'E2E tourne en job séparé (webServer Playwright qui lance les deux apps). Pas d'autre couche de test en v1.

---

*Fin du document. Toute évolution de périmètre (mode local un-téléphone, Web Push, blocage d'amis…) relève de la V2 et passera par une révision de ce design.*
