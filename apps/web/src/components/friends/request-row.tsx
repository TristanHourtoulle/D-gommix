'use client'

import { PlayerAvatar } from '@/components/ui/player-avatar'
import { RoundIconButton } from './round-icon-button'

interface ReceivedRequestRowProps {
  variant: 'received'
  username: string
  busy: boolean
  onAccept: () => void
  onDecline: () => void
}

interface SentRequestRowProps {
  variant: 'sent'
  username: string
  busy: boolean
  onCancel: () => void
}

type RequestRowProps = ReceivedRequestRowProps | SentRequestRowProps

/** One pending friend request: accept/decline when received, cancel when sent. */
export function RequestRow(props: RequestRowProps) {
  const { username, busy } = props

  return (
    <div className="flex items-center gap-3 py-2">
      <PlayerAvatar username={username} size={32} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-bold">{username}</p>
        <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
          {props.variant === 'received' ? 'veut devenir ton ami' : 'demande envoyée'}
        </p>
      </div>
      {props.variant === 'received' ? (
        <div className="flex items-center gap-2">
          <RoundIconButton
            icon="check"
            label={`Accepter la demande de ${username}`}
            tone="good"
            disabled={busy}
            onClick={props.onAccept}
          />
          <RoundIconButton
            icon="close"
            label={`Refuser la demande de ${username}`}
            tone="bad"
            disabled={busy}
            onClick={props.onDecline}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={props.onCancel}
          className="cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            color: 'var(--ink-soft)',
            borderColor: 'var(--parchment-line)',
            background: 'var(--surface-2)',
          }}
        >
          Annuler
        </button>
      )}
    </div>
  )
}
