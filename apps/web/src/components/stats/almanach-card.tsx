import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/icons'

export interface AlmanachRow {
  label: string
  value: string
}

interface AlmanachCardProps {
  testId: string
  icon: IconName
  title: string
  /** The big figure, already formatted. Null renders the not-yet state. */
  value: string | null
  /** Unit printed next to the figure, e.g. « menhirs ». */
  unit?: string
  /** The real derivation — the whole point of the card. */
  derivation?: string
  /** Optional per-player ranking under the figure. */
  rows?: AlmanachRow[]
}

/**
 * One Almanach entry: an absurd unit over a real derivation. The figure is
 * the hero; the caption always states how it was obtained, so nobody can
 * suspect the app of inventing numbers (plan 036 decision 2). The trailing
 * asterisk points at the page footer's « Calculs homologués par le druide ».
 */
export function AlmanachCard({
  testId,
  icon,
  title,
  value,
  unit,
  derivation,
  rows = [],
}: AlmanachCardProps) {
  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label flex items-center gap-2">
        <Icon name={icon} size={14} className="text-bronze" />
        {title}
      </p>

      {value === null ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }} data-testid={testId}>
          Pas encore assez de parties pour homologuer ce calcul.
        </p>
      ) : (
        <p className="m-0 flex items-baseline gap-2" data-testid={testId}>
          <span className="stat-num" style={{ fontSize: '1.9rem', lineHeight: 1.1 }}>
            {value}
          </span>
          {unit ? <span className="stat-lbl">{unit}</span> : null}
        </p>
      )}

      {derivation ? <p className="s-sub">{derivation} *</p> : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <p key={row.label} className="m-0 flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>
                {row.value}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
