import Link from 'next/link'
import { StatTile } from '@/components/ui/stat-tile'
import type { Gazette } from '@/lib/gazette/render'
import type { GazetteFacts } from '@/lib/gazette/facts'
import type { GameDetailPlayer } from '@/lib/queries/stats'
import { formatClock } from './format'

interface GazetteParchmentProps {
  gameId: string
  gazette: Gazette
  facts: GazetteFacts
  players: GameDetailPlayer[]
}

/**
 * The front page. A server component with no state, no effects and no
 * animation: a printed page does not move, which also keeps the
 * prefers-reduced-motion surface of this route at exactly zero.
 */
export function GazetteParchment({ gameId, gazette, facts, players }: GazetteParchmentProps) {
  // Both columns read the gazette's own net-of-undos counts, so the box can
  // never disagree with the sentences printed above it.
  const dealtBy = new Map(facts.dealtCounts.map((row) => [row.userId, row.count]))
  const takenBy = new Map(facts.takenCounts.map((row) => [row.userId, row.count]))

  return (
    <>
      <article className="gz-sheet">
        <header className="gz-masthead">
          <p className="gz-title">{gazette.masthead}</p>
          <p className="gz-edition">{gazette.edition}</p>
        </header>

        <h1 className="gz-headline">{gazette.headline}</h1>
        <p className="gz-lede">{gazette.lede}</p>

        <p className="sec-label">Brèves du sanglier</p>
        <ul className="gz-briefs">
          {gazette.briefs.map((brief) => (
            <li key={brief}>{brief}</li>
          ))}
        </ul>

        <div className="stat-row">
          <StatTile
            icon="timer"
            label="Durée"
            value={facts.durationSeconds !== null ? formatClock(facts.durationSeconds) : '—'}
          />
          <StatTile icon="sword" label="Dégommages" value={facts.totalDegommages} />
          <StatTile icon="undo" label="Annulations" value={facts.undoTotal} />
        </div>

        <div className="gz-box">
          <ul className="m-0 list-none p-0">
            {players.map((player) => (
              <li key={player.userId} className="gz-line">
                <span className="min-w-0 flex-1 truncate">{player.username}</span>
                <span className="shrink-0 font-mono text-xs text-ink-soft">
                  {dealtBy.get(player.userId) ?? 0} donnés · {takenBy.get(player.userId) ?? 0}{' '}
                  encaissés
                </span>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <Link href={`/parties/${gameId}`} className="helper-text">
        Retour au détail de partie
      </Link>
    </>
  )
}
