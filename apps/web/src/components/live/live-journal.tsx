import type { GameState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { MomentStamp } from '@/components/ui/moment-stamp'
import { CHARACTER_META } from '@/lib/characters'
import type { JournalRow } from './use-live-journal'

interface LiveJournalProps {
  rows: JournalRow[]
  state: GameState
}

/**
 * Folded journal: the two latest rows only, not expandable (design §5.2).
 *
 * A row is either an action — the faithful record — or one of the barde's
 * ambient asides (`lib/barde-milestones.ts`), which is decoration and is never
 * persisted. Purely presentational: no hooks, no `'use client'`, so the
 * five-minute gate stays in the hook where it belongs.
 */
export function LiveJournal({ rows, state }: LiveJournalProps) {
  return (
    <section className="card relative z-10 flex flex-col gap-2 p-3">
      <p className="sec-label">Journal de la partie</p>
      {rows.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Aucune action pour l’instant.
        </p>
      ) : (
        rows.map((row) => {
          if (row.kind === 'barde') {
            return (
              <div key={`barde-${row.row.id}`} className="journal-barde">
                <Icon name="lyre" size={14} title="Le barde" />
                <span>{row.row.text}</span>
              </div>
            )
          }
          const { entry } = row
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
