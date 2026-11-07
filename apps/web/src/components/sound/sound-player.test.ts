import { ARENA_SOUND_IDS } from './arena-sounds'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PlayerModule = typeof import('./sound-player')

class FakeAudioContext extends EventTarget {
  static instances: FakeAudioContext[] = []
  static initialResume: 'honour' | 'refuse' | 'hang' | 'deferred' = 'honour'
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended'
  readonly sampleRate = 44_100
  readonly destination = {}
  readonly currentTime = 0
  /** What the next `resume()` does: honour it, refuse it, or never settle. */
  resumeBehaviour = FakeAudioContext.initialResume
  resumeCalls = 0
  silentFramesStarted = 0

  constructor() {
    super()
    FakeAudioContext.instances = [...FakeAudioContext.instances, this]
  }

  resume(): Promise<void> {
    this.resumeCalls += 1
    if (this.resumeBehaviour === 'hang') return new Promise<void>(() => undefined)
    if (this.resumeBehaviour === 'refuse') return Promise.reject(new Error('NotAllowed'))
    if (this.resumeBehaviour === 'deferred') {
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          this.setState('running')
          resolve()
        }, 0)
      )
    }
    this.setState('running')
    return Promise.resolve()
  }

  suspend(): Promise<void> {
    this.setState('suspended')
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.setState('closed')
    return Promise.resolve()
  }

  setState(next: FakeAudioContext['state']): void {
    if (this.state === next) return
    this.state = next
    this.dispatchEvent(new Event('statechange'))
  }

  createBuffer(): object {
    return {}
  }

  createBufferSource(): { buffer: unknown; connect: () => void; start: () => void } {
    return {
      buffer: null,
      connect: () => undefined,
      start: () => {
        this.silentFramesStarted += 1
      },
    }
  }

  decodeAudioData(): Promise<object> {
    return Promise.resolve({})
  }
}

class FakeDocument extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible'
  listenerCount = 0

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.listenerCount += 1
    super.addEventListener(type, listener, options)
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.listenerCount -= 1
    super.removeEventListener(type, listener, options)
  }
}

let doc: FakeDocument
let player: PlayerModule
let audioSession: { type: string }

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const gesture = (type: string): void => {
  doc.dispatchEvent(new Event(type))
}
const onlyContext = (): FakeAudioContext => {
  expect(FakeAudioContext.instances).toHaveLength(1)
  const ctx = FakeAudioContext.instances[0]
  if (ctx === undefined) throw new Error('no context')
  return ctx
}

beforeEach(async () => {
  FakeAudioContext.instances = []
  FakeAudioContext.initialResume = 'honour'
  doc = new FakeDocument()
  audioSession = { type: 'auto' }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { AudioContext: FakeAudioContext })
  vi.stubGlobal('navigator', { audioSession })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
  )
  vi.resetModules()
  player = await import('./sound-player')
})

afterEach(() => {
  player.releaseArenaAudio()
  vi.unstubAllGlobals()
})

describe('armAudioUnlock', () => {
  it('ignores pointerdown, which a touch never makes an activation', () => {
    player.armAudioUnlock()
    gesture('pointerdown')
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it.each(['touchend', 'pointerup', 'click', 'keydown'])(
    'unlocks synchronously on %s: session, context, resume and silent frame',
    (type) => {
      player.armAudioUnlock()
      gesture(type)
      const ctx = onlyContext()
      expect(audioSession.type).toBe('playback')
      expect(ctx.resumeCalls).toBe(1)
      expect(ctx.silentFramesStarted).toBe(1)
    }
  )

  it('removes every gesture listener once the context is running', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    expect(onlyContext().state).toBe('running')
    expect(doc.listenerCount).toBe(1) // visibilitychange only
  })

  it('keeps listening while resume is refused, then unlocks on a later gesture', async () => {
    FakeAudioContext.initialResume = 'refuse'
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    expect(ctx.state).toBe('suspended')
    expect(doc.listenerCount).toBe(5)
    ctx.resumeBehaviour = 'honour'
    gesture('click')
    await flush()
    expect(ctx.state).toBe('running')
    expect(doc.listenerCount).toBe(1)
  })

  it('keeps listening when resume never settles', async () => {
    FakeAudioContext.initialResume = 'hang'
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    gesture('touchend')
    expect(onlyContext().resumeCalls).toBe(2)
    expect(doc.listenerCount).toBe(5)
  })

  it('re-arms when the running context is interrupted, and stops once running again', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    ctx.setState('interrupted')
    expect(doc.listenerCount).toBe(5)
    gesture('pointerup')
    await flush()
    expect(ctx.state).toBe('running')
    expect(doc.listenerCount).toBe(1)
  })

  it('retries resume when the page becomes visible again', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    ctx.setState('suspended')
    doc.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(ctx.resumeCalls).toBe(2)
    expect(ctx.state).toBe('running')
  })

  it('is idempotent and its cleanup removes every listener', () => {
    const cleanup = player.armAudioUnlock()
    player.armAudioUnlock()
    expect(doc.listenerCount).toBe(4)
    cleanup()
    expect(doc.listenerCount).toBe(0)
  })

  it('does not re-arm after cleanup when the context drops out of running', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    onlyContext().setState('suspended')
    expect(doc.listenerCount).toBe(1)
  })
})

