import type { GameState } from '@degommix/game-core'
import { CharacterBadge } from '@/components/ui/character-badge'
import { MomentStamp } from '@/components/ui/moment-stamp'
import { CHARACTER_META } from '@/lib/characters'
import type { JournalEntry } from './use-live-journal'

interface LiveJournalProps {
  entries: JournalEntry[]
  state: GameState
}

/** Folded journal: the two latest actions only, not expandable (design §5.2). */
export function LiveJournal({ entries, state }: LiveJournalProps) {
  return (
    <section className="card relative z-10 flex flex-col gap-2 p-3">
      <p className="sec-label">Journal de la partie</p>
      {entries.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Aucune action pour l’instant.
        </p>
      ) : (
        entries.map((entry) => {
          const character = entry.actorId ? state.players[entry.actorId]?.character : undefined
          return (
            <div key={entry.seq} className="flex items-center gap-2 text-xs font-medium">
              {character ? <CharacterBadge character={character} size="sm" /> : null}
              <span>{entry.label}</span>
              {entry.stamp ? (
                <MomentStamp
                  stamp={entry.stamp}
                  colorVar={character ? CHARACTER_META[character].colorVar : undefined}
                />
              ) : null}
            </div>
          )
        })
      )}
    </section>
  )
}
