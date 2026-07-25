import { describe, expect, it } from 'vitest'
import type { FriendsEventKind, FriendsEventPayload } from '@/lib/realtime-types'
import { applyFriendsEvent, type SearchUser } from './search-results'

const OTHER: SearchUser = { id: 'u1', username: 'obelix', isFriend: false, hasPending: false }
const SELF_SEARCH: SearchUser[] = [
  { id: 'u1', username: 'obelix', isFriend: false, hasPending: false },
  { id: 'u2', username: 'idefix', isFriend: false, hasPending: false },
]

function event(kind: FriendsEventKind, fromId = 'u1'): FriendsEventPayload {
  return { kind, requestId: 'r1', from: { id: fromId, username: 'obelix' } }
}

describe('applyFriendsEvent', () => {
  it('flips the row to « Déjà amis » when the request is accepted', () => {
    const results = [{ ...OTHER, hasPending: true }]

    const next = applyFriendsEvent(results, event('request_accepted'))

    expect(next[0]).toEqual({ ...OTHER, isFriend: true, hasPending: false })
  })

  it('flips the row to « Demande en attente » when a request is received', () => {
    const next = applyFriendsEvent([OTHER], event('request_received'))

    expect(next[0]).toEqual({ ...OTHER, isFriend: false, hasPending: true })
  })

  it('makes the row invitable again when the request is canceled', () => {
    const results = [{ ...OTHER, hasPending: true }]

    const next = applyFriendsEvent(results, event('request_canceled'))

    expect(next[0]).toEqual({ ...OTHER, isFriend: false, hasPending: false })
  })

  it('touches only the row of the user the event comes from', () => {
    const next = applyFriendsEvent(SELF_SEARCH, event('request_accepted', 'u2'))

    expect(next[0]).toBe(SELF_SEARCH[0])
    expect(next[1]).toEqual({ ...SELF_SEARCH[1], isFriend: true, hasPending: false })
  })

  it('keeps the same array when no row matches', () => {
    const next = applyFriendsEvent(SELF_SEARCH, event('request_accepted', 'ghost'))

    expect(next).toBe(SELF_SEARCH)
  })

  it('keeps the same array when the row is already up to date', () => {
    const results = [{ ...OTHER, isFriend: true }]

    expect(applyFriendsEvent(results, event('request_accepted'))).toBe(results)
  })

  it('ignores an unknown event kind coming from a newer server', () => {
    const results = [OTHER]

    const next = applyFriendsEvent(results, {
      ...event('request_accepted'),
      kind: 'request_declined' as FriendsEventKind,
    })

    expect(next).toBe(results)
  })

  it('never mutates the input rows', () => {
    const results: SearchUser[] = [{ ...OTHER }]

    applyFriendsEvent(results, event('request_accepted'))

    expect(results[0]).toEqual(OTHER)
  })

  it('handles an empty result list', () => {
    const results: SearchUser[] = []

    expect(applyFriendsEvent(results, event('request_accepted'))).toBe(results)
  })
})
