'use client'

import { useCallback, useEffect, useState } from 'react'
import { stepDelayMs, type SimSpeed, type SimTimeline } from './timeline'

export interface TimelinePlayer {
  /** How many events of the timeline are applied. Never below 1. */
  readonly cursor: number
  readonly isPlaying: boolean
  readonly isDone: boolean
  readonly play: () => void
  readonly pause: () => void
  /** Applies exactly one more event and pauses. */
  readonly step: () => void
  /** Back to the opening whistle: cursor 1, paused. */
  readonly restart: () => void
}

/**
 * Drives a {@link SimTimeline} forward on a timer. The cursor starts at 1 —
 * never 0 — because `buildGameState` throws on a log that does not start with
 * GAME_STARTED (`packages/game-core/src/reducer.ts:5`).
 */
export function useTimelinePlayer(timeline: SimTimeline, speed: SimSpeed): TimelinePlayer {
  const [cursor, setCursor] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const total = timeline.events.length

  // A new seed, scenario or player count is a new game: rewind and wait.
  useEffect(() => {
    setCursor(1)
    setIsPlaying(false)
  }, [timeline])

  useEffect(() => {
    if (!isPlaying) return
    if (cursor >= total) {
      setIsPlaying(false)
      return
    }
    if (speed === 'instant') {
      setCursor(total)
      return
    }
    const id = setTimeout(() => {
      setCursor((current) => Math.min(current + 1, total))
    }, stepDelayMs(timeline, cursor, speed))
    return () => {
      clearTimeout(id)
    }
  }, [isPlaying, cursor, speed, timeline, total])

  const play = useCallback(() => {
    setIsPlaying(true)
  }, [])
  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])
  const step = useCallback(() => {
    setIsPlaying(false)
    setCursor((current) => Math.min(current + 1, total))
  }, [total])
  const restart = useCallback(() => {
    setIsPlaying(false)
    setCursor(1)
  }, [])

  return { cursor, isPlaying, isDone: cursor >= total, play, pause, step, restart }
}
