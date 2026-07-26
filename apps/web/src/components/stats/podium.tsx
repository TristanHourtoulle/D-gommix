import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardRow } from '@/lib/queries/stats'

interface PodiumProps {
  /** Top 3 leaderboard rows (fewer when the village is smaller). */
  rows: LeaderboardRow[]
  viewerId: string
}

const ROMAN_RANKS = ['I', 'II', 'III'] as const

/**
 * Laurel crown above the #1 column. Podium-sized cousin of `EndgameLaurel`
 * (live/endgame-decor.tsx): that one is a 120px circular wreath animated by
 * the ceremony timeline, too large and too coupled to reuse here — this keeps
 * the same bronze filled-leaf language in a 64×40 crown.
 */
function PodiumCrown() {
  return (
    <svg className="lb-crown" aria-hidden viewBox="0 0 64 40" width="44" height="28">
      <g fill="currentColor">
        <path d="M30 38C16 35 8 24 9 8c3 12 9 22 21 27z" opacity=".18" />
        <path d="M34 38C48 35 56 24 55 8c-3 12-9 22-21 27z" opacity=".18" />
        <path d="M12 26q-7-1-9-7 7 0 9 7z" />
        <path d="M15 31q-7 0-10-5 7-1 10 5z" />
        <path d="M11 19q-6-3-6-9 6 2 6 9z" />
        <path d="M12 12q-4-4-3-9 5 3 3 9z" />
        <path d="M20 35q-6 1-10-3 6-2 10 3z" />
        <path d="M27 38q-5 2-10-1 5-3 10 1z" />
        <path d="M52 26q7-1 9-7-7 0-9 7z" />
        <path d="M49 31q7 0 10-5-7-1-10 5z" />
        <path d="M53 19q6-3 6-9-6 2-6 9z" />
        <path d="M52 12q4-4 3-9-5 3-3 9z" />
        <path d="M44 35q6 1 10-3-6-2-10 3z" />
        <path d="M37 38q5 2 10-1-5-3-10 1z" />
      </g>
    </svg>
  )
}

/**
 * « Podium du village » — top 3 as a 2-1-3 podium on engraved stone socles.
 * Two players → two centred socles in rank order. Each column keeps the
 * `ranking-row-*` testid and profile link contract of the plain table rows;
 * the visually hidden « N v · N% » span preserves the text the e2e asserts.
 */
export function Podium({ rows, viewerId }: PodiumProps) {
  const [first, second, third] = rows.slice(0, 3)
  if (!first) return null

  const columns =
    second && third ? [second, first, third] : second ? [first, second] : [first]

  return (
    <Card className="lb-podium-card">
      <p className="sec-label text-center">Le podium</p>
      <div className="lb-podium">
        {columns.map((row) => (
          <Link
            key={row.userId}
            href={`/amis/${row.userId}`}
            data-testid={`ranking-row-${row.username}`}
            aria-label={`Voir le profil de ${row.username}`}
            className={`lb-pod lb-p${row.rank}${row.userId === viewerId ? ' me' : ''}`}
            style={{ '--i': columns.length - row.rank } as CSSProperties}
          >
            {row.rank === 1 ? (
              <PodiumCrown />
            ) : (
              <span className={`lb-medal${row.rank === 2 ? ' silver' : ''}`} aria-hidden>
                {row.rank}
              </span>
            )}
            <PlayerAvatar
              username={row.username}
              size={row.rank === 1 ? 56 : 40}
              avatarId={row.avatarId ?? null}
            />
            <span className="lb-pod-name">{row.username}</span>
            <span className="sr-only">{`${row.wins} v · ${row.winrate}%`}</span>
            <span className="lb-chips" aria-hidden>
              <span className="lb-chip">{row.wins} v</span>
              <span className="lb-chip">{row.winrate} %</span>
              <span className="lb-chip">{row.villageGames} p.</span>
              <span className="lb-chip">
                <Icon name="sword" size={11} className="text-bronze" />
                {row.degommages}
              </span>
              {(row.currentStreak ?? 0) >= 2 ? (
                <span className="lb-chip">Série : {row.currentStreak}</span>
              ) : null}
            </span>
            <span className="lb-socle" aria-hidden>
              {ROMAN_RANKS[row.rank - 1]}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  )
}
