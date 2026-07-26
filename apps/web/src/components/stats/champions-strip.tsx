'use client'

import { Icon } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { formatMonthKey } from './format'

type MonthChampion = NonNullable<LeaderboardPayload['season']>['pastChampions'][number]

/**
 * `.lb-chip` is unlayered CSS and wins over Tailwind's layered utilities, so
 * the muted variant has to come from an inline style (same trick as
 * records-card.tsx). Module-level constant: stable reference across renders.
 */
const BARDE_CHIP_STYLE = { color: 'var(--ink-faint)', fontSize: '0.56rem' } as const

interface ChampionsStripProps {
  /** Newest month first, as served. */
  champions: MonthChampion[]
  /** Currently browsed archive month, to highlight its chip. */
  activeMonth: string | null
  onSelect: (monthKey: string) => void
}

/**
 * « Champion du mois » ribbon: one chip per completed month with a winner,
 * and under it the month's « Barde du soir » (plan 035) — the last of the
 * same standings. The barde chip is muted and non-interactive on purpose:
 * the champion keeps the primacy and stays the only tap target. Its visible
 * text stays short so the chip never breaks the strip; the full joke —
 * « Assurancetourix ligoté en l’honneur de … » — is its accessible name.
 */
export function ChampionsStrip({ champions, activeMonth, onSelect }: ChampionsStripProps) {
  return (
    <Card>
      <p className="sec-label text-center">Champions des mois passés</p>
      <div className="flex gap-2 overflow-x-auto py-1">
        {champions.map((champion) => (
          <div key={champion.month} className="flex shrink-0 flex-col items-center gap-1">
            <button
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
            {champion.barde ? (
              <span
                className="lb-chip flex max-w-full items-center gap-1"
                style={BARDE_CHIP_STYLE}
                aria-label={`Assurancetourix ligoté en l’honneur de ${champion.barde.username}, dernier des joueurs de ${formatMonthKey(champion.month)}`}
                title={`Assurancetourix ligoté en l’honneur de ${champion.barde.username} — dernier des joueurs de ${formatMonthKey(champion.month)}`}
              >
                <Icon name="lyre-tied" size={12} />
                <span className="truncate">Barde du soir · {champion.barde.username}</span>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
