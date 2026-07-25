'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/components/socket-provider'
import { useFriendsEvents } from '@/hooks/use-friends-events'
import { usePresence } from '@/hooks/use-presence'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage, DELIVERY_FAILED_MESSAGE } from '@/lib/ws-errors'
import type { CommandMap, CommandName } from '@/lib/realtime-types'
import type { FriendEntry, ReceivedRequest, SentRequest } from '@/lib/queries/friends'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { FriendRow } from './friend-row'
import { RequestRow } from './request-row'
import { SearchBar } from './search-bar'

interface FriendsScreenProps {
  received: ReceivedRequest[]
  sent: SentRequest[]
  friends: FriendEntry[]
  myLobbyId: string | null
}

/**
 * Client shell of the Amis screen: SSR lists as props, live presence via
 * `presence:update`, list refresh on `friends:event`, ws commands with acks.
 */
export function FriendsScreen({ received, sent, friends, myLobbyId }: FriendsScreenProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useFriendsEvents(() => router.refresh())

  const initialPresence = useMemo(
    () => Object.fromEntries(friends.map((friend) => [friend.id, friend.initialPresence])),
    [friends]
  )
  const { presenceOf } = usePresence(initialPresence)

  const run = useCallback(
    async <K extends CommandName>(
      key: string,
      event: K,
      payload: CommandMap[K]['payload'],
      successMessage?: string
    ): Promise<boolean> => {
      if (!socket) {
        toast(DELIVERY_FAILED_MESSAGE, 'error')
        return false
      }
      setBusyKey(key)
      const ack = await emitWithAck(socket, event, payload)
      setBusyKey(null)
      if (!ack.ok) {
        toast(ackErrorMessage(ack), 'error')
        return false
      }
      if (successMessage) toast(successMessage)
      router.refresh()
      return true
    },
    [socket, toast, router]
  )

  const requestFriend = useCallback(
    (receiverId: string) =>
      run(receiverId, 'friends:request', { receiverId }, 'Demande envoyée !'),
    [run]
  )

  const hasInvitableFriend = friends.some((friend) => presenceOf(friend.id) !== 'in_game')

  return (
    <div className="flex flex-col gap-5">
      <SearchBar onRequest={requestFriend} />

      {received.length > 0 ? (
        <section>
          <p className="sec-label">Demandes reçues</p>
          {received.map((request) => (
            <RequestRow
              key={request.requestId}
              variant="received"
              username={request.senderUsername}
              busy={busyKey === request.requestId}
              onAccept={() =>
                void run(
                  request.requestId,
                  'friends:respond',
                  { requestId: request.requestId, accept: true },
                  'Vous êtes maintenant amis !'
                )
              }
              onDecline={() =>
                void run(request.requestId, 'friends:respond', {
                  requestId: request.requestId,
                  accept: false,
                })
              }
            />
          ))}
        </section>
      ) : null}

      {sent.length > 0 ? (
        <section>
          <p className="sec-label">Mes demandes envoyées</p>
          {sent.map((request) => (
            <RequestRow
              key={request.requestId}
              variant="sent"
              username={request.receiverUsername}
              busy={busyKey === request.requestId}
              onCancel={() =>
                void run(request.requestId, 'friends:cancel', {
                  requestId: request.requestId,
                })
              }
            />
          ))}
        </section>
      ) : null}

      <section>
        <p className="sec-label">Tes amis</p>
        {friends.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aucun ami pour l'instant"
            description="Cherche un pseudo ci-dessus pour envoyer ta première demande."
          />
        ) : (
          <>
            {friends.map((friend) => (
              <FriendRow
                key={friend.id}
                friendId={friend.id}
                username={friend.username}
                presence={presenceOf(friend.id)}
                canInvite={myLobbyId !== null}
                busy={busyKey === friend.id}
                onInvite={() => {
                  if (!myLobbyId) return
                  void run(
                    friend.id,
                    'lobby:invite',
                    { gameId: myLobbyId, friendId: friend.id },
                    'Invitation envoyée !'
                  )
                }}
                onRemove={() => void run(friend.id, 'friends:remove', { friendId: friend.id })}
              />
            ))}
            {!myLobbyId && hasInvitableFriend ? (
              <p className="helper-text">
                Crée un salon depuis l&apos;onglet Jouer pour inviter tes amis.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
