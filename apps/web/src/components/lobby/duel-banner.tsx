'use client'

import { Icon } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { Pill } from '@/components/ui/pill'
import { useRivalryPairsSnapshot } from '@/hooks/use-tab-data'
import type { LobbyState } from '@/lib/realtime-types'
import { findDuelRival } from './duel'

interface DuelBannerProps {
  lobby: LobbyState
  meId: string
}

/**
 * « Duel » framing of a 1v1 camp against a known rival, with the running
 * score of the feud. Read-only: the pairs come from the Classement cache and
 * are never fetched (see `useRivalryPairsSnapshot`), so a lobby reached
 * without that payload renders nothing at all. Safe to render from the client
 * lobby tree only — LobbyScreen shows its « Connexion au camp… » branch until
 * the socket delivers a state, so this never differs from the server HTML.
 */
export function DuelBanner({ lobby, meId }: DuelBannerProps) {
  const pairs = useRivalryPairsSnapshot()
  const rival = findDuelRival(lobby, meId, pairs)
  if (rival === null) return null

  return (
    <Card className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="sec-label">Duel</p>
        <Pill variant="bronze">Règlement de comptes</Pill>
      </div>
      <p className="m-0 text-sm font-bold">Toi contre {rival.username}</p>
      <p className="m-0 flex items-center gap-2 text-xs text-ink-soft">
        <Icon name="sword" size={13} className="shrink-0" />
        {rival.username} t’a dégommé {rival.taken} fois · tu l’as dégommé {rival.dealt} fois
      </p>
    </Card>
  )
}