describe('outside the arena', () => {
  it('cleanup suspends a running context and nothing re-arms it', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    cleanup()
    expect(ctx.state).toBe('suspended')
    expect(doc.listenerCount).toBe(1)
  })

  it('visibility does not resume the context once the arena is gone', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    const ctx = onlyContext()
    const calls = ctx.resumeCalls
    doc.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(ctx.resumeCalls).toBe(calls)
    expect(ctx.state).toBe('suspended')
    expect(doc.listenerCount).toBe(1)
  })

  it('re-entering the arena resumes the suspended context without waiting for a tap', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    const ctx = onlyContext()
    expect(ctx.state).toBe('suspended')
    player.armAudioUnlock()
    await flush()
    expect(ctx.state).toBe('running')
    expect(doc.listenerCount).toBe(1)
  })

  it('a StrictMode remount (cleanup then arm in a row) ends running', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    player.armAudioUnlock()
    await flush()
    expect(onlyContext().state).toBe('running')
  })

  it('keeps the gesture fallback when the re-entry resume is refused', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    const ctx = onlyContext()
    ctx.resumeBehaviour = 'refuse'
    player.armAudioUnlock()
    await flush()
    expect(ctx.state).toBe('suspended')
    expect(doc.listenerCount).toBe(5)
    ctx.resumeBehaviour = 'honour'
    gesture('pointerup')
    await flush()
    expect(ctx.state).toBe('running')
    expect(doc.listenerCount).toBe(1)
  })

  it('the next arena resumes the suspended context on its first gesture', async () => {
    const cleanup = player.armAudioUnlock()
    gesture('touchend')
    await flush()
    cleanup()
    player.armAudioUnlock()
    gesture('pointerup')
    await flush()
    expect(onlyContext().state).toBe('running')
    expect(doc.listenerCount).toBe(1)
  })
})

describe('primeArenaSounds', () => {
  it('fetches each sample once when one tap fires three events', async () => {
    FakeAudioContext.initialResume = 'deferred'
    player.armAudioUnlock()
    gesture('pointerup')
    gesture('touchend')
    gesture('click')
    expect(onlyContext().resumeCalls).toBe(3)
    await flush()
    await flush()
    expect(onlyContext().state).toBe('running')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(ARENA_SOUND_IDS.length)
  })

  it('retries a failed sample fetch the next time the context runs', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    expect(fetchMock).toHaveBeenCalledTimes(ARENA_SOUND_IDS.length)
    ctx.setState('interrupted')
    gesture('touchend')
    await flush()
    expect(ctx.state).toBe('running')
    expect(fetchMock).toHaveBeenCalledTimes(ARENA_SOUND_IDS.length + 1)
  })

  it('shares one in-flight run between concurrent callers', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await Promise.all([player.primeArenaSounds(), player.primeArenaSounds()])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(ARENA_SOUND_IDS.length)
  })
})

describe('releaseArenaAudio', () => {
  it('then arming again creates a fresh context', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    player.releaseArenaAudio()
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    expect(FakeAudioContext.instances).toHaveLength(2)
    expect(FakeAudioContext.instances[0]?.state).toBe('closed')
    expect(FakeAudioContext.instances[1]?.state).toBe('running')
  })

  it('closes the context and removes every listener', async () => {
    player.armAudioUnlock()
    gesture('touchend')
    await flush()
    const ctx = onlyContext()
    ctx.setState('suspended')
    player.releaseArenaAudio()
    expect(ctx.state).toBe('closed')
    expect(doc.listenerCount).toBe(0)
  })
})
