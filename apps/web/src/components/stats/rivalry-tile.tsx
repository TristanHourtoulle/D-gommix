import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import type { RivalrySpotlight } from '@/lib/queries/rivalries'

interface RivalryTileProps {
  rivalry: RivalrySpotlight
}

/** « 1 dégommage subi » / « 2 dégommages subis ». */
function sufferedLabel(count: number): string {
  const s = count > 1 ? 's' : ''
  return `${count} dégommage${s} subi${s}`
}

/** « 1 dégommage » / « 3 dégommages ». */
function dealtLabel(count: number): string {
  return `${count} dégommage${count > 1 ? 's' : ''}`
}

/**
 * « Qui dégomme qui » spotlight, condensed into a single two-column card:
 * nemesis on the left, favourite victim on the right.
 */
export function RivalryTile({ rivalry }: RivalryTileProps) {
  const { nemesis, favoriteVictim } = rivalry
  if (nemesis === null && favoriteVictim === null) return null

  const hasBoth = nemesis !== null && favoriteVictim !== null

  return (
    <Card className={`grid gap-3 px-4 py-3 ${hasBoth ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {nemesis ? (
        <div className="lb-riv-cell">
          <p className="sec-label flex items-center gap-1.5">
            <Icon name="sword" size={13} className="shrink-0 text-bronze" />
            Ta bête noire
          </p>
          <p className="m-0 truncate text-sm font-bold">{nemesis.username}</p>
          <p className="m-0 text-xs text-ink-soft">{sufferedLabel(nemesis.count)}</p>
        </div>
      ) : null}
      {favoriteVictim ? (
        <div className="lb-riv-cell">
          <p className="sec-label flex items-center gap-1.5">
            <Icon name="sword" size={13} className="shrink-0 text-bronze" />
            Ta victime préférée
          </p>
          <p className="m-0 truncate text-sm font-bold">{favoriteVictim.username}</p>
          <p className="m-0 text-xs text-ink-soft">{dealtLabel(favoriteVictim.count)}</p>
        </div>
      ) : null}
    </Card>
  )
}
