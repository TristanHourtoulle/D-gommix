import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { TopDegommeur } from '@/lib/queries/stats'

interface TopDegommeurTileProps {
  top: TopDegommeur
}

/**
 * Highlighted « Fléau des Gaules » spotlight card: bronze-tint gradient with
 * the ceremony's conic rays behind the avatar (`.lb-rays`).
 */
export function TopDegommeurTile({ top }: TopDegommeurTileProps) {
  return (
    <Card className="lb-fleau flex flex-col gap-2 px-4 py-3">
      <span className="lb-rays" aria-hidden />
      <p className="sec-label relative">Fléau des Gaules</p>
      <div className="relative flex items-center gap-3">
        <PlayerAvatar username={top.username} size={40} avatarId={top.avatarId ?? null} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold">{top.username}</p>
          <p className="m-0 text-xs text-ink-soft">
            {top.degommages} pion{top.degommages > 1 ? 's' : ''} dégommé
            {top.degommages > 1 ? 's' : ''} au total
          </p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold text-bronze">
          <Icon name="sword" size={18} />
          {top.degommages}
        </span>
      </div>
    </Card>
  )
}
