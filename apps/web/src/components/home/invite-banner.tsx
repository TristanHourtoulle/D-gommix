'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useInvites } from '@/hooks/use-invites'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import type { InvitesPayload } from '@/lib/api-payloads'
import { ackErrorMessage } from '@/lib/ws-errors'
import { formatLabel } from './format'

interface InviteBannerProps {
  /** SSR payload of the `invites` query, so a pending invite paints instantly. */
  initialData: InvitesPayload
}

/**
 * Invitation banners: accepting routes to the lobby, declining removes the
 * banner. The list is server state, so it survives a reload. Errors are toasts.
 */
export function InviteBanner({ initialData }: InviteBannerProps) {
  const { invites, accept, decline } = useInvites(initialData)
  const router = useRouter()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
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
      if (accepted) {
        // Joining a lobby gives the Accueil its resume banner and the Amis
        // screen the lobby id it needs to forward invitations. The other
        // pending invitations were auto-declined server-side, so the invites
        // payload must refetch too.
        invalidate('home', 'friends', 'invites')
        router.push(`/lobby/${gameId}`)
      }
    } finally {
      setPendingGameId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {invites.map((invite) => (
        <div
          key={invite.gameId}
          className="card flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ borderColor: 'var(--bronze)' }}
        >
          <span className="flex shrink-0" style={{ color: 'var(--bronze-strong)' }} aria-hidden>
            <Icon name="bell" size={20} />
          </span>
          {/*
           * `basis-40` reserves a readable column for the host name: a long name no
           * longer squeezes the text under the actions, the row wraps instead. The
           * actions keep their intrinsic size and stay right-aligned on either row.
           */}
          <p className="m-0 min-w-0 flex-1 basis-40 break-words text-sm">
            <b>{invite.hostUsername} t’invite</b>
            <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
              {formatLabel(invite.format)}
            </span>
          </p>
          <div className="ml-auto flex shrink-0 gap-2">
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
