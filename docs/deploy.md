# Déploiement — Dégommix v1 (Railway)

Runbook court. Tout vit dans un seul projet Railway, environnement **production** uniquement
(pas de staging).

## 1. Vue d'ensemble

| Ressource | Valeur |
| --- | --- |
| Workspace Railway | `Tristan Hourtoulle's Projects` (`41cb993d-a501-47c1-9c0c-806bb3c1c478`) |
| Projet | `degommix` (`bbb8afc3-b68a-49ab-80c0-a3554823df0b`) |
| Environnement | `production` (`6e80f68a-a9eb-49e7-a710-74e79c89e8b5`) |
| Source | GitHub `TristanHourtoulle/D-gommix`, branche `main` (auto-deploy sur push) |
| Builder | Railpack (détection Node + pnpm via `packageManager` + Corepack) |

Trois services :

| Service | Rôle | Root dir | Build | Start |
| --- | --- | --- | --- | --- |
| `Postgres` | base de données (template officiel Railway, volume persistant) | — | — | — |
| `web` | Next.js 15 (app + Better Auth + JWKS) | `/` | `pnpm turbo run build --filter=@degommix/web --env-mode=loose` | `pnpm --filter @degommix/web start` |
| `ws-server` | Socket.IO (temps réel, instance unique) | `/` | `pnpm turbo run build --filter=@degommix/ws-server` | `node apps/ws-server/dist/index.js` |

> **Instance unique obligatoire pour `ws-server`** : l'état des rooms et les verrous par partie
> vivent en mémoire du process. Ne jamais monter `numReplicas` au-dessus de 1 sans ajouter
> un adapter Redis.

### Pièges monorepo déjà réglés (ne pas les défaire)

- `--env-mode=loose` sur le build **web** : sans ça, Turborepo 2 filtre l'environnement en mode
  strict et `next build` échoue sur la validation Zod (`DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL` absents au build).
- `RAILPACK_START_CMD` défini sur les deux services : Railpack ne sait pas déduire de start
  command à la racine d'un workspace pnpm et fait échouer le build sans elle.
- `NPM_CONFIG_PRODUCTION=false` / `PNPM_CONFIG_PROD=false` (variables partagées de
  l'environnement) : garantit que les `devDependencies` (turbo, tsup, next, drizzle-kit) sont
  bien installées malgré `NODE_ENV=production`.

## 2. Variables d'environnement

Variables partagées de l'environnement `production` (héritées par tous les services) :

```
NPM_CONFIG_PRODUCTION=false
PNPM_CONFIG_PROD=false
```

### `web`

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence, réseau privé) |
| `BETTER_AUTH_SECRET` | secret 32 octets — `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `https://degommix.tristanhourtoulle.fr` |
| `WEB_ORIGIN` | `https://degommix.tristanhourtoulle.fr` |
| `NEXT_PUBLIC_WS_URL` | `https://ws-server-production-3092.up.railway.app` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `RAILPACK_START_CMD` | `pnpm --filter @degommix/web start` |

> `NEXT_PUBLIC_WS_URL` est **inliné dans le bundle client au build**. Toute modification impose
> un rebuild complet du service `web`, pas un simple restart.

### `ws-server`

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence) |
| `WEB_ORIGIN` | `https://degommix.tristanhourtoulle.fr` (origine CORS autorisée) |
| `JWKS_URL` | `https://web-production-52166.up.railway.app/api/auth/jwks` |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `RAILPACK_START_CMD` | `node apps/ws-server/dist/index.js` |

> `JWKS_URL` pointe volontairement sur le domaine Railway du service `web` (toujours résolvable,
> indépendant du DNS du domaine custom). Alternative possible une fois tout stabilisé :
> `http://web.railway.internal:3000/api/auth/jwks` (réseau privé, IPv6).
> Si `JWKS_URL` est absent, `apps/ws-server/src/env.ts` retombe sur `${WEB_ORIGIN}/api/auth/jwks`.

### Rotation d'un secret

```bash
openssl rand -hex 32   # nouvelle valeur de BETTER_AUTH_SECRET
```

Changer `BETTER_AUTH_SECRET` invalide toutes les sessions et tous les JWT en cours : tout le
monde doit se reconnecter. À faire hors heures de jeu.

## 3. Migrations de base de données

Les migrations Drizzle sont jouées en **pre-deploy** du service `web` (Railway exécute la
commande avant de basculer le trafic ; si elle échoue, le déploiement est annulé et l'ancienne
version reste en ligne) :

```
pnpm --filter @degommix/db db:migrate
```

Générer une nouvelle migration en local, puis committer `packages/db/drizzle/` :

```bash
pnpm --filter @degommix/db db:generate
git add packages/db/drizzle && git commit -m "feat(db): <migration>"
```

Le service `ws-server` n'exécute **aucune** migration : `web` est le seul migrateur, pour éviter
deux runners concurrents sur la même base.

### Backfill rétroactif des sceaux (one-shot manuel)

La migration `0005` crée la table `seals` **vide**. Les hauts faits déjà mérités dans les parties
passées sont rejoués par un script manuel, à lancer **une fois**, après le déploiement qui embarque
`0005` :

