import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { RivalrySpotlight } from '@/lib/queries/rivalries'

interface RivalryTileProps {
  rivalry: RivalrySpotlight
}

/** « Qui dégomme qui » spotlight: my nemesis and my favourite victim. */
export function RivalryTile({ rivalry }: RivalryTileProps) {
  const { nemesis, favoriteVictim } = rivalry
  if (nemesis === null && favoriteVictim === null) return null

  return (
    <Card className="px-4 py-3">
      <p className="sec-label">Rivalités</p>
      <div className="flex flex-col gap-3">
        {nemesis ? (
          <div className="flex items-center gap-3">
            <PlayerAvatar username={nemesis.username} size={32} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs uppercase" style={{ color: 'var(--ink-faint)' }}>
                Ta bête noire
              </p>
              <p className="m-0 truncate text-sm font-bold">
                {nemesis.username} · {nemesis.count} dégommages subis
              </p>
            </div>
            <Icon name="sword" size={16} className="text-bronze" />
          </div>
        ) : null}
        {favoriteVictim ? (
          <div className="flex items-center gap-3">
            <PlayerAvatar username={favoriteVictim.username} size={32} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs uppercase" style={{ color: 'var(--ink-faint)' }}>
                Ta victime préférée
              </p>
              <p className="m-0 truncate text-sm font-bold">
                {favoriteVictim.username} · {favoriteVictim.count} dégommages
              </p>
            </div>
            <Icon name="sword" size={16} className="text-bronze" />
          </div>
        ) : null}
      </div>
    </Card>
  )
}
