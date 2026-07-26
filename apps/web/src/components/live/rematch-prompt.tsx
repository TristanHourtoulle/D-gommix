'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useInvites } from '@/hooks/use-invites'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import type { InvitesPayload } from '@/lib/api-payloads'
import type { InviteCanceledPayload, InviteReceivedPayload } from '@/lib/realtime-types'
import { ackErrorMessage } from '@/lib/ws-errors'

interface RematchPromptProps {
  /** The finished game on screen — only its rematch invitations prompt here. */
  currentGameId: string
  /** SSR payload of the `invites` query (seeded by the /partie page shell). */
  initialInvites: InvitesPayload
}

interface RematchInvite {
  gameId: string
  hostUsername: string
}

/**
 * Consent step of « Revanche ! » (SPECS.md §Rejouer): when a former player
 * fires `replay:create`, the others are still on the summary screen where no
 * invitation banner renders. This card catches the live `invite:received`
 * carrying `rematchOf === currentGameId` and lets the viewer accept (→ the
 * rematch lobby) or decline without leaving the recap. `rematchOf` only rides
 * the live broadcast (it has no db column), so the prompt keeps it in local
 * state instead of the invites cache, which a refetch would strip; after a
 * reload the invitation still shows as a regular banner on the Accueil.
 */
export function RematchPrompt({ currentGameId, initialInvites }: RematchPromptProps) {
  const { socket } = useSocket()
  const router = useRouter()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const { accept, decline } = useInvites(initialInvites)
  const [invite, setInvite] = useState<RematchInvite | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!socket) return
    const onReceived = (payload: InviteReceivedPayload): void => {
      if (payload.rematchOf !== currentGameId) return
      setInvite({ gameId: payload.gameId, hostUsername: payload.hostUsername })
    }
    const onCanceled = ({ gameId }: InviteCanceledPayload): void => {
      setInvite((current) => (current?.gameId === gameId ? null : current))
    }
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket, currentGameId])

  if (invite === null) return null

  const respond = async (accepted: boolean): Promise<void> => {
    if (pending) return
    setPending(true)
    try {
      const ack = accepted ? await accept(invite.gameId) : await decline(invite.gameId)
      if (!ack.ok) {
        toast(ackErrorMessage(ack), 'error')
        return
      }
      if (accepted) {
        // Joining the rematch lobby rewrites the resume banner and the lobby
        // the Amis screen forwards invitations into; other pending invitations
        // were auto-declined server-side.
        invalidate('home', 'friends', 'invites')
        router.push(`/lobby/${invite.gameId}`)
        return
      }
      setInvite(null)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="card flex flex-col gap-2 p-3"
      style={{ borderColor: 'var(--bronze)' }}
      data-testid="rematch-prompt"
    >
      <p className="m-0 text-sm font-bold">{invite.hostUsername} veut sa revanche !</p>
      <Button disabled={pending} onClick={() => void respond(true)}>
        Revanche !
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => void respond(false)}>
        Une autre fois
      </Button>
    </div>
  )
}
