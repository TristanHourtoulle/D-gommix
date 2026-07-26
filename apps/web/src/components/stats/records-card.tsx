import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/icons'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { formatDurationProse } from './format'

type CircleRecordsPayload = NonNullable<LeaderboardPayload['records']>

interface RecordsCardProps {
  records: CircleRecordsPayload
}

interface RecordLine {
  icon: IconName
  label: string
  holder: string
  value: string
}

/**
 * « Palmarès du village » — all-time records under the podium. The card never
 * follows the period toggle (records are all-time by design, plan 026). When
 * fastest and longest are the same single game, only « Partie éclair »
 * renders — one game is trivially both extremes.
 */
export function RecordsCard({ records }: RecordsCardProps) {
  const lines: RecordLine[] = []
  if (records.fastestVillage) {
    lines.push({
      icon: 'timer',
      label: 'Partie éclair',
      holder: records.fastestVillage.holder.username,
      value: formatDurationProse(records.fastestVillage.durationSec),
    })
  }
  if (
    records.longestVillage &&
    records.longestVillage.gameId !== records.fastestVillage?.gameId
  ) {
    lines.push({
      icon: 'timer',
      label: 'Marathon gaulois',
      holder: records.longestVillage.holder.username,
      value: formatDurationProse(records.longestVillage.durationSec),
    })
  }
  if (records.longestStreak) {
    lines.push({
      icon: 'crown',
      label: 'Série légendaire',
      holder: records.longestStreak.holder.username,
      value: `${records.longestStreak.count} victoires d’affilée`,
    })
  }
  if (records.biggestCarton) {
    lines.push({
      icon: 'sword',
      label: 'Plus gros carton',
      holder: records.biggestCarton.holder.username,
      value: `${records.biggestCarton.count} dégommage${records.biggestCarton.count > 1 ? 's' : ''} en une partie`,
    })
  }
  if (lines.length === 0) return null

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Palmarès du village</p>
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <p key={line.label} className="m-0 flex items-center gap-2 text-sm">
            <Icon name={line.icon} size={14} className="text-bronze" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{line.label}</span> — {line.holder}
            </span>
            <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>
              {line.value}
            </span>
          </p>
        ))}
      </div>
    </Card>
  )
}
