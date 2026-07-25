'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameFormat } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { CodeBoxes, GAME_CODE_LENGTH } from '@/components/ui/code-boxes'
import { EmptyState } from '@/components/ui/empty-state'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SectionTitle } from '@/components/ui/section-title'
import { useToast } from '@/components/ui/toast'
import { useInvites } from '@/hooks/use-invites'
import type { InvitesPayload } from '@/lib/api-payloads'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage } from '@/lib/ws-errors'
import { FormatSegmented } from './format-segmented'

type PlayMode = 'create' | 'join'

const CONNECTING_MESSAGE = 'Connexion en cours, réessaie dans un instant'

interface ModeTabsProps {
  mode: PlayMode
  onChange: (mode: PlayMode) => void
}

function ModeTabs({ mode, onChange }: ModeTabsProps) {
  const tabs: { id: PlayMode; label: string }[] = [
    { id: 'create', label: 'Créer' },
    { id: 'join', label: 'Rejoindre' },
  ]
  return (
    <div
      className="flex gap-2 rounded-xl p-1"
      role="tablist"
      style={{ background: 'var(--surface)', border: '1.5px solid var(--parchment-line)' }}
    >
      {tabs.map((tab) => {
        const active = tab.id === mode
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className="flex-1 rounded-[9px] py-2 text-[0.78rem] font-bold"
            style={{
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--parchment)' : 'var(--ink-soft)',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface PlayScreenProps {
  /** SSR payload of the `invites` query: the « Invitations reçues » list. */
  initialInvites: InvitesPayload
}

/** Jouer tab: create a lobby (format 2/3/4) or join one (code + invitations). */
export function PlayScreen({ initialInvites }: PlayScreenProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const { invites, accept, decline } = useInvites(initialInvites)

  const [mode, setMode] = useState<PlayMode>('create')
  const [format, setFormat] = useState<GameFormat>(2)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const attemptedCode = useRef<string | null>(null)

  const handleCreate = useCallback(async () => {
    if (creating) return
    if (!socket) {
      toast(CONNECTING_MESSAGE)
      return
    }
    setCreating(true)
    const ack = await emitWithAck(socket, 'lobby:create', { format })
    if (ack.ok) {
      router.push(`/lobby/${ack.gameId}`)
      return
    }
    setCreating(false)
    toast(ackErrorMessage(ack), 'error')
  }, [creating, socket, format, router, toast])

  const submitJoin = useCallback(
    async (value: string) => {
      if (!socket) {
        toast(CONNECTING_MESSAGE)
        return
      }
      setJoining(true)
      const ack = await emitWithAck(socket, 'lobby:join_by_code', { code: value })
      if (ack.ok) {
        router.push(`/lobby/${ack.gameId}`)
        return
      }
      setJoining(false)
      toast(ackErrorMessage(ack), 'error')
    },
    [socket, router, toast]
  )

  useEffect(() => {
    if (joining || code.length !== GAME_CODE_LENGTH) return
    if (attemptedCode.current === code) return
    attemptedCode.current = code
    void submitJoin(code)
  }, [code, joining, submitJoin])

  const handleCodeChange = useCallback((value: string) => {
    if (value.length < GAME_CODE_LENGTH) attemptedCode.current = null
    setCode(value)
  }, [])

  const handleAccept = useCallback(
    async (gameId: string) => {
      const ack = await accept(gameId)
      if (ack.ok) router.push(`/lobby/${gameId}`)
      else toast(ackErrorMessage(ack), 'error')
    },
    [accept, router, toast]
  )

  const handleDecline = useCallback(
    async (gameId: string) => {
      const ack = await decline(gameId)
      if (!ack.ok) toast(ackErrorMessage(ack), 'error')
    },
    [decline, toast]
  )

  return (
    <main className="tab-page">
      <SectionTitle sub="Créer ou rejoindre une partie">Jouer</SectionTitle>
      <ModeTabs mode={mode} onChange={setMode} />

      {mode === 'create' ? (
        <section className="flex flex-col gap-3">
          <p className="s-sub">Nombre de joueurs — chacun pour soi</p>
          <FormatSegmented value={format} onChange={setFormat} disabled={creating} />
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Création…' : 'Créer la partie'}
          </Button>
          <p className="helper-text">
            Tu recevras un code à partager, et chacun choisira son personnage dans le lobby.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="s-sub">Code de la partie</p>
            <CodeBoxes mode="input" code={code} onChange={handleCodeChange} />
            <p className="helper-text">
              {joining ? 'Connexion à la partie…' : 'Le code se valide tout seul au 6ᵉ caractère.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="sec-label">Invitations reçues</p>
            {invites.length === 0 ? (
              <EmptyState
                icon="bell"
                title="Aucune invitation en attente"
                description="Les amis t’invitent en un clic, sans code — reçu directement ici."
              />
            ) : (
              invites.map((invite) => (
                <div
                  key={invite.gameId}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1.5px solid var(--parchment-line)',
                  }}
                >
                  <PlayerAvatar
                    username={invite.hostUsername}
                    size={32}
                    avatarId={invite.hostAvatarId ?? null}
                  />
                  <p className="m-0 flex-1 text-[0.78rem] leading-snug">
                    <b>{invite.hostUsername}</b> t’invite — FFA, {invite.format} joueurs
                  </p>
                  <button
                    type="button"
                    className="cta"
                    style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.65rem' }}
                    onClick={() => void handleAccept(invite.gameId)}
                  >
                    <Icon name="check" size={12} /> Rejoindre
                  </button>
                  <button
                    type="button"
                    aria-label="Décliner l’invitation"
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ border: '1.5px solid var(--parchment-line)', color: 'var(--ink-soft)' }}
                    onClick={() => void handleDecline(invite.gameId)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  )
}
