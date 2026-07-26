import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardRow } from '@/lib/queries/stats'

interface RankingTableProps {
  rows: LeaderboardRow[]
  viewerId: string
}

/**
 * Ranks below the podium (4+), sorted per §5.3 (wins > winrate > degommages).
 * The viewer's row gets the bronze-tint pill, the « TOI » micro-pill and its
 * villageGames count.
 */
export function RankingTable({ rows, viewerId }: RankingTableProps) {
  return (
    <Card className="px-4 py-1">
      {rows.map((row, index) => {
        const isViewer = row.userId === viewerId
        return (
          <Link
            key={row.userId}
            href={`/amis/${row.userId}`}
            data-testid={`ranking-row-${row.username}`}
            aria-label={`Voir le profil de ${row.username}`}
            className={`flex items-center gap-2.5 py-2.5 ${
              isViewer ? 'lb-row-me' : index > 0 ? 'border-t border-parchment-line/60' : ''
            } no-underline`}
            style={{ color: 'inherit' }}
          >
            <span className="w-5 shrink-0 text-center font-mono text-sm font-bold text-bronze">
              {row.rank}
            </span>
            <PlayerAvatar username={row.username} size={32} avatarId={row.avatarId ?? null} />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${isViewer ? 'font-bold' : 'font-medium'}`}
            >
              {row.username}
            </span>
            {isViewer ? <span className="lb-you">TOI</span> : null}
            <span className="shrink-0 font-mono text-xs font-semibold text-ink-soft">
              {row.wins} v · {row.winrate}%
            </span>
            {(row.currentStreak ?? 0) >= 2 ? (
              <span className="lb-chip" title={`Série de ${row.currentStreak} victoires`}>
                Série : {row.currentStreak}
              </span>
            ) : null}
            {isViewer ? (
              <span
                className="shrink-0 font-mono text-xs font-semibold text-ink-soft"
                title={`${row.villageGames} partie${row.villageGames > 1 ? 's' : ''} au village`}
              >
                {row.villageGames} p.
              </span>
            ) : null}
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
          </Link>
        )
      })}
    </Card>
  )
}
