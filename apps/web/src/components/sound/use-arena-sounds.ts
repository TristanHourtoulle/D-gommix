'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { GameState } from '@degommix/game-core'
import { PAF_DELAY_MS, soundCue, type ArenaSnapshot } from './arena-sounds'
import { armAudioUnlock, playArenaSound, releaseArenaAudio } from './sound-player'
import { getSoundServerSnapshot, getSoundSnapshot, subscribeSound } from './sound-preference'

/**
 * Mounts « Les sons de l’arène » on the live screen. It is the single trigger
 * point: no component calls the player directly.
 *
 * The preference is read through the store rather than from localStorage, so
 * flipping the toggle in « Ta hutte » takes effect on the next render of an
 * already-open arena, without a reload.
 */
export function useArenaSounds(state: GameState | null): void {
  const preference = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot
  )

  const previousRef = useRef<ArenaSnapshot | null>(null)

  useEffect(() => {
    if (preference === 'off') {
      releaseArenaAudio()
      return
    }
    return armAudioUnlock()
  }, [preference])

  useEffect(() => {
    if (state === null) return
    const current: ArenaSnapshot = {
      hitCount: state.degommageLog.length,
      finished: state.status === 'finished',
      winnerId: state.winnerId,
    }
    const cue = soundCue(previousRef.current, current)
    // The baseline is recorded whatever the preference, and BEFORE anything
    // plays: turning the sound on mid-game must not replay the backlog, and a
    // re-entrant render must not see a stale previous snapshot.
    previousRef.current = current
    if (preference === 'off') return

    if (cue === 'hit') {
      playArenaSound('carnyx')
      playArenaSound('paf', PAF_DELAY_MS)
      return
    }
    if (cue === 'endgame') playArenaSound('fanfare')
  }, [state, preference])
}
