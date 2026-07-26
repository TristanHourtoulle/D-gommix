import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { RivalryPair, RivalrySpotlight } from '@/lib/queries/rivalries'

interface RivalryTileProps {
  rivalry: RivalrySpotlight
  /** Full « qui dégomme qui » list; undefined on payloads cached before it shipped. */
  pairs?: RivalryPair[]
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

/** « 3 subis · 5 donnés » — dégommages taken, then dealt, both pluralized. */
function pairCountsLabel(pair: RivalryPair): string {
  const taken = `${pair.taken} subi${pair.taken > 1 ? 's' : ''}`
  const dealt = `${pair.dealt} donné${pair.dealt > 1 ? 's' : ''}`
  return `${taken} · ${dealt}`
}

/**
 * « Qui dégomme qui »: the nemesis / favourite-victim spotlight in a
 * two-column grid, then every circle rivalry as a list, most active first.
 */
export function RivalryTile({ rivalry, pairs }: RivalryTileProps) {
  const { nemesis, favoriteVictim } = rivalry
  const listedPairs = pairs ?? []
  if (nemesis === null && favoriteVictim === null && listedPairs.length === 0) return null

  const hasBoth = nemesis !== null && favoriteVictim !== null

  return (
    <Card className="flex flex-col gap-3 px-4 py-3">
      <div className={`grid gap-3 ${hasBoth ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
      </div>
      {listedPairs.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-parchment-line pt-3">
          <p className="sec-label">Rivalités</p>
          {listedPairs.map((pair) => (
            <div key={pair.userId} className="flex items-center gap-2">
              <PlayerAvatar username={pair.username} size={32} avatarId={pair.avatarId} />
              <p className="m-0 min-w-0 flex-1 truncate text-sm font-bold">{pair.username}</p>
              <p className="m-0 shrink-0 text-xs text-ink-soft">{pairCountsLabel(pair)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
