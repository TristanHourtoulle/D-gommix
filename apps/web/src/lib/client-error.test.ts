import { describe, expect, it } from 'vitest'
import { CLIENT_ERROR_LIMITS, clientErrorSchema, formatClientErrorLine } from './client-error'

describe('clientErrorSchema', () => {
  it('accepts a minimal valid report', () => {
    const parsed = clientErrorSchema.safeParse({ message: 'boom', route: '/partie/42' })
    expect(parsed.success).toBe(true)
  })

  it('accepts a full report', () => {
    const parsed = clientErrorSchema.safeParse({
      message: 'boom',
      stack: 'Error: boom\n  at render',
      digest: 'abc123',
      route: '/partie/42',
      userAgent: 'Mozilla/5.0',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an empty message', () => {
    expect(clientErrorSchema.safeParse({ message: '', route: '/x' }).success).toBe(false)
  })

  it('rejects a missing route', () => {
    expect(clientErrorSchema.safeParse({ message: 'boom' }).success).toBe(false)
  })

  it('rejects a message longer than the limit', () => {
    const message = 'a'.repeat(CLIENT_ERROR_LIMITS.message + 1)
    expect(clientErrorSchema.safeParse({ message, route: '/x' }).success).toBe(false)
  })

  it('rejects a stack longer than the limit', () => {
    const stack = 'a'.repeat(CLIENT_ERROR_LIMITS.stack + 1)
    expect(clientErrorSchema.safeParse({ message: 'boom', route: '/x', stack }).success).toBe(false)
  })

  it('rejects a non-object body', () => {
    expect(clientErrorSchema.safeParse(null).success).toBe(false)
  })
})

describe('formatClientErrorLine', () => {
  it('emits one JSON line with exactly the expected keys', () => {
    const line = formatClientErrorLine('user-1', {
      message: 'boom',
      stack: 'at render',
      digest: 'abc123',
      route: '/partie/42',
      userAgent: 'Mozilla/5.0',
    })
    const parsed: unknown = JSON.parse(line)
    expect(parsed).toEqual({
      level: 'error',
      scope: 'client',
      userId: 'user-1',
      route: '/partie/42',
      digest: 'abc123',
      userAgent: 'Mozilla/5.0',
      error: 'boom\nat render',
    })
  })

  it('joins message and stack with a newline when a stack is present', () => {
    const line = formatClientErrorLine('user-1', {
      message: 'boom',
      stack: 'at render',
      route: '/x',
    })
    const parsed = JSON.parse(line) as { error: string }
    expect(parsed.error).toBe('boom\nat render')
  })

  it('uses the message alone when no stack is present', () => {
    const line = formatClientErrorLine('user-1', { message: 'boom', route: '/x' })
    const parsed = JSON.parse(line) as { error: string }
    expect(parsed.error).toBe('boom')
  })
})
