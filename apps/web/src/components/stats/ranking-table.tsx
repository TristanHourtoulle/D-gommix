import { Card } from '@/components/ui/card'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardRow } from '@/lib/queries/stats'

interface RankingTableProps {
  rows: LeaderboardRow[]
  viewerId: string
}

/** Circle ranking, one row per member, sorted per §5.3 (wins > winrate > degommages). */
export function RankingTable({ rows, viewerId }: RankingTableProps) {
  return (
    <Card className="px-4 py-1">
      {rows.map((row, index) => (
        <div
          key={row.userId}
          data-testid={`ranking-row-${row.username}`}
          className={`flex items-center gap-2.5 py-2.5 ${index > 0 ? 'border-t border-parchment-line/60' : ''}`}
        >
          <span className="w-5 shrink-0 text-center font-mono text-sm font-bold text-bronze">
            {row.rank}
          </span>
          <PlayerAvatar username={row.username} size={32} />
          <span
            className={`min-w-0 flex-1 truncate text-sm ${row.userId === viewerId ? 'font-bold' : 'font-medium'}`}
          >
            {row.username}
          </span>
          <span className="shrink-0 font-mono text-xs font-semibold text-ink-soft">
            {row.wins} v · {row.winrate}%
          </span>
          <span
            className="flex shrink-0 items-center gap-1 font-mono text-xs font-semibold"
            title="Dégommages"
          >
            <Icon name="sword" size={14} className="text-bronze" />
            {row.degommages}
          </span>
          {row.favoriteCharacter ? (
            <CharacterBadge character={row.favoriteCharacter} size="sm" />
          ) : (
            <span
              className="inline-block size-[26px] shrink-0 rounded-full border border-dashed border-parchment-line"
              title="Aucune partie jouée"
              aria-hidden
            />
          )}
        </div>
      ))}
    </Card>
  )
}
