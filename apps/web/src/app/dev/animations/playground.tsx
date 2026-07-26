'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { hitByTarget } from '@/components/live/hit-fx'
import { OpponentCard } from '@/components/live/opponent-card'
import { Summary } from '@/components/live/summary'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { QueryProvider } from '@/lib/query-client'
import {
  DEMO_ENDED_AT,
  DEMO_FINISHED,
  DEMO_GAME_ID,
  DEMO_LOG,
  DEMO_NAMES,
  DEMO_STARTED_AT,
  HERO_ID,
  RIVAL_ID,
} from './mocks'

/** Which end-of-game sequence is on stage, if any. */
type Stage = 'winner' | 'loser'

/**
 * Animations playground. Mounts the shipped live components — `OpponentCard`
 * for the dégommage hit combo, `Summary` for the end-of-game orchestrations —
 * on hard-coded mock data, so every sequence can be watched on demand from the
 * installed PWA without playing a real game. Nothing here is duplicated from
 * those components: the replay mechanisms are theirs (a growing hit log flips
 * `data-hit`, a remount restarts the endgame phase).
 *
 * `QueryProvider` is required because `Summary` mounts `RematchButton`, which
 * calls `useQueryClient()`. No `SocketProvider` on purpose: a demo screen has no
 * business opening a websocket, and `useSocket()` has a non-throwing default.
 */
export function Playground() {
  const [reduced, setReduced] = useState(false)
  const [hitCount, setHitCount] = useState(0)
  const [stage, setStage] = useState<Stage | null>(null)
  const [runId, setRunId] = useState(0)

  // Growing the log by one entry flips the hero's hit parity, which flips
  // `data-hit` on the card and restarts the CSS combo with the next onomatopée.
  const hits = hitByTarget(DEMO_LOG.slice(0, hitCount))
  const hero = DEMO_FINISHED.players[HERO_ID]
  const rival = DEMO_FINISHED.players[RIVAL_ID]

  return (
    <QueryProvider>
      <div className="tab-page" data-motion={reduced ? 'reduced' : undefined}>
        <Link
          href="/profil"
          className="sec-label flex items-center gap-1 no-underline"
          style={{ color: 'var(--ink-faint)' }}
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Retour au profil
        </Link>

        <header>
          <h1 className="s-title m-0">Animations</h1>
          <p className="s-sub">Terrain d’essai — rien ici n’est une vraie partie.</p>
        </header>

        <section className="flex flex-col gap-2">
          <p className="sec-label">Mouvement réduit</p>
          <Card className="flex flex-col gap-3 p-4">
            <Button variant="ghost" aria-pressed={reduced} onClick={() => setReduced((v) => !v)}>
              Mouvement réduit : {reduced ? 'activé' : 'désactivé'}
            </Button>
            <p className="helper-text m-0">
              Simule le réglage d’accessibilité, ici seulement. Le réglage du téléphone, lui,
              s’applique partout et gagne toujours.
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <p className="sec-label">Dégommage</p>
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3">
              {hero ? (
                <OpponentCard
                  player={hero}
                  username={DEMO_NAMES[HERO_ID] ?? 'Joueur'}
                  avatarId={null}
                  isHost
                  taken={hitCount}
                  hit={hits[HERO_ID]}
                  canAct
                  isLocked={false}
                  isPending={false}
                  onTap={() => setHitCount((n) => (n >= DEMO_LOG.length ? 1 : n + 1))}
                />
              ) : null}
              {rival ? (
                <OpponentCard
                  player={rival}
                  username={DEMO_NAMES[RIVAL_ID] ?? 'Joueur'}
                  avatarId={null}
                  isHost={false}
                  taken={0}
                  canAct={false}
                  isLocked={false}
                  isPending={false}
                  onTap={() => undefined}
                />
              ) : null}
            </div>
            <Button onClick={() => setHitCount((n) => (n >= DEMO_LOG.length ? 1 : n + 1))}>
              Rejouer le dégommage
            </Button>
            <p className="helper-text m-0">
              Onomatopée : {hits[HERO_ID]?.word ?? '—'} · coup {hitCount}/{DEMO_LOG.length}
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <p className="sec-label">Victoire</p>
          <Card className="flex flex-col gap-3 p-4">
            <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
              Séquence complète, ~3,3 s. Un tap saute à l’image finale.
            </p>
            <Button onClick={() => setStage('winner')}>Lancer la séquence</Button>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <p className="sec-label">Défaite</p>
          <Card className="flex flex-col gap-3 p-4">
            <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
              Séquence complète, ~3 s. Un tap saute à l’image finale.
            </p>
            <Button onClick={() => setStage('loser')}>Lancer la séquence</Button>
          </Card>
        </section>

        {stage !== null ? (
          <div className="dev-stage">
            <div className="dev-stage-close">
              <Button variant="ghost" fullWidth={false} onClick={() => setRunId((n) => n + 1)}>
                Rejouer
              </Button>
              <Button variant="ghost" fullWidth={false} onClick={() => setStage(null)}>
                Fermer
              </Button>
            </div>
            {/*
              `viewerId` IS the variant switch (`endgameVariant(winnerId, viewerId)`),
              and the `key` is the replay: remounting restarts `phase` at 'playing'.
            */}
            <Summary
              key={`${stage}-${runId}`}
              gameId={DEMO_GAME_ID}
              state={DEMO_FINISHED}
              names={DEMO_NAMES}
              viewerId={stage === 'winner' ? HERO_ID : RIVAL_ID}
              startedAt={DEMO_STARTED_AT}
              endedAt={DEMO_ENDED_AT}
              initialInvites={{ invites: [] }}
            />
          </div>
        ) : null}
      </div>
    </QueryProvider>
  )
}
