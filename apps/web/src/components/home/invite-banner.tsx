'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useInvites } from '@/hooks/use-invites'
import { ackErrorMessage } from '@/lib/ws-errors'
import { formatLabel } from './format'

/**
 * Realtime invitation banners (`invite:received`): accepting routes to the
 * lobby, declining removes the banner. Errors surface as toasts.
 */
export function InviteBanner() {
  const { invites, accept, decline } = useInvites()
  const router = useRouter()
  const { toast } = useToast()
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)

  if (invites.length === 0) return null

  const respond = async (gameId: string, accepted: boolean): Promise<void> => {
    setPendingGameId(gameId)
    try {
      const ack = accepted ? await accept(gameId) : await decline(gameId)
      if (!ack.ok) {
        toast(ackErrorMessage(ack), 'error')
        return
      }
      if (accepted) router.push(`/lobby/${gameId}`)
    } finally {
      setPendingGameId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {invites.map((invite) => (
        <div
          key={invite.gameId}
          className="card flex items-center gap-3"
          style={{ borderColor: 'var(--bronze)' }}
        >
          <span className="flex shrink-0" style={{ color: 'var(--bronze-strong)' }} aria-hidden>
            <Icon name="bell" size={20} />
          </span>
          <p className="m-0 min-w-0 flex-1 text-sm">
            <b>{invite.hostUsername} t’invite</b>
            <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
              {formatLabel(invite.format)}
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              fullWidth={false}
              disabled={pendingGameId === invite.gameId}
              onClick={() => void respond(invite.gameId, true)}
            >
              Rejoindre
            </Button>
            <Button
              variant="ghost"
              fullWidth={false}
              disabled={pendingGameId === invite.gameId}
              onClick={() => void respond(invite.gameId, false)}
            >
              Refuser
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
