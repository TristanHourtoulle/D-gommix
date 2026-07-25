import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import type { HeadToHead } from '@/lib/queries/rivalries'

interface HeadToHeadCardProps {
  /** Username of the profile being viewed (never the viewer). */
  username: string
  headToHead: HeadToHead
}

/** « Qui dégomme qui » between the viewer and the friend whose profile this is. */
export function HeadToHeadCard({ username, headToHead }: HeadToHeadCardProps) {
  const isEmpty = headToHead.dealt === 0 && headToHead.taken === 0

  return (
    <Card className="px-4 py-3">
      <p className="sec-label">Face à face</p>
      {isEmpty ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Aucun dégommage entre vous pour l’instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="sword" size={14} />
            {username} t’a dégommé {headToHead.taken} fois
          </p>
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="sword" size={14} />
            Tu l’as dégommé {headToHead.dealt} fois
          </p>
        </div>
      )}
    </Card>
  )
}
