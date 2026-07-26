import { Card } from '@/components/ui/card'
import { MomentStamp } from '@/components/ui/moment-stamp'
import type { JournalEntry } from '@/lib/queries/stats'
import { formatEventTime } from './format'

interface GameJournalProps {
  entries: JournalEntry[]
  /** userId → camp colour CSS variable, for the moment stamps. */
  colorByUser?: Record<string, string>
}

/** Full timestamped journal of a finished game, in seq order. */
export function GameJournal({ entries, colorByUser }: GameJournalProps) {
  return (
    <div>
      <p className="sec-label">Journal de partie</p>
      <Card className="px-4 py-1">
        <ol className="m-0 list-none p-0">
          {entries.map((entry, index) => (
            <li
              key={entry.seq}
              className={`flex items-baseline gap-3 py-2 ${index > 0 ? 'border-t border-parchment-line/60' : ''}`}
            >
              <time
                className="shrink-0 font-mono text-[0.68rem] text-ink-faint"
                dateTime={entry.at.toISOString()}
              >
                {formatEventTime(entry.at)}
              </time>
              <span className="text-sm">{entry.text}</span>
              {entry.stamp ? (
                <MomentStamp
                  stamp={entry.stamp}
                  colorVar={entry.actorId === null ? undefined : colorByUser?.[entry.actorId]}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
