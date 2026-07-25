'use client'

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { useFriendsEvents } from '@/hooks/use-friends-events'
import type { FriendsEventPayload } from '@/lib/realtime-types'
import { applyFriendsEvent, searchResponseSchema, type SearchUser } from './search-results'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

interface SearchBarProps {
  /** Sends `friends:request`; resolves true on success to flip the row state. */
  onRequest: (receiverId: string) => Promise<boolean>
}

/** Debounced username search feeding « Demander en ami » actions. */
export function SearchBar({ onRequest }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [searched, setSearched] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // The results are a snapshot of the relation flags at query time: replay the
  // live friend events on them so an open list never lies (see
  // `./search-results`). The lists below own their own invalidation.
  useFriendsEvents(
    useCallback((event: FriendsEventPayload) => {
      setResults((current) => applyFriendsEvent(current, event))
    }, [])
  )

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearched(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/friends/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`search failed (${response.status})`)
          const parsed = searchResponseSchema.parse(await response.json())
          setResults(parsed.users)
          setSearched(true)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setResults([])
          setSearched(true)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query])

  const handleRequest = async (receiverId: string): Promise<void> => {
    setBusyId(receiverId)
    const ok = await onRequest(receiverId)
    setBusyId(null)
    if (ok) {
      setResults((current) =>
        current.map((entry) =>
          entry.id === receiverId ? { ...entry, hasPending: true } : entry
        )
      )
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="field-input flex items-center gap-2">
        <span aria-hidden style={{ color: 'var(--ink-faint)' }}>
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher un pseudo…"
          aria-label="Chercher un pseudo"
          className="w-full border-none bg-transparent outline-none"
          style={{ color: 'var(--ink)', font: 'inherit' }}
        />
      </div>

      {results.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 py-1">
          {/* The search endpoint returns identity + relation flags only, no avatar. */}
          <PlayerAvatar username={entry.username} size={32} avatarId={null} />
          <p className="m-0 min-w-0 flex-1 truncate text-sm font-bold">{entry.username}</p>
          {entry.isFriend ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--good)' }}>
              Déjà amis
            </span>
          ) : entry.hasPending ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--bronze-strong)' }}>
              Demande en attente
            </span>
          ) : (
            <button
              type="button"
              disabled={busyId === entry.id}
              onClick={() => void handleRequest(entry.id)}
              className="cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                color: 'var(--bronze-strong)',
                borderColor: 'var(--bronze)',
                background: 'var(--surface-2)',
              }}
            >
              Demander en ami
            </button>
          )}
        </div>
      ))}

      {searched && results.length === 0 ? (
        <p className="helper-text">Aucun pseudo ne correspond.</p>
      ) : null}
    </div>
  )
}
