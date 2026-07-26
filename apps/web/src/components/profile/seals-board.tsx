import { Card } from '@/components/ui/card'
import { SealMedallion } from '@/components/ui/seal-medallion'
import type { UnlockedSeal } from '@/lib/queries/seals'
import { SEALS, SEAL_COUNT } from '@/lib/seals'

interface SealsBoardProps {
  unlocked: readonly UnlockedSeal[]
  /** Heading tone: own profile vs a friend's. */
  isSelf: boolean
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}

/**
 * The six hauts faits, always all six, in SEALS order: unlocked ones in bronze,
 * locked ones faint — so the board doubles as the catalog of what there is to
 * chase.
 *
 * The condition is printed under every medallion, earned or not: it used to be
 * swapped for the unlock date once the seal was gravé, which meant the board
 * forgot what a seal means exactly when you finally owned it. Both lines are
 * shown now, and neither is a hover tooltip (this is a phone-first app).
 */
export function SealsBoard({ unlocked, isSelf }: SealsBoardProps) {
  const unlockedById = new Map(unlocked.map((seal) => [seal.sealId, seal]))

  return (
    <section className="flex flex-col gap-2" data-testid="seals-board">
      <p className="sec-label">Sceaux</p>
      <Card className="flex flex-col gap-3 p-4">
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {unlockedById.size}/{SEAL_COUNT} sceaux gravés
          {unlockedById.size === 0
            ? isSelf
              ? ' — la pierre est encore vierge.'
              : ' — sa pierre est encore vierge.'
            : ''}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {SEALS.map((seal) => {
            const earned = unlockedById.get(seal.id)
            return (
              <div key={seal.id} className="flex flex-col items-center gap-1 text-center">
                <SealMedallion sealId={seal.id} size={56} isLocked={earned === undefined} />
                <p className="m-0 text-xs font-bold">{seal.label}</p>
                <p className="m-0 text-[0.65rem]" style={{ color: 'var(--ink-faint)' }}>
                  {seal.hint}
                </p>
                {earned ? (
                  <p
                    className="m-0 text-[0.6rem] font-bold"
                    style={{ color: 'var(--bronze-strong)' }}
                  >
                    {new Date(earned.unlockedAt).toLocaleDateString('fr-FR', DATE_FORMAT)}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}