```bash
DATABASE_URL="$RAILWAY_POSTGRES_URL" pnpm --filter @degommix/ws-server backfill:seals
```

La valeur est lue depuis les variables du service `postgres` sur Railway. Elle contient le mot de
passe : ne jamais la coller dans un fichier, un commit, un ticket ou un log.

Le script n'est pas branché sur le pre-deploy : `web` est le seul migrateur (§ 3) et ce backfill a
besoin de `game-core`. Il est **idempotent** — la clé primaire `(user_id, seal_id)` et les inserts
`ON CONFLICT DO NOTHING` font qu'un second passage n'insère rien (`"sealsInserted":0`). On peut donc
le relancer sans risque, à n'importe quel moment.

Si un bug de détection est livré : corriger `detectSeals`, puis `TRUNCATE TABLE seals;` et relancer
le backfill reconstruit la table à l'identique — c'est un cache d'une fonction pure du journal
d'événements, rien d'autre dans l'app n'en dépend.

#### Vague 2 des sceaux (plan 039)

Le plan 039 ajoute dix sceaux **sans aucune migration** (`seals.seal_id` est un `text`). Après le
déploiement qui les embarque, relancer **exactement la même commande** — même script, **ni migration
ni truncate** :

```bash
DATABASE_URL="$RAILWAY_POSTGRES_URL" pnpm --filter @degommix/ws-server backfill:seals
```

La variable est **référencée, jamais recopiée** : sa valeur vient des variables du service
`postgres` sur Railway et ne doit apparaître dans aucun fichier, commit, log ou ticket.

Ordre à respecter : **déployer d'abord, backfiller ensuite**. Le chemin live grave les nouveaux
sceaux dès la partie suivante quoi qu'il arrive ; le backfill est ce qui les rend rétroactifs. Un
`TRUNCATE` détruirait les `unlocked_at` corrects des six sceaux déjà en base sans rien apporter.

## 4. Domaine

- Domaine public : `https://degommix.tristanhourtoulle.fr` → service `web`, port cible `3000`.
- Enregistrement DNS à créer chez le registrar (étape humaine) :

  | Type | Nom / Host | Valeur (cible) | TTL |
  | --- | --- | --- | --- |
  | `CNAME` | `degommix` (zone `tristanhourtoulle.fr`) | `cs82iwdi.up.railway.app` | auto / 3600 |

  Au 25/07/2026 cet enregistrement est **déjà en place et propagé**, et le certificat TLS est
  émis (`CERTIFICATE_STATUS_TYPE_VALID`) : rien à faire chez le registrar tant que le domaine
  n'est pas changé.

- Railway émet le certificat TLS automatiquement une fois le CNAME propagé (statut
  `VALIDATING_OWNERSHIP` → `VALID`, quelques minutes). Compter 2 à 4 minutes supplémentaires
  après l'émission avant que le edge serve le domaine (404 transitoires entre-temps).
- Domaines Railway de secours (toujours actifs, utiles en cas de souci DNS) :
  - `web` : `https://web-production-52166.up.railway.app`
  - `ws-server` : `https://ws-server-production-3092.up.railway.app`

Attention : `WEB_ORIGIN` restreint le CORS du `ws-server` au domaine custom. Ouvrir l'app par le
domaine Railway de secours fera échouer la connexion Socket.IO tant que `WEB_ORIGIN` n'est pas
élargi.

## 5. Redéployer

- **Automatique** : tout push sur `main` du repo `TristanHourtoulle/D-gommix` redéploie les deux
  services applicatifs.
- **Manuel** : dashboard Railway → service → *Deployments* → `Redeploy`.
  Un `Redeploy` rejoue le **snapshot de configuration existant**. Après un changement de
  build/start command, déclencher un vrai nouveau déploiement (push, ou modification d'une
  variable) plutôt qu'un simple `Redeploy`.
- **Rollback** : *Deployments* → un déploiement `SUCCESS` antérieur → `Rollback`. Les migrations
  ne sont pas annulées : un rollback applicatif suppose des migrations rétro-compatibles.

## 6. Vérifications de santé

```bash
curl -s https://ws-server-production-3092.up.railway.app/health          # -> ok
curl -sI https://degommix.tristanhourtoulle.fr/login | head -1           # -> HTTP/2 200
curl -s https://degommix.tristanhourtoulle.fr/api/auth/jwks | head -c 80 # -> {"keys":[
```

Le `ws-server` a un healthcheck Railway sur `/health` : un déploiement qui ne répond pas est
automatiquement rejeté.

## 7. Config as code

`apps/web/railway.json` et `apps/ws-server/railway.json` décrivent build/start/pre-deploy.
Pour que Railway les utilise à la place des réglages du dashboard, renseigner sur chaque service
le champ *Config as code* (`railwayConfigFile`) :

- service `web` → `apps/web/railway.json`
- service `ws-server` → `apps/ws-server/railway.json`

À faire **après** avoir committé et poussé ces deux fichiers sur `main`.
