import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { COTE_MIN_GAMES } from '@/lib/cote'
import type { LeaderboardPayload } from '@/lib/api-payloads'

type CotePayload = NonNullable<LeaderboardPayload['cotes']>

interface CoteCardProps {
  cotes: CotePayload
  /** Identity source: leaderboard rows carry username and avatar. */
  rows: LeaderboardPayload['rows']
  viewerId: string
}

interface CoteLine {
  userId: string
  username: string
  avatarId: string | null
  /** Rounded sesterces, or null when the player is not rated yet. */
  cote: number | null
  /** Change on the last rated game; always 0 on an unrated line. */
  trend: number
}

/**
 * « La Cote du guerrier » — the circle ranked by Elo rating rather than by the
 * Lauriers order (victoires > winrate > dégommages). The two disagree
 * constantly, and that disagreement is the point: beating the player who wins
 * everything is worth more than beating the one who never wins.
 *
 * All-time by construction and never windowed by the period toggle, hence the
 * explicit « depuis toujours » subtitle. A player below COTE_MIN_GAMES rated
 * games prints « — »: a rating built from one game is noise dressed as
 * precision. The threshold reads the fold's own count, never the row's
 * villageGames — that field IS windowed by `?period=`. When nobody clears the
 * threshold the whole card renders null, like RecordsCard with no lines.
 */
export function CoteCard({ cotes, rows, viewerId }: CoteCardProps) {
  const byUser = new Map(cotes.map((entry) => [entry.userId, entry]))

  const lines: CoteLine[] = rows.map((row) => {
    const entry = byUser.get(row.userId)
    const rated = entry !== undefined && entry.games >= COTE_MIN_GAMES ? entry : null
    return {
      userId: row.userId,
      username: row.username,
      avatarId: row.avatarId ?? null,
      cote: rated === null ? null : rated.cote,
      trend: rated === null ? 0 : rated.trend,
    }
  })

  // Rated players first by cote; the unrated tail keeps the leaderboard's own
  // last tiebreaker rather than leaking the hidden rating behind their « — ».
  lines.sort((a, b) => {
    if (a.cote !== null && b.cote !== null) {
      return b.cote - a.cote || a.username.localeCompare(b.username, 'fr')
    }
    if (a.cote !== null) return -1
    if (b.cote !== null) return 1
    return a.username.localeCompare(b.username, 'fr')
  })

  if (!lines.some((line) => line.cote !== null)) return null

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="sec-label">La Cote du guerrier</p>
        <p className="m-0 text-xs text-ink-soft">Sesterces — depuis toujours</p>
      </div>
      <div className="flex flex-col">
        {lines.map((line, index) => {
          const isViewer = line.userId === viewerId
          return (
            <div
              key={line.userId}
              data-testid={`cote-row-${line.username}`}
              className={`flex items-center gap-2.5 py-2.5 ${
                isViewer ? 'lb-row-me' : index > 0 ? 'border-t border-parchment-line/60' : ''
              }`}
            >
              <PlayerAvatar username={line.username} size={40} avatarId={line.avatarId} />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  isViewer ? 'font-bold' : 'font-medium'
                }`}
              >
                {line.username}
              </span>
              {isViewer ? <span className="lb-you">TOI</span> : null}
              {line.cote !== null && line.trend !== 0 ? (
                <span
                  className={`shrink-0 font-mono text-xs font-semibold ${
                    line.trend > 0 ? 'text-bronze' : 'text-ink-soft'
                  }`}
                >
                  <span aria-hidden>
                    {line.trend > 0 ? `▲ +${line.trend}` : `▼ −${Math.abs(line.trend)}`}
                  </span>
                  <span className="sr-only">
                    {line.trend > 0
                      ? `en hausse de ${line.trend} sesterces`
                      : `en baisse de ${Math.abs(line.trend)} sesterces`}
                  </span>
                </span>
              ) : null}
              <span
                className="shrink-0 font-mono text-xs font-semibold text-ink-soft"
                title={
                  line.cote === null
                    ? `Moins de ${COTE_MIN_GAMES} parties classées`
                    : `${line.cote} sesterces`
                }
              >
                {line.cote === null ? '—' : line.cote}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
