'use client'

import { useState } from 'react'
import type { EndKind, PlayerState } from '@degommix/game-core'
import { Button } from '@/components/ui/button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Modal, Sheet } from './overlay'
import { displayName, type NameMap } from './types'

interface EndRequestSheetProps {
  /** Host requests are auto-validated server-side → different confirm copy. */
  isHost: boolean
  /** Players still in game — candidates for the village winner. */
  activePlayers: PlayerState[]
  names: NameMap
  onSubmit: (kind: EndKind, winnerId?: string) => void
  onClose: () => void
}

type Step =
  | { kind: 'options' }
  | { kind: 'pick-winner' }
  | { kind: 'confirm'; end: EndKind; winnerId?: string }

function confirmLabel(step: Extract<Step, { kind: 'confirm' }>, names: NameMap): string {
  if (step.end === 'village') {
    const winner = step.winnerId ? displayName(names, step.winnerId) : '?'
    return `Village atteint par ${winner} — la partie se termine.`
  }
  if (step.end === 'abandon_individual') return 'Tu abandonnes la partie.'
  return 'La partie est arrêtée pour tout le monde, sans vainqueur.'
}

/**
 * « Fin de partie » bottom sheet (design §5.2): village reached with winner
 * selection, individual abandon or full stop — each behind a confirmation
 * modal, stressed when the requester is the host (direct validation).
 */
export function EndRequestSheet({
  isHost,
  activePlayers,
  names,
  onSubmit,
  onClose,
}: EndRequestSheetProps) {
  const [step, setStep] = useState<Step>({ kind: 'options' })

  if (step.kind === 'confirm') {
    return (
      <Modal title="Confirmer la fin de partie">
        <p className="m-0 mb-1 text-center text-sm">{confirmLabel(step, names)}</p>
        <p className="m-0 mb-3 text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
          {isHost
            ? 'Tu es le chef de camp : la demande sera validée immédiatement.'
            : 'Le chef de camp devra valider ta demande.'}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              onSubmit(step.end, step.winnerId)
            }}
          >
            Confirmer
          </Button>
          <Button variant="ghost" onClick={() => setStep({ kind: 'options' })}>
            Retour
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Sheet title="Fin de partie" onClose={onClose}>
      {step.kind === 'options' ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => setStep({ kind: 'pick-winner' })}>Village atteint</Button>
          <Button
            variant="ghost"
            onClick={() => setStep({ kind: 'confirm', end: 'abandon_individual' })}
          >
            J’abandonne
          </Button>
          <Button
            variant="ghost"
            onClick={() => setStep({ kind: 'confirm', end: 'abandon_total' })}
          >
            Tout arrêter
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
            Qui a atteint le village ?
          </p>
          {activePlayers.map((player) => (
            <button
              key={player.userId}
              type="button"
              onClick={() => setStep({ kind: 'confirm', end: 'village', winnerId: player.userId })}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-2 p-2 text-sm font-bold"
              style={{
                borderColor: 'var(--parchment-line)',
                background: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              <CharacterBadge character={player.character} size="sm" />
              {displayName(names, player.userId)}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setStep({ kind: 'options' })}>
            Retour
          </Button>
        </div>
      )}
    </Sheet>
  )
}
