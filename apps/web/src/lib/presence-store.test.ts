import { describe, expect, it, vi } from 'vitest'
import type { Presence } from '@degommix/game-core'
import type { AppSocket } from './realtime-types'
import { attachPresenceStore, mergePresence, PresenceStore, presenceStore } from './presence-store'

type Handler = (payload: never) => void

/** Minimal socket double: records the listeners `attachPresenceStore` binds. */
function createFakeSocket() {
  const handlers = new Map<string, Handler>()
  let boundCount = 0
  const socket = {
    on(event: string, handler: Handler) {
      boundCount++
      handlers.set(event, handler)
    },
  }
  return {
    socket: socket as unknown as AppSocket,
    emit(event: string, payload?: unknown): void {
      handlers.get(event)?.(payload as never)
    },
    has: (event: string): boolean => handlers.has(event),
    boundCount: (): number => boundCount,
  }
}

describe('PresenceStore', () => {
  it('starts empty and reports unknown users as absent', () => {
    const store = new PresenceStore()
    expect(store.getSnapshot()).toEqual({})
  })

  it('records a presence update', () => {
    const store = new PresenceStore()
    store.set('u1', 'online')
    expect(store.getSnapshot()).toEqual({ u1: 'online' })
  })

  it('overwrites the previous value of the same user and keeps the others', () => {
    const store = new PresenceStore()
    store.set('u1', 'online')
    store.set('u2', 'online')
    store.set('u1', 'in_game')
    expect(store.getSnapshot()).toEqual({ u1: 'in_game', u2: 'online' })
  })

  it('publishes a new snapshot object on every change', () => {
    const store = new PresenceStore()
    const before = store.getSnapshot()
    store.set('u1', 'online')
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('ignores a repeated value: same snapshot, no notification', () => {
    const store = new PresenceStore()
    store.set('u1', 'online')
    const snapshot = store.getSnapshot()
    const listener = vi.fn()
    store.subscribe(listener)

    store.set('u1', 'online')
    expect(store.getSnapshot()).toBe(snapshot)
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears every entry on demand (socket disconnect)', () => {
    const store = new PresenceStore()
    store.set('u1', 'online')
    store.set('u2', 'in_game')

    store.clear()
    expect(store.getSnapshot()).toEqual({})
  })

  it('does not notify when clearing an already empty map', () => {
    const store = new PresenceStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.clear()
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies subscribers on set and clear, and stops after unsubscribe', () => {
    const store = new PresenceStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.set('u1', 'online')
    expect(listener).toHaveBeenCalledTimes(1)

    store.clear()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.set('u1', 'online')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toEqual({ u1: 'online' })
  })

  it('notifies every subscriber', () => {
    const store = new PresenceStore()
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)

    store.set('u1', 'online')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('keeps entries received before a screen subscribes (client-side navigation)', () => {
    const store = new PresenceStore()
    // Connect-time snapshot, consumed while the next screen is not mounted yet.
    store.set('u1', 'online')

    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getSnapshot()).toEqual({ u1: 'online' })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('mergePresence', () => {
  const live: Record<string, Presence> = { u1: 'in_game' }

  it('returns the live map untouched when there is no seed', () => {
    expect(mergePresence(undefined, live)).toBe(live)
  })

  it('fills the friends the socket said nothing about', () => {
    expect(mergePresence({ u2: 'online' }, live)).toEqual({ u1: 'in_game', u2: 'online' })
  })

  it('never overwrites a live value with the seed', () => {
    expect(mergePresence({ u1: 'online' }, live)).toEqual({ u1: 'in_game' })
  })

  it('lets an offline live value win over an online seed', () => {
    expect(mergePresence({ u1: 'online' }, { u1: 'offline' })).toEqual({ u1: 'offline' })
  })

  it('does not mutate the seed nor the live map', () => {
    const seed: Record<string, Presence> = { u2: 'online' }
    mergePresence(seed, live)
    expect(seed).toEqual({ u2: 'online' })
    expect(live).toEqual({ u1: 'in_game' })
  })
})

describe('attachPresenceStore', () => {
  it('feeds the shared store from presence:update and clears it on disconnect', () => {
    const fake = createFakeSocket()
    attachPresenceStore(fake.socket)

    fake.emit('presence:update', { userId: 'u1', presence: 'online' })
    expect(presenceStore.getSnapshot()).toEqual({ u1: 'online' })

    // Entries belong to the dead connection: the server re-sends a snapshot.
    fake.emit('disconnect', 'transport close')
    expect(presenceStore.getSnapshot()).toEqual({})
  })

  it('binds the listeners once per socket', () => {
    const fake = createFakeSocket()
    attachPresenceStore(fake.socket)
    attachPresenceStore(fake.socket)
    expect(fake.boundCount()).toBe(2)
    expect(fake.has('presence:update')).toBe(true)
    expect(fake.has('disconnect')).toBe(true)
  })
})
