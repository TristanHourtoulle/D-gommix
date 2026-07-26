import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LeaderboardPayload } from '@/lib/api-payloads'

interface ProphetsTileProps {
  /**
   * Typed against the WIRE payload, not `ProphetRow`: `avatarId` is optional
   * there for old PWA-cached SSR bodies, exactly like the rivalry tiles.
   */
  prophets: LeaderboardPayload['prophets']
}

/** How many prophets the tile shows before it stops. */
const MAX_PROPHETS = 5

/** « 1 vainqueur trouvé sur 2 prédictions » (same singular/plural style as sufferedLabel). */
function recordLabel(exactWinners: number, predictions: number): string {
  const winnerS = exactWinners > 1 ? 's' : ''
  const predictionS = predictions > 1 ? 's' : ''
  return `${exactWinners} vainqueur${winnerS} trouvé${winnerS} sur ${predictions} prédiction${predictionS}`
}

/**
 * « Le cercle des prophètes » — who reads the table best (plan 040).
 *
 * All-time and circle-scoped: it ignores the `?period=` month window on
 * purpose, because an Oracle score is a standing verdict on a player, the same
 * rule the Titres gaulois and the Palmarès records follow.
 *
 * Returns null when the circle has no prediction at all, which is the state of
 * every history recorded before the Oracle shipped: predictions cannot be
 * backfilled, so an empty tile would be a permanent, meaningless zero rather
 * than information.
 */
export function ProphetsTile({ prophets }: ProphetsTileProps) {
  if (!prophets || prophets.length === 0) return null
  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Le cercle des prophètes</p>
      <div data-testid="prophets-tile" className="flex flex-col gap-2">
        {prophets.slice(0, MAX_PROPHETS).map((prophet) => (
          <div key={prophet.userId} className="flex items-center gap-3">
            <PlayerAvatar
              username={prophet.username}
              size={40}
              avatarId={prophet.avatarId ?? null}
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold">{prophet.username}</p>
              <p className="m-0 text-xs text-ink-soft">
                {recordLabel(prophet.exactWinners, prophet.predictions)}
              </p>
            </div>
            <span className="font-mono text-lg font-bold text-bronze">{prophet.points}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
