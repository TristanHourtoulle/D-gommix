'use client'

import { useMemo, type ReactNode } from 'react'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Icon, type IconName } from '@/components/icons'
import { formatDurationProse } from '@/components/stats/format'
import { formatFrenchDecimal } from '@/lib/almanach'
import { AUGURES_TARGET_DEGOMMAGES, readAugures, type AuguresState } from '@/lib/augures'
import { displayName, type NameMap } from './types'

interface AuguresPanelProps {
  state: AuguresState
  /** Server-anchored elapsed seconds. The panel never reads a clock itself. */
  elapsedSec: number
  names: NameMap
}

interface AugureBlockProps {
  icon: IconName
  title: string
  children: ReactNode
}

/** One reading: a titled figure over the derivation that produced it. */
function AugureBlock({ icon, title, children }: AugureBlockProps) {
  return (
    <div className="flex flex-col">
      <p className="sec-label flex items-center gap-2">
        <Icon name={icon} size={14} className="text-bronze" />
        {title}
      </p>
      {children}
    </div>
  )
}

/** The figure line: a hero number and its unit, side by side. */
function Figure({ value, unit, testId }: { value: string; unit: string; testId?: string }) {
  return (
    <p className="m-0 flex items-baseline gap-2" data-testid={testId}>
      <span className="stat-num" style={{ fontSize: '1.6rem', lineHeight: 1.15 }}>
        {value}
      </span>
      <span className="stat-lbl">{unit}</span>
    </p>
  )
}

/** The French sentence printed when a reading is not yet worth stating. */
function Silence({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
      {children}
    </p>
  )
}

/**
 * « Tableau des augures » — the live reading of the game in progress. Pure
 * presentation over `readAugures`: props in, JSX out, no timer and no request.
 * Every figure prints its derivation underneath, the Almanach house rule
 * (`plans/036-almanach-stats-absurdes.md` § Decision 2), so nobody can suspect
 * the app of inventing numbers.
 */
export function AuguresPanel({ state, elapsedSec, names }: AuguresPanelProps) {
  const augures = useMemo(() => readAugures(state, elapsedSec), [state, elapsedSec])
  const punchingBag =
    augures.punchingBagId === null
      ? null
      : (augures.tallies.find((tally) => tally.userId === augures.punchingBagId) ?? null)

  return (
    <div className="flex flex-col gap-3" data-testid="augures-panel">
      <AugureBlock icon="sword" title="Rythme du carnage">
        {augures.ratePerMinute === null ? (
          <Silence>Le druide exige deux minutes de partie avant de parler de rythme.</Silence>
        ) : (
          <Figure
            value={formatFrenchDecimal(augures.ratePerMinute)}
            unit="dégommages / minute"
            testId="augures-rate"
          />
        )}
        <p className="s-sub">
          {augures.totalDegommages} dégommages en {formatDurationProse(augures.elapsedSec)}
        </p>
      </AugureBlock>

      <AugureBlock icon="pawn" title="Souffre-douleur provisoire">
        {punchingBag === null ? (
          <Silence>Personne ne se détache : le malheur est bien réparti.</Silence>
        ) : (
          <>
            <p className="m-0 flex items-center gap-2 text-sm font-bold">
              <CharacterBadge character={punchingBag.character} size="sm" />
              <span className="min-w-0 flex-1 truncate">
                {displayName(names, punchingBag.userId)}
              </span>
            </p>
            <p className="s-sub">
              {punchingBag.taken} pions perdus, plus que quiconque pour l’instant
            </p>
          </>
        )}
      </AugureBlock>

      <AugureBlock icon="flag" title="Plus grosse série">
        {augures.bestRun === null ? (
          <Silence>Aucune série digne de ce nom.</Silence>
        ) : (
          <>
            <Figure value={String(augures.bestRun.length)} unit="dégommages d’affilée" />
            <p className="s-sub">
              {displayName(names, augures.bestRun.actorId)}, sans laisser la main{' '}
              {augures.bestRun.isOngoing ? <span className="pill wait">en cours</span> : null}
            </p>
          </>
        )}
      </AugureBlock>

      <AugureBlock icon="timer" title="Durée projetée">
        {augures.projection === null ? (
          <Silence>Les augures se taisent encore.</Silence>
        ) : (
          <>
            <Figure value={formatDurationProse(augures.projection.totalSec)} unit="au total" />
            <p className="s-sub">
              Selon les augures : à ce rythme, les {AUGURES_TARGET_DEGOMMAGES} dégommages d’une
              partie type tombent dans {formatDurationProse(augures.projection.remainingSec)}.
            </p>
          </>
        )}
      </AugureBlock>

      <AugureBlock icon="users" title="Donnés / subis">
        <div className="mt-1 flex flex-col gap-1">
          {augures.tallies.map((tally) => (
            <p key={tally.userId} className="m-0 flex items-center gap-2 text-sm">
              <CharacterBadge character={tally.character} size="sm" />
              <span className="min-w-0 flex-1 truncate">{displayName(names, tally.userId)}</span>
              <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>
                {tally.dealt} / {tally.taken}
              </span>
            </p>
          ))}
        </div>
      </AugureBlock>

      <p className="helper-text">
        Relevé provisoire, lu dans les entrailles de la partie en cours. Seul le druide homologue
        les records.
      </p>
    </div>
  )
}
