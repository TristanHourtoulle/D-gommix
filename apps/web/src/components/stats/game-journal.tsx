import { Card } from '@/components/ui/card'
import type { JournalEntry } from '@/lib/queries/stats'
import { formatEventTime } from './format'

interface GameJournalProps {
  entries: JournalEntry[]
}

/** Full timestamped journal of a finished game, in seq order. */
export function GameJournal({ entries }: GameJournalProps) {
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
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
