'use client'

import { useCallback, useState } from 'react'
import type { Ack } from '@degommix/game-core'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { MyOraclePick } from '@/lib/queries/oracle'
import type { LobbyPlayer } from '@/lib/realtime-types'

type EmptyAck = Ack<Record<never, never>>

interface OracleCardProps {
  meId: string
  /** Seated players — the only legal prediction targets. */
  players: readonly LobbyPlayer[]
  initialPick: MyOraclePick | null
  disabled: boolean
  onSubmit: (
    predictedWinnerId: string,
    predictedSouffreDouleurId: string | null
  ) => Promise<EmptyAck>
}

/**
 * « L'Oracle » — the optional secret prediction of the lobby (plan 040).
 *
 * OPTIONAL IS THE FEATURE. The card is collapsed by default, it never opens by
 * itself, it never renders a warning, a badge, a countdown or a « tu n'as pas
 * encore prédit », and nothing in the start path reads it. A table that ignores
 * it must be able to play a full game without ever expanding it.
 *
 * It also shows the viewer their OWN prediction and nothing else: no other
 * player's pick, and not even the fact that somebody else has predicted. The
 * reveal happens at the Banquet, once and for everyone.
 */
export function OracleCard({ meId, players, initialPick, disabled, onSubmit }: OracleCardProps) {
  const [pick, setPick] = useState<MyOraclePick | null>(initialPick)
  const [open, setOpen] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(initialPick?.predictedWinnerId ?? null)
  const [souffreId, setSouffreId] = useState<string | null>(
    initialPick?.predictedSouffreDouleurId ?? null
  )

  const seated = players.filter((player) => player.status === 'joined')

  const handleOpen = useCallback(() => {
    setWinnerId(pick?.predictedWinnerId ?? null)
    setSouffreId(pick?.predictedSouffreDouleurId ?? null)
    setOpen(true)
  }, [pick])

  const handleSeal = useCallback(async () => {
    if (winnerId === null) return
    const ack = await onSubmit(winnerId, souffreId)
    if (ack.ok) {
      setPick({ predictedWinnerId: winnerId, predictedSouffreDouleurId: souffreId })
    }
    setOpen(false)
  }, [onSubmit, winnerId, souffreId])

  if (!open) {
    return (
      <section className="card p-4" data-testid="oracle-card">
        <p className="sec-label">L’Oracle</p>
        {pick ? (
          <p className="helper-text" data-testid="oracle-sealed">
            Ta prédiction est scellée.
          </p>
        ) : (
          <p className="helper-text">
            Facultatif — prédis le vainqueur, personne ne le saura avant le banquet.
          </p>
        )}
        <div className="mt-2">
          <Button variant="ghost" size="sm" disabled={disabled} onClick={handleOpen}>
            {pick ? 'Changer ma prédiction' : 'Consulter l’Oracle'}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="card flex flex-col gap-3 p-4" data-testid="oracle-card">
      <p className="sec-label">L’Oracle</p>

      <div className="flex flex-col gap-2" data-testid="oracle-winner-options">
        <p className="text-[0.78rem] font-bold">Qui atteindra le village ?</p>
        <div className="flex flex-wrap gap-2">
          {seated.map((player) => (
            <OracleOption
              key={player.userId}
              player={player}
              meId={meId}
              selected={winnerId === player.userId}
              disabled={disabled}
              onSelect={() => setWinnerId(player.userId)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2" data-testid="oracle-souffre-options">
        <div className="flex items-center gap-2">
          <p className="text-[0.78rem] font-bold">Qui sera le souffre-douleur ?</p>
          <Pill variant="plain">Facultatif</Pill>
        </div>
        <div className="flex flex-wrap gap-2">
          {seated.map((player) => (
            <OracleOption
              key={player.userId}
              player={player}
              meId={meId}
              selected={souffreId === player.userId}
              disabled={disabled}
              onSelect={() => setSouffreId(player.userId)}
            />
          ))}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={souffreId === null}
            onClick={() => setSouffreId(null)}
            className="rounded-xl px-3 py-2 text-[0.74rem]"
            style={{
              border:
                souffreId === null
                  ? '1.5px solid var(--bronze)'
                  : '1.5px dashed var(--parchment-line)',
              background: souffreId === null ? 'var(--surface-2)' : 'transparent',
              color: 'var(--ink-faint)',
            }}
          >
            Je ne me prononce pas
          </button>
        </div>
      </div>

      <Button disabled={disabled || winnerId === null} onClick={() => void handleSeal()}>
        Sceller ma prédiction
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(false)}>
        Plus tard
      </Button>
    </section>
  )
}

interface OracleOptionProps {
  player: LobbyPlayer
  meId: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

/** One tappable player chip. The viewer may bet on themselves — that is allowed. */
function OracleOption({ player, meId, selected, disabled, onSelect }: OracleOptionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[0.76rem]"
      style={{
        border: selected ? '1.5px solid var(--bronze)' : '1.5px dashed var(--parchment-line)',
        background: selected ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <PlayerAvatar username={player.username} size={32} avatarId={player.avatarId} />
      <b>
        {player.username}
        {player.userId === meId ? ' (toi)' : ''}
      </b>
    </button>
  )
}
