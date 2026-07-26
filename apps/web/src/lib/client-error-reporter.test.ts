import { describe, expect, it, vi } from 'vitest'
import { CLIENT_ERROR_LIMITS } from './client-error'
import { createClientErrorReporter, MAX_REPORTS_PER_SESSION } from './client-error-reporter'

describe('createClientErrorReporter', () => {
  it('sends at most MAX_REPORTS_PER_SESSION reports per page lifetime', () => {
    const post = vi.fn().mockResolvedValue(undefined)
    const report = createClientErrorReporter(post)

    for (let i = 0; i < MAX_REPORTS_PER_SESSION + 1; i += 1) {
      report({ message: `boom ${i}` }, '/x')
    }

    expect(post).toHaveBeenCalledTimes(MAX_REPORTS_PER_SESSION)
  })

  it('swallows a rejected post and keeps counting the next call', async () => {
    const post = vi.fn().mockRejectedValue(new Error('network down'))
    const report = createClientErrorReporter(post)

    expect(() => report({ message: 'boom' }, '/x')).not.toThrow()
    await Promise.resolve()
    report({ message: 'boom again' }, '/x')

    expect(post).toHaveBeenCalledTimes(2)
  })

  it('truncates message, stack and route to the wire limits before posting', () => {
    const post = vi.fn().mockResolvedValue(undefined)
    const report = createClientErrorReporter(post)

    report(
      {
        message: 'm'.repeat(CLIENT_ERROR_LIMITS.message + 50),
        stack: 's'.repeat(CLIENT_ERROR_LIMITS.stack + 50),
      },
      '/r'.repeat(CLIENT_ERROR_LIMITS.route)
    )

    const body = JSON.parse(post.mock.calls[0]?.[0] as string) as {
      message: string
      stack: string
      route: string
    }
    expect(body.message).toHaveLength(CLIENT_ERROR_LIMITS.message)
    expect(body.stack).toHaveLength(CLIENT_ERROR_LIMITS.stack)
    expect(body.route).toHaveLength(CLIENT_ERROR_LIMITS.route)
  })

  it('falls back to a generic message when error.message is empty', () => {
    const post = vi.fn().mockResolvedValue(undefined)
    const report = createClientErrorReporter(post)

    report({ message: '' }, '/x')

    const body = JSON.parse(post.mock.calls[0]?.[0] as string) as { message: string }
    expect(body.message).toBe('Unknown client error')
  })
})
