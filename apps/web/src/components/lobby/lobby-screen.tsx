'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Ack, CharacterId, GameEvent, GameFormat } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pill } from '@/components/ui/pill'
import { SectionTitle } from '@/components/ui/section-title'
import { useToast } from '@/components/ui/toast'
import { useLobby } from '@/hooks/use-lobby'
import { usePresence } from '@/hooks/use-presence'
import { CHARACTER_META } from '@/lib/characters'
import type { InvitableFriend } from '@/lib/queries/lobby'
import type {
  GameStateSnapshotPayload,
  KickedPayload,
  LobbyState,
} from '@/lib/realtime-types'
import { ackErrorMessage } from '@/lib/ws-errors'
import { CharacterGrid } from './character-grid'
import { CodeDisplay } from './code-display'
import { DuelBanner } from './duel-banner'
import { HostControls } from './host-controls'
import { SeatCard } from './seat-card'

interface LobbyScreenProps {
  gameId: string
  meId: string
  friends: InvitableFriend[]
}

function startBlockReason(lobby: LobbyState): string | null {
  const joined = lobby.players.filter((player) => player.status === 'joined')
  const invited = lobby.players.filter((player) => player.status === 'invited')
  if (invited.length > 0) {
    const names = invited.map((player) => player.username).join(', ')
    return `En attente de ${names} pour rejoindre…`
  }
  if (joined.length < lobby.format) {
    const missing = lobby.format - joined.length
    return missing === 1
      ? 'Encore 1 joueur à faire venir — code ou invitation'
      : `Encore ${missing} joueurs à faire venir — code ou invitation`
  }
  if (joined.some((player) => !player.character)) {
    return 'Chaque joueur doit choisir son personnage'
  }
  return null
}

/** Realtime lobby: code, seats, character picks and host controls. */
export function LobbyScreen({ gameId, meId, friends }: LobbyScreenProps) {
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const { lobby, pickCharacter, invite, cancelInvite, kick, setFormat, start, leave } =
    useLobby(gameId)
  // No seed: the connect-time snapshot pushed by the ws-server is kept in the
  // presence store, so it is there even when the lobby is reached by a
  // client-side navigation long after the socket connected.
  const { presenceOf } = usePresence()
  const [busy, setBusy] = useState(false)

  const lobbyRef = useRef<LobbyState | null>(lobby)
  lobbyRef.current = lobby

  useEffect(() => {
    if (!socket) return
    const onKicked = (payload: KickedPayload): void => {
      if (payload.gameId !== gameId) return
      toast('Tu as été expulsé de la partie', 'error')
      router.replace('/')
    }
    const onGameEvent = (event: GameEvent): void => {
      if (event.type === 'GAME_STARTED') router.replace(`/partie/${gameId}`)
    }
    const onSnapshot = (payload: GameStateSnapshotPayload): void => {
      if (payload.gameId === gameId) router.replace(`/partie/${gameId}`)
    }
    socket.on('game:kicked', onKicked)
    socket.on('game:event', onGameEvent)
    socket.on('game:state_snapshot', onSnapshot)
    return () => {
      socket.off('game:kicked', onKicked)
      socket.off('game:event', onGameEvent)
      socket.off('game:state_snapshot', onSnapshot)
    }
  }, [socket, gameId, router, toast])

  const runAction = useCallback(
    async <T extends object>(action: () => Promise<Ack<T>>): Promise<Ack<T> | null> => {
      if (busy) return null
      setBusy(true)
      const ack = await action()
      setBusy(false)
      if (!ack.ok) toast(ackErrorMessage(ack), 'error')
      return ack
    },
    [busy, toast]
  )

  const handlePick = useCallback(
    async (character: CharacterId) => {
      if (busy) return
      setBusy(true)
      const ack = await pickCharacter(character)
      setBusy(false)
      if (ack.ok) return
      if (ack.code === 'CHARACTER_TAKEN') {
        const taker = lobbyRef.current?.players.find((player) => player.character === character)
        const label = CHARACTER_META[character].label
        toast(
          taker
            ? `Trop tard, ${taker.username} a pris ${label}`
            : `Trop tard, ${label} est déjà pris`,
          'error'
        )
        return
      }
      toast(ackErrorMessage(ack), 'error')
    },
    [busy, pickCharacter, toast]
  )

  const handleStart = useCallback(async () => {
    const ack = await runAction(start)
    if (ack?.ok) router.replace(`/partie/${gameId}`)
  }, [runAction, start, router, gameId])

  const handleLeave = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const ack = await leave()
    setBusy(false)
    if (!ack.ok && ack.code !== 'NOT_MEMBER' && ack.code !== 'NOT_FOUND') {
      toast(ackErrorMessage(ack), 'error')
      return
    }
    router.replace('/jouer')
  }, [busy, leave, router, toast])

  if (!lobby) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Connexion au camp…">Le camp</SectionTitle>
        <p className="helper-text">Un instant, on rassemble le village…</p>
      </main>
    )
  }

  const isHost = lobby.hostId === meId
  const startHelper = startBlockReason(lobby)
  const emptySeats = Math.max(0, lobby.format - lobby.players.length)

  return (
    <main className="tab-page">
      <div className="flex items-center justify-between">
        <SectionTitle sub="Partage le code ou invite tes amis">Le camp</SectionTitle>
        <Pill variant="ffa">FFA · {lobby.format} joueurs</Pill>
      </div>

      <CodeDisplay code={lobby.code} />

      <DuelBanner lobby={lobby} meId={meId} />

      <Card className="p-4">
        <p className="sec-label">Joueurs</p>
        {lobby.players.map((player) => (
          <SeatCard
            key={player.userId}
            player={player}
            isMe={player.userId === meId}
            isRowHost={player.userId === lobby.hostId}
            viewerIsHost={isHost}
            onKick={() => void runAction(() => kick(player.userId))}
            onCancelInvite={() => void runAction(() => cancelInvite(player.userId))}
          />
        ))}
        {Array.from({ length: emptySeats }, (_, index) => (
          <div
            key={`empty-${index}`}
            className="my-1 rounded-[10px] py-2 text-center text-[0.74rem]"
            style={{ border: '1.5px dashed var(--parchment-line)', color: 'var(--ink-faint)' }}
          >
            Siège libre — partage le code
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-2">
        <p className="sec-label">Choix des personnages</p>
        <CharacterGrid players={lobby.players} meId={meId} disabled={busy} onPick={handlePick} />
        <p className="helper-text">
          Chaque joueur choisit librement — un 1v1 Caïus Bonus contre Caligula Minus est possible.
        </p>
      </div>

      {isHost ? (
        <HostControls
          format={lobby.format}
          players={lobby.players}
          friends={friends}
          presenceOf={presenceOf}
          canStart={startHelper === null}
          startHelper={startHelper}
          busy={busy}
          onSetFormat={(format: GameFormat) => void runAction(() => setFormat(format))}
          onInvite={(friendId: string) => void runAction(() => invite(friendId))}
          onStart={() => void handleStart()}
        />
      ) : (
        <p className="helper-text">
          {startHelper ?? 'Tout le monde est prêt — en attente du lancement par le chef de camp…'}
        </p>
      )}

      <Button variant="ghost" onClick={() => void handleLeave()} disabled={busy}>
        Lever le camp
      </Button>
    </main>
  )
}
