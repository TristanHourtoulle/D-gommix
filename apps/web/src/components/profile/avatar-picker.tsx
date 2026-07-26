'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { useToast } from '@/components/ui/toast'
import { AVATAR_BOARDS, AVATAR_BOARD_LABELS, AVATARS, avatarsOfBoard } from '@/lib/avatars'

interface AvatarPickerProps {
  username: string
  currentAvatarId: string | null
}

/** Grid of the sixteen avatars, grouped by board, plus a « no avatar » option. */
export function AvatarPicker({ username, currentAvatarId }: AvatarPickerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<string | null>(currentAvatarId)
  const [pending, setPending] = useState(false)
  // Expanded by default only when the player has never picked an avatar.
  const [open, setOpen] = useState(currentAvatarId === null)

  const save = async (avatarId: string | null): Promise<void> => {
    if (pending) return
    const previous = selected
    setSelected(avatarId)
    setPending(true)
    const response = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatarId }),
    })
    setPending(false)
    if (!response.ok) {
      setSelected(previous)
      toast('Impossible d’enregistrer l’avatar', 'error')
      return
    }
    toast('Avatar mis à jour')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    const selectedLabel =
      AVATARS.find((avatar) => avatar.id === selected)?.label ?? 'Aucun (initiale)'
    return (
      <div className="flex items-center gap-3">
        <PlayerAvatar username={username} size={56} avatarId={selected} />
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {selectedLabel}
        </span>
        <Button
          variant="ghost"
          fullWidth={false}
          onClick={() => {
            setOpen(true)
          }}
        >
          Changer d&apos;avatar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {AVATAR_BOARDS.map((board) => (
        <div key={board} className="flex flex-col gap-2">
          <p className="sec-label">{AVATAR_BOARD_LABELS[board]}</p>
          <div className="grid grid-cols-4 gap-3">
            {avatarsOfBoard(board).map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                className="avatar-choice"
                aria-pressed={selected === avatar.id}
                aria-label={`${avatar.label} — ${avatar.hint}`}
                disabled={pending}
                onClick={() => {
                  void save(avatar.id)
                }}
              >
                <PlayerAvatar username={username} size={56} avatarId={avatar.id} />
                <span className="avatar-choice-name">{avatar.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="avatar-choice none"
        aria-pressed={selected === null}
        disabled={pending}
        onClick={() => {
          void save(null)
        }}
      >
        <PlayerAvatar username={username} size={56} avatarId={null} />
        <span className="avatar-choice-name">Aucun (initiale)</span>
      </button>
    </div>
  )
}
