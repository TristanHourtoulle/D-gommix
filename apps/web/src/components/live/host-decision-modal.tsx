'use client'

import type { PendingEndRequest } from '@degommix/game-core'
import { Button } from '@/components/ui/button'
import { Modal } from './overlay'
import { displayName, type NameMap } from './types'

/** French one-liner describing a pending end request (banner + host modal). */
export function describeEndRequest(request: PendingEndRequest, names: NameMap): string {
  const requester = displayName(names, request.requesterId)
  if (request.kind === 'village') {
    const winner = request.designatedWinnerId ? displayName(names, request.designatedWinnerId) : '?'
    return `${requester} annonce que ${winner} a atteint le village`
  }
  if (request.kind === 'abandon_individual') return `${requester} souhaite abandonner la partie`
  return `${requester} demande d’arrêter la partie pour tout le monde`
}

interface HostDecisionModalProps {
  request: PendingEndRequest
  names: NameMap
  onRespond: (accept: boolean) => void
}

/** Host-only decision modal for a pending end request (`respond_end`). */
export function HostDecisionModal({ request, names, onRespond }: HostDecisionModalProps) {
  return (
    <Modal title="Demande de fin de partie">
      <p className="m-0 mb-3 text-center text-sm">{describeEndRequest(request, names)}.</p>
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => {
            onRespond(true)
          }}
        >
          Valider
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onRespond(false)
          }}
        >
          Rejeter
        </Button>
      </div>
    </Modal>
  )
}
