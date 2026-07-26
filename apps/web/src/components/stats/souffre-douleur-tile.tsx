import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { RivalryPeer } from '@/lib/queries/rivalries'

interface SouffreDouleurTileProps {
  peer: RivalryPeer | null
}

/** « 1 dégommage subi » / « 4 dégommages subis » (same rule as rivalry-tile). */
function sufferedLabel(count: number): string {
  const s = count > 1 ? 's' : ''
  return `${count} dégommage${s} subi${s}`
}

/** Taken-side twin of the « Fléau des Gaules »: who gets hit the most. */
export function SouffreDouleurTile({ peer }: SouffreDouleurTileProps) {
  if (peer === null) return null
  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Souffre-douleur du village</p>
      <div className="flex items-center gap-3">
        <PlayerAvatar username={peer.username} size={40} avatarId={peer.avatarId ?? null} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold">{peer.username}</p>
          <p className="m-0 text-xs text-ink-soft">{sufferedLabel(peer.count)}</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold text-bronze">
          <Icon name="pawn" size={18} />
          {peer.count}
        </span>
      </div>
    </Card>
  )
}
