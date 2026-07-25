<p align="center">
  <img src="assets/branding/pion-couronne.svg" alt="Dégommix" width="160">
</p>

<h1 align="center">Dégommix</h1>

<p align="center">
  <em>Le classement officieux de vos parties de petits chevaux Astérix</em>
</p>

---

Dégommix est une PWA mobile qui accompagne les parties physiques du *Jeu des Petits Chevaux — Astérix le Gaulois* : le plateau reste le jeu, l'app enregistre ce qui s'y passe. Chaque joueur loggue depuis son téléphone ses « dégommages » (pion adverse renvoyé à l'écurie) en un tap, sans confirmation — l'undo illimité sert de garde-fou. Les parties sont synchronisées en temps réel entre tous les téléphones de la table : compteurs, chrono serveur et journal identiques partout. Un classement scopé au cercle d'amis cumule victoires, winrate et dégommages, par joueur et par personnage.

Application en ligne : **https://degommix.tristanhourtoulle.fr**

Documents de référence : [`SPECS.md`](SPECS.md) (spécifications produit), [`docs/RECAP-PROJET.md`](docs/RECAP-PROJET.md) (récap autoporté), [`docs/superpowers/specs/2026-07-25-degommix-design.md`](docs/superpowers/specs/2026-07-25-degommix-design.md) (design technique).

## Les personnages

Le jeu physique propose exactement quatre personnages, chacun avec sa couleur de camp. Toute l'identité visuelle de l'app en découle.

| <img src="assets/characters/processed/asterix.png" alt="Astérix" width="140"> | <img src="assets/characters/processed/obelix.png" alt="Obélix" width="140"> | <img src="assets/characters/processed/caius-bonus.png" alt="Caïus Bonus" width="140"> | <img src="assets/characters/processed/caligula-minus.png" alt="Caligula Minus" width="140"> |
|:--:|:--:|:--:|:--:|
| **Astérix** | **Obélix** | **Caïus Bonus** | **Caligula Minus** |
| Gaulois — Rouge `#b23a2e` | Gaulois — Bleu `#2c5b82` | Romains — Jaune `#b9861f` | Romains — Vert `#3f6b3c` |

Visuels détourés dans [`assets/characters/processed/`](assets/characters/processed/), recadrages « tête » pour les badges circulaires dans [`assets/characters/heads/`](assets/characters/heads/).

## Fonctionnalités v1

- **Comptes** : email + mot de passe (Better Auth), pseudo unique de 20 caractères max (insensible à la casse), avatar = initiale dans un anneau bronze.
- **Amis** : recherche globale par pseudo, demandes accepter / refuser (annulables et renvoyables), présence temps réel (en ligne / en partie / hors ligne), profil et stats visibles par les amis uniquement.
- **Créer / rejoindre** : lobby de 2 à 4 joueurs en FFA, invitation d'amis en un tap, code de partie à 6 caractères jamais réutilisé — un inconnu peut rejoindre avec le code.
- **Partie live** : synchronisation temps réel, chrono serveur, carte joueur = portrait du personnage + compteur de dégommages, un tap par pion dégommé, undo illimité partagé et tracé, journal réduit aux 2 dernières actions, écran plein avec Wake Lock.
- **Fin de partie** : n'importe quel joueur demande (village atteint, abandon individuel, abandon total), seul l'host valide.
- **Résumé & historique** : vainqueur en grand, récap en icônes, 20 dernières parties sur l'accueil, page détail avec le journal complet.
- **Classement & stats** : scopés au cercle d'amis (+ soi), victoires / winrate / dégommages, plus grand dégommeur, winrate par personnage, personnage fétiche.

Hors périmètre v1 : modes en équipe, suivi des pions, Web Push, mode offline, desktop/tablette, autres langues. Voir [`SPECS.md`](SPECS.md) §7.

## Stack & architecture

Monorepo pnpm workspaces + Turborepo, TypeScript strict partout.

| Workspace | Rôle |
|---|---|
| [`apps/web`](apps/web) | Next.js 15 (App Router), React 19, Tailwind CSS 4 — UI, auth Better Auth, toutes les lectures (historique, classement, profils), PWA via Serwist |
| [`apps/ws-server`](apps/ws-server) | Node + Socket.IO — serveur temps réel **autoritaire** : amis, lobby, partie live, présence ; JWT vérifié au handshake |
| [`packages/game-core`](packages/game-core) | TypeScript pur, sans dépendance framework — types d'événements, réducteur d'état et validations partagés client/serveur |
| [`packages/db`](packages/db) | Schéma Drizzle ORM + client Postgres, partagé par les deux apps |

**Flux de données** : l'état de partie est un journal d'événements append-only (`game_events`) ; le ws-server valide chaque commande, attribue le `seq` faisant foi, persiste puis broadcast à la room, et le même réducteur `game-core` rejoue ce journal côté client comme côté serveur — l'undo est un événement `UNDO` appendé (jamais un `DELETE`), l'idempotence est assurée par un `client_event_id` fourni par le client, et une reconnexion se résout en renvoyant la suite depuis le dernier `seq` connu.

## Démarrage local

Prérequis : **Node ≥ 22**, **pnpm 11.13.1** (`packageManager`), **Docker** (pour Postgres).

```bash
# 1. Dépendances
pnpm install

# 2. Postgres local (image postgres:16, exposé sur le port 54329)
docker compose -f docker-compose.test.yml up -d

# 3. Variables d'environnement
cp .env.example apps/web/.env.local   # Next.js charge ce fichier automatiquement
export DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test

# 4. Migrations Drizzle
pnpm --filter @degommix/db db:migrate

# 5. Les deux apps en parallèle (Next.js + ws-server)
pnpm dev
```

Notes :

- `docker-compose.test.yml` démarre la base `degommix_test` (utilisateur et mot de passe `degommix`) sur le port hôte **54329** ; c'est la base utilisée par les tests, et elle fait aussi office de base de dev locale. L'image est volontairement la variante glibc (`postgres:16`) avec la locale `en_US.UTF-8`, pour que le collationnement local soit le même qu'en production — la variante alpine (musl) ignore les locales et masque les bugs de collationnement.
- `apps/ws-server` ne charge pas de fichier `.env` : ses variables (`DATABASE_URL`, `WEB_ORIGIN`, `PORT`, `JWKS_URL` optionnel) doivent être présentes dans l'environnement du process. Les valeurs de dev sont celles de `.env.example` — `PORT=4001`, aligné avec `NEXT_PUBLIC_WS_URL=http://localhost:4001`.
- Le schéma évolue via `pnpm --filter @degommix/db db:generate` (génération de la migration) puis `db:migrate`.

Autres scripts racine : `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Tests

```bash
# Toute la suite (unitaires + intégration) via Turborepo
pnpm test

# Sérialisé : les suites d'intégration partagent la même base de test
pnpm exec turbo run test --concurrency=1

# Par workspace
pnpm --filter @degommix/game-core test   # réducteur : ordre, undo, doublons, fins de partie
pnpm --filter @degommix/ws-server test   # intégration Socket.IO, 2 à 4 clients simulés
```

Postgres de test requis pour l'intégration (`docker compose -f docker-compose.test.yml up -d`). Le vitest de `ws-server` désactive déjà le parallélisme entre fichiers ; `--concurrency=1` évite en plus que deux workspaces attaquent la base en même temps.

E2E Playwright — un parcours happy path multi-contextes (deux joueurs) dans [`e2e/`](e2e) :

```bash
pnpm --filter e2e exec playwright install chromium   # une fois
pnpm test:e2e
```

La config Playwright démarre elle-même la stack complète (migrations, ws-server sur `:4001`, build + start du web sur `:3000`) contre la base de test.

## Déploiement

Hébergement **Railway**, trois services : `web` (Next.js), `ws-server` (Node) et `postgres`. Le domaine `degommix.tristanhourtoulle.fr` (CNAME) pointe sur `web` ; le ws-server est exposé sur son propre sous-domaine Railway, avec CORS restreint à l'origine du web.

Le dépôt n'a **pas de CI** — c'est un choix assumé : Railway construit et déploie sur push. La branche `main` est la production, il n'y a pas d'environnement de staging. Les vérifications (`pnpm lint`, `pnpm typecheck`, `pnpm test`) se lancent en local avant de pousser.

Runbook complet — création des services, variables d'environnement, domaine, migrations : [`docs/deploy.md`](docs/deploy.md).

## Structure du dépôt

```
degommix/
├── apps/
│   ├── web/          # Next.js 15 — UI, auth, lectures, PWA
│   └── ws-server/    # Node + Socket.IO — temps réel autoritaire
├── packages/
│   ├── game-core/    # Types d'événements + réducteur partagé
│   └── db/           # Schéma Drizzle + migrations + client Postgres
├── e2e/              # Playwright — parcours happy path multi-contextes
├── docs/             # Récap projet, design technique, maquette, déploiement
├── assets/           # Logo, personnages détourés, icônes SVG
└── SPECS.md          # Spécifications produit v2
```

---

Projet privé entre amis — visuels Astérix © leurs ayants droit, usage non commercial.
