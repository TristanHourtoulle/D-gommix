# Dégommix — Récap projet

*Récapitulatif autoporté du projet, à jour des arbitrages du 25 juillet 2026. Destiné à être partagé tel quel hors du dépôt.*

## Le concept en 3 phrases

Dégommix est une PWA mobile qui accompagne les parties physiques du *Jeu des Petits Chevaux — Astérix le Gaulois* (édition limitée Éditions Atlas, 2006) : le plateau reste le jeu, l'app enregistre ce qui s'y passe. Chaque joueur, depuis son téléphone, loggue en un tap ses « dégommages » (pion adverse renvoyé à l'écurie) dans une partie synchronisée en temps réel entre tous les téléphones de la table. Un classement scopé au cercle d'amis cumule victoires, winrate et dégommages, par joueur et par personnage — pour savoir une bonne fois qui tient le village.

## Le nom

**Dégommix** — jeu de mot sur « dégommer » (l'action centrale du jeu) + le suffixe gaulois « -ix » de la licence Astérix. Choisi parmi d'autres pistes (Pionix, Obéludix, Alea Ludix…).

## Les 4 personnages

Le jeu physique propose exactement 4 personnages, chacun avec sa couleur de camp — toute l'identité visuelle de l'app en découle :

| Personnage | Camp | Couleur |
|---|---|---|
| Astérix | Gaulois | Rouge `#b23a2e` |
| Obélix | Gaulois | Bleu `#2c5b82` |
| Caïus Bonus | Romains | Jaune `#b9861f` |
| Caligula Minus | Romains | Vert `#3f6b3c` |

## Fonctionnalités v1 (résumé)

- **Comptes** : email + mot de passe (Better Auth), pseudo unique (20 caractères max, insensible à la casse), avatar = initiale dans un anneau bronze.
- **Amis** : recherche globale par pseudo, demandes accepter/refuser (annulables, renvoyables), présence temps réel (en ligne / en partie / hors ligne), profil et stats visibles par les amis uniquement.
- **Créer / rejoindre** : lobby 2 à 4 joueurs, invitation d'amis en un tap (in-app, temps réel), code de partie à 6 caractères jamais réutilisé — un inconnu peut rejoindre avec le code.
- **Partie live** : synchronisation temps réel entre les téléphones, chrono serveur, carte joueur = portrait + compteur de dégommages, un tap par pion dégommé, undo illimité partagé et tracé, journal réduit aux 2 dernières actions, écran plein (tab bar masquée) avec Wake Lock.
- **Fin de partie** : n'importe quel joueur demande (village atteint, abandon individuel, abandon total), seul l'host valide.
- **Résumé & historique** : vainqueur en grand, récap en icônes, mes 20 dernières parties sur l'accueil, page détail avec journal complet.
- **Classement & stats** : scopés au cercle d'amis (+ soi), victoires / winrate / dégommages, plus grand dégommeur, winrate par personnage, personnage fétiche.

## Décisions produit clés

- **FFA uniquement** (chacun pour soi), 2 à 4 joueurs, un téléphone et un compte par joueur.
- **Personnage unique par partie**, choisi librement à chaque partie (non lié au compte) ; conflit de sélection = premier arrivé au serveur.
- **Pas de suivi des pions** : trop lourd à logger en vraie partie — l'app ne trace que les dégommages, la durée et l'issue.
- **Undo illimité** (pile), par n'importe quel joueur, visible au journal, possible jusqu'à la clôture validée par l'host ; c'est le garde-fou qui remplace toute confirmation.
- **Validation de fin par l'host** : le vainqueur est le joueur désigné dans la demande « village atteint » validée.
- **Classement scopé au cercle d'amis**, jamais global à l'app ; un inconnu venu par code compte dans les stats de la partie mais n'apparaît pas dans le leaderboard.
- **Parties abandonnées** : dégommages comptés, partie exclue du dénominateur du winrate. Départage : victoires > winrate > dégommages.
- **Résilience simple** : retry automatique court du tap + resync complète à la reconnexion ; partie zombie auto-clôturée après 24 h ; transfert d'host automatique au joueur connecté le plus ancien.
- **Petit comité privé** : français uniquement, mobile uniquement, pas de Web Push (invitations in-app), pas d'onboarding règles, pas de dispositif RGPD.

## Direction artistique

- **Ambiance** : BD / parchemin illustré — textures papier ancien, proche de la boîte du jeu.
- **Palette** : parchemin `#ece0c4`, encre `#251a10`, bronze `#8c5a2b` + les 4 couleurs des personnages (`#b23a2e`, `#2c5b82`, `#b9861f`, `#3f6b3c`).
- **Typo** : **Cinzel** (capitales romaines, style colonne Trajane) pour les titres et le wordmark ; police système pour le texte courant.
- **Icônes** : **Nucleo**, grille 24 px / trait 1.8.
- **Personnages** : visuels officiels détourés (jamais de simple pastille de couleur), recadrages « tête » pour les badges circulaires, images en fond basse opacité.
- **Navigation** : bottom tab bar « liquid glass » style iOS 26 / Instagram (bulle animée), onglets Accueil / Amis / Jouer / Classement, masquée pendant une partie.
- **Thèmes** : clair et sombre.

## Stack technique retenue

- **Monorepo pnpm workspaces + Turborepo** : `apps/web` (Next.js 15, TypeScript, Tailwind), `apps/ws-server` (Node + Socket.IO), `packages/game-core` (types d'événements + réducteur d'état partagé client/serveur, TypeScript pur).
- **Hébergement** : Railway all-in-one (web + ws-server + Postgres).
- **Auth** : Better Auth (email + mot de passe), JWT vérifié au handshake WebSocket.
- **Modèle d'état** : event sourcing append-only (table `game_events`, `seq` serveur, idempotence par UUID client) ; l'undo est un événement appendé, jamais un DELETE ; serveur WS autoritaire qui valide, persiste et broadcast.
- **PWA** : manifest + service worker Serwist qui ne cache que le shell statique — jamais les réponses API/WS.
- **Tests** : réducteur testé unitairement à fond, intégration ws-server avec 2-4 clients simulés (Vitest), un parcours E2E Playwright multi-contextes.

## Hors périmètre

**V1 (exclu)** : modes en équipe (2v2), détection automatique des mouvements, suivi des pions restants, plus de 4 joueurs / tournois / saisons, récupération de mot de passe, suppression de compte, photo de profil, blocage d'amis, Web Push, mode offline, desktop/tablette, autres langues, onboarding règles, RGPD, spectateurs, rejoindre une partie lancée, édition rétroactive.

**Reporté en V2** : mode « partie locale » multi-joueurs sur le seul téléphone de l'host.

## Domaine cible

**`degommix.tristanhourtoulle.fr`** (CNAME → Railway).

---

## Prompt logo (NanoBanana)

Prompt principal, prêt à coller (en anglais — les modèles d'image y répondent mieux) :

```
Mobile app icon and logo for "Dégommix", a French comic-book (bande dessinée)
style companion app for a Gaulish-themed board game. Original Gaulish/antique
motifs ONLY — do NOT depict any copyrighted comic character, no Asterix
likeness: use a generic winged-helmet silhouette, a menhir, a wooden board-game
pawn and a laurel wreath as the visual vocabulary. Aged parchment background
texture (#ece0c4) with subtle paper grain, bold ink outlines (#251a10), bronze
accents (#8c5a2b). Optionally weave in the four camp colors — red #b23a2e,
blue #2c5b82, yellow #b9861f, green #3f6b3c — as discreet quadrants or small
pips around the emblem. Wordmark "DÉGOMMIX" set in Roman capital lettering
(Trajan/Cinzel-like carved-capitals style), ink color with bronze inline.
Flat illustration, warm and playful but clean, high contrast, must remain
perfectly legible at small app-icon size. Deliver two variants: (1) a square
app icon with the emblem centered, (2) a horizontal lockup with the emblem
left of the "DÉGOMMIX" wordmark.
```

Variations courtes :

**Icône seule :**
```
Square mobile app icon: winged Gaulish helmet silhouette above a wooden game
pawn, framed by a laurel wreath, flat bande dessinée style, ink outlines
(#251a10) on aged parchment (#ece0c4), bronze accents (#8c5a2b), four tiny
color pips (#b23a2e, #2c5b82, #b9861f, #3f6b3c), no text, no copyrighted
characters, crisp at 48px.
```

**Wordmark seul :**
```
Horizontal wordmark "DÉGOMMIX" in carved Roman capitals (Trajan/Cinzel style),
ink #251a10 with a bronze #8c5a2b inline, on an aged parchment #ece0c4 banner
with lightly torn edges and paper grain, small laurel sprigs at each end, flat
French comic-book style, no characters.
```

**Variante joueuse (l'action « dégommer ») :**
```
Playful square app icon: a wooden board-game pawn knocked over mid-fall with
a comic-style impact star and two motion lines, a winged helmet resting on the
standing pawn beside it, flat bande dessinée illustration, ink outlines
(#251a10), aged parchment background (#ece0c4), bronze accents (#8c5a2b), red
#b23a2e and blue #2c5b82 details, energetic but clean, legible at small size,
no copyrighted characters.
```
