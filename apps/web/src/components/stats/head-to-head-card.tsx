import { Card } from '@/components/ui/card'
import { Icon } from '@/components/icons'
import type { HeadToHead } from '@/lib/queries/rivalries'
import type { SharedGamesRecord } from '@/lib/shared-games'

interface HeadToHeadCardProps {
  /** Username of the profile being viewed (never the viewer). */
  username: string
  headToHead: HeadToHead
  record: SharedGamesRecord
}

/** « 1 partie ensemble » / « 12 parties ensemble ». */
function playedLabel(played: number): string {
  return `${played} partie${played > 1 ? 's' : ''} ensemble`
}

/** « Duel » card: pair win record plus « qui dégomme qui ». */
export function HeadToHeadCard({ username, headToHead, record }: HeadToHeadCardProps) {
  const noDegommage = headToHead.dealt === 0 && headToHead.taken === 0

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Duel</p>
      {record.played === 0 ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Aucune partie ensemble pour l’instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Icon name="flag" size={14} />
            {playedLabel(record.played)} — tu en as gagné {record.winsMine},{' '}
            {username} en a gagné {record.winsTheirs}
          </p>
          {noDegommage ? (
            <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
              Aucun dégommage entre vous pour l’instant.
            </p>
          ) : (
            <>
              <p className="m-0 flex items-center gap-2 text-sm">
                <Icon name="sword" size={14} />
                {username} t’a dégommé {headToHead.taken} fois
              </p>
              <p className="m-0 flex items-center gap-2 text-sm">
                <Icon name="sword" size={14} />
                Tu l’as dégommé {headToHead.dealt} fois
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
