'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage } from '@/lib/ws-errors'

interface RematchButtonProps {
  /** A finished game the viewer played in (SPECS.md §« Rejouer »). */
  finishedGameId: string
  variant?: 'primary' | 'ghost'
}

/**
 * « Revanche ! » — asks the server for a fresh lobby at the same format with every
 * former player re-invited, then lands the caller in it as host.
 */
export function RematchButton({ finishedGameId, variant = 'ghost' }: RematchButtonProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const [pending, setPending] = useState(false)

  const rematch = async (): Promise<void> => {
    if (!socket || pending) return
    setPending(true)
    const ack = await emitWithAck(socket, 'replay:create', { finishedGameId })
    if (ack.ok) {
      // The rematch lobby becomes the resume banner on Accueil and the lobby
      // the Amis screen can invite into.
      invalidate('home', 'friends')
      router.push(`/lobby/${ack.gameId}`)
      return
    }
    setPending(false)
    toast(ackErrorMessage(ack), 'error')
  }

  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() => {
        void rematch()
      }}
    >
      Revanche !
    </Button>
  )
}
