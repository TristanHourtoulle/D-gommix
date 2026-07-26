'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  resolveOracleOutcome,
  scoreOraclePicks,
  type GameState,
  type OraclePick,
} from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { oraclePayloadSchema, type OraclePayload } from '@/lib/api-payloads'
import { displayName, type NameMap } from './types'

interface OracleRevealProps {
  gameId: string
  /** The finished state the Banquet is already rendering. */
  state: GameState
  names: NameMap
}

/**
 * « L'Oracle a parlé » — the reveal block of the Banquet (plan 040).
 *
 * The predictions come over HTTP (they are secret and the socket never carried
 * them); the SCORING is done here, locally, with `scoreOraclePicks` over the
 * finished GameState this screen already holds. Nothing about who was right is
 * ever persisted or transported — it is a pure function of the log plus the
 * picks, so it stays correct after a reload, on a second device, and if the
 * point values are retuned later.
 *
 * Renders nothing when nobody predicted, which is the common case and, for
 * every game played before this feature shipped, the only case.
 */
export function OracleReveal({ gameId, state, names }: OracleRevealProps) {
  const { data } = useQuery({
    // Not in `@/lib/query-keys`: that module holds the tab data endpoints, and
    // this one is game-scoped and never invalidated — a finished game's picks
    // are immutable. Same reasoning as `SealUnlocks`.
    queryKey: ['oracle', gameId],
    queryFn: async (): Promise<OraclePayload> => {
      const response = await fetch(`/api/oracle?gameId=${gameId}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`/api/oracle failed (${response.status})`)
      return oraclePayloadSchema.parse(await response.json())
    },
    staleTime: Infinity,
  })

  const picks = useMemo(() => data?.picks ?? [], [data])
  const outcome = useMemo(() => resolveOracleOutcome(state), [state])
  const scores = useMemo(() => {
    const input: OraclePick[] = picks.map((pick) => ({
      userId: pick.userId,
      predictedWinnerId: pick.predictedWinnerId,
      predictedSouffreDouleurId: pick.predictedSouffreDouleurId,
    }))
    return scoreOraclePicks(input, outcome)
  }, [picks, outcome])

  // Loading, error and "nobody predicted" all render nothing: a failed fetch
  // must never break the Banquet.
  if (picks.length === 0) return null

  const byUser = new Map(picks.map((pick) => [pick.userId, pick]))

  return (
    <section className="card relative flex flex-col gap-3 p-4" data-testid="oracle-reveal">
      <p className="sec-label m-0">L’Oracle a parlé</p>
      {scores.map((score) => {
        const pick = byUser.get(score.userId)
        if (!pick) return null
        return (
          <div key={score.userId} className="flex items-center gap-3">
            <PlayerAvatar username={pick.username} size={40} avatarId={pick.avatarId} />
            <div className="min-w-0 flex-1">
              <p className="m-0 font-bold">{displayName(names, score.userId)}</p>
              <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                a prédit {pick.predictedWinnerUsername}{' '}
                <Verdict hit={score.winnerHit} limb="vainqueur" />
                {pick.predictedSouffreDouleurUsername === null ? null : (
                  <>
                    {' '}
                    et {pick.predictedSouffreDouleurUsername} en souffre-douleur{' '}
                    <Verdict hit={score.souffreDouleurHit} limb="souffre-douleur" />
                  </>
                )}
              </p>
            </div>
            <b
              className="font-mono text-lg"
              style={{ color: score.points > 0 ? 'var(--bronze)' : 'var(--ink-faint)' }}
            >
              {score.points > 0 ? `+${score.points}` : '0'}
            </b>
          </div>
        )
      })}
      {outcome.souffreDouleurId === null ? (
        <p className="helper-text m-0">
          Pas de souffre-douleur désigné cette fois — le point n’est pas attribué.
        </p>
      ) : null}
    </section>
  )
}

/** ✓ / ✗ marker for one limb of a prediction; absent ≠ wrong, so it is never drawn alone. */
function Verdict({ hit, limb }: { hit: boolean; limb: string }) {
  if (hit) {
    return (
      <span style={{ color: 'var(--bronze)' }}>
        <Icon name="check" size={12} title={`${limb} trouvé`} />
      </span>
    )
  }
  return (
    <span style={{ color: 'var(--ink-faint)' }} role="img" aria-label={`${limb} manqué`}>
      ✗
    </span>
  )
}
