import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '@degommix/game-core'
import { ACK_TIMEOUT_MESSAGE } from './socket'
import { ackErrorMessage, DELIVERY_FAILED_MESSAGE, wsErrorMessage } from './ws-errors'

describe('wsErrorMessage', () => {
  it.each(ERROR_CODES)('maps %s to a non-empty French message', (code) => {
    const message = wsErrorMessage(code)
    expect(message.length).toBeGreaterThan(0)
    expect(message).not.toBe(code)
  })

  it('covers every error code with a distinct message except the fallback', () => {
    const messages = ERROR_CODES.map((code) => wsErrorMessage(code))
    expect(new Set(messages).size).toBe(ERROR_CODES.length)
  })

  it('falls back to the INTERNAL message for an unknown code', () => {
    const unknown = 'SOMETHING_ELSE' as (typeof ERROR_CODES)[number]
    expect(wsErrorMessage(unknown)).toBe(wsErrorMessage('INTERNAL'))
  })
})

describe('ackErrorMessage', () => {
  it('maps a local delivery timeout to the dedicated toast message', () => {
    const ack = { ok: false as const, code: 'INTERNAL' as const, message: ACK_TIMEOUT_MESSAGE }
    expect(ackErrorMessage(ack)).toBe(DELIVERY_FAILED_MESSAGE)
  })

  it('maps a server error through the code dictionary', () => {
    const ack = { ok: false as const, code: 'CHARACTER_TAKEN' as const, message: 'taken' }
    expect(ackErrorMessage(ack)).toBe('Trop tard, ce personnage est déjà pris')
  })
})
