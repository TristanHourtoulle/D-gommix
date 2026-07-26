'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameFormat, Presence } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { CodeBoxes, GAME_CODE_LENGTH } from '@/components/ui/code-boxes'
import { EmptyState } from '@/components/ui/empty-state'
import { Pill } from '@/components/ui/pill'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { PRESENCE_COLOR, PRESENCE_LABEL } from '@/components/ui/presence-dot'
import { SectionTitle } from '@/components/ui/section-title'
import { useToast } from '@/components/ui/toast'
import { formatLastSeen } from '@/components/friends/last-seen'
import { inviteMeta } from '@/components/home/format'
import { useFriendsEvents } from '@/hooks/use-friends-events'
import { useInviteFriend } from '@/hooks/use-invite-friend'
import { useInvites } from '@/hooks/use-invites'
import { usePresence } from '@/hooks/use-presence'
import { useFriendsData, useInvalidateTabData } from '@/hooks/use-tab-data'
import type { FriendsPayload, InvitesPayload } from '@/lib/api-payloads'
import type { FriendsEventPayload } from '@/lib/realtime-types'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage } from '@/lib/ws-errors'
import { FormatSegmented } from './format-segmented'
import { sortByAvailability } from './invitable-order'

const CONNECTING_MESSAGE = 'Connexion en cours, réessaie dans un instant'

interface PlayScreenProps {
  /** SSR payload of the `invites` query: the « Invitations reçues » list. */
  initialInvites: InvitesPayload
  /** SSR payload of the `friends` query: the « Amis » invite strip. */
  initialFriends: FriendsPayload
}

/**
 * Arène tab, « Place du village » layout: one scroll with no Créer/Rejoindre
 * tabs — create card, join-by-code card, invitations (same card vocabulary as
 * the Accueil banner) and the friends strip with one-tap invites.
 */
export function PlayScreen({ initialInvites, initialFriends }: PlayScreenProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const { invites, accept, decline } = useInvites(initialInvites)

  const [format, setFormat] = useState<GameFormat>(2)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const attemptedCode = useRef<string | null>(null)

  const { data: friendsData } = useFriendsData(initialFriends)
  const { friends, myLobbyId } = friendsData
  const { inviteFriend, busyFriendId } = useInviteFriend(myLobbyId)

  // Same invalidation contract as the Amis screen, so the strip stays honest
  // while the user parks on the Arène (friend added, removed, accepted…).
  useFriendsEvents(
    useCallback(
      (event: FriendsEventPayload) => {
        if (event.kind === 'request_accepted') invalidate('friends', 'leaderboard')
        else invalidate('friends')
      },
      [invalidate]
    )
  )

  const initialPresence = useMemo(
    () => Object.fromEntries(friends.map((friend) => [friend.id, friend.initialPresence])),
    [friends]
  )
  const { presenceOf, lastSeenOf } = usePresence(initialPresence)
  const orderedFriends = useMemo(
    () => sortByAvailability(friends, presenceOf),
    [friends, presenceOf]
  )

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
      <SectionTitle sub="Ouvre l'arène ou rejoins la mêlée">Arène</SectionTitle>

      <section className="card flex flex-col gap-3">
        <p className="sec-label">Créer une partie — chacun pour soi</p>
        <FormatSegmented value={format} onChange={setFormat} disabled={creating} />
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? 'Création…' : 'Créer la partie'}
        </Button>
        <p className="helper-text">
          Tu recevras un code à partager, et chacun choisira son personnage dans le lobby.
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <p className="sec-label">Rejoindre avec un code</p>
        <CodeBoxes mode="input" code={code} onChange={handleCodeChange} />
        <p className="helper-text">
          {joining ? 'Connexion à la partie…' : 'Le code se valide tout seul au 6ᵉ caractère.'}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="sec-label">Invitations reçues</p>
          {invites.length > 0 ? <Pill variant="bronze">{invites.length}</Pill> : null}
        </div>
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
              className="card flex items-center gap-2.5"
              style={{ borderColor: 'var(--bronze)' }}
            >
              <PlayerAvatar
                username={invite.hostUsername}
                size={32}
                avatarId={invite.hostAvatarId ?? null}
              />
              <p className="m-0 min-w-0 flex-1 text-sm leading-snug">
                <b className="block truncate">{`${invite.hostUsername} t’invite`}</b>
                {/* Relative age drifts between SSR and hydration: client wins. */}
                <span
                  className="block text-xs"
                  style={{ color: 'var(--ink-faint)' }}
                  suppressHydrationWarning
                >
                  {inviteMeta(invite.format, invite.createdAt)}
                </span>
              </p>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" fullWidth={false} onClick={() => void handleAccept(invite.gameId)}>
                  Rejoindre
                </Button>
                <button
                  type="button"
                  aria-label="Décliner l’invitation"
                  className="cta ghost auto sm"
                  onClick={() => void handleDecline(invite.gameId)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Amis en ligne</p>
        {friends.length === 0 ? (
          <EmptyState
            icon="users"
            title="Tribu déserte"
            description="Ajoute des amis dans l’onglet Tribu pour les inviter d’ici."
          />
        ) : (
          <div className="card flex flex-col gap-3">
            {orderedFriends.map((friend) => {
              const presence = presenceOf(friend.id)
              return (
                <FriendInviteRow
                  key={friend.id}
                  username={friend.username}
                  avatarId={friend.avatarId ?? null}
                  presence={presence}
                  lastSeenAt={lastSeenOf(friend.id) ?? friend.lastSeenAt ?? null}
                  busy={busyFriendId === friend.id}
                  onInvite={() => void inviteFriend(friend.id)}
                />
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

interface FriendInviteRowProps {
  username: string
  avatarId: string | null
  presence: Presence
  /** ISO timestamp of the friend's last connection, null when unknown. */
  lastSeenAt: string | null
  busy: boolean
  onInvite: () => void
}

/** One friend of the Arène strip: presence, last-seen fallback, one-tap invite. */
function FriendInviteRow({
  username,
  avatarId,
  presence,
  lastSeenAt,
  busy,
  onInvite,
}: FriendInviteRowProps) {
  const lastSeenLabel = presence === 'offline' ? formatLastSeen(lastSeenAt) : null

  return (
    <div className="flex items-center gap-2.5">
      <PlayerAvatar username={username} size={32} avatarId={avatarId} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{username}</span>
        <span
          className="flex items-center gap-1.5 text-xs"
          style={{ color: PRESENCE_COLOR[presence] }}
          suppressHydrationWarning
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: PRESENCE_COLOR[presence],
              opacity: presence === 'offline' ? 0.45 : 1,
            }}
          />
          {lastSeenLabel !== null ? `vu ${lastSeenLabel}` : PRESENCE_LABEL[presence]}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        fullWidth={false}
        disabled={presence === 'in_game' || busy}
        onClick={onInvite}
      >
        Inviter
      </Button>
    </div>
  )
}
