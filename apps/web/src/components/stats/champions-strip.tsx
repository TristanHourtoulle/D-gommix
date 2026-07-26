'use client'

import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { formatMonthKey } from './format'

type MonthChampion = NonNullable<LeaderboardPayload['season']>['pastChampions'][number]

interface ChampionsStripProps {
  /** Newest month first, as served. */
  champions: MonthChampion[]
  /** Currently browsed archive month, to highlight its chip. */
  activeMonth: string | null
  onSelect: (monthKey: string) => void
}

/** « Champion du mois » ribbon: one chip per completed month with a winner. */
export function ChampionsStrip({ champions, activeMonth, onSelect }: ChampionsStripProps) {
  return (
    <Card>
      <p className="sec-label text-center">Champions des mois passés</p>
      <div className="flex gap-2 overflow-x-auto py-1">
        {champions.map((champion) => (
          <button
            key={champion.month}
            type="button"
            aria-pressed={champion.month === activeMonth}
            title={`Voir le classement de ${formatMonthKey(champion.month)}`}
            onClick={() => onSelect(champion.month)}
            className="lb-chip flex shrink-0 cursor-pointer items-center gap-1"
          >
            <PlayerAvatar
              username={champion.username}
              size={32}
              avatarId={champion.avatarId ?? null}
            />
            {formatMonthKey(champion.month)} — {champion.username} · {champion.wins} v
          </button>
        ))}
      </div>
    </Card>
  )
}
