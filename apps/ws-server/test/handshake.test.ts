import { migrateTestDb } from '@degommix/db/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectExpectError, startTestServer, type TestServer } from './harness'

describe('handshake', () => {
  let ts: TestServer

  beforeAll(async () => {
    await migrateTestDb()
    ts = await startTestServer()
  })

  afterAll(async () => {
    await ts.stop()
  })

  beforeEach(async () => {
    await ts.reset(['u1'])
  })

  it('accepts a connection with a valid JWT', async () => {
    const socket = await ts.connectAs('u1')
    expect(socket.connected).toBe(true)
  })

  it('rejects an invalid token with AUTH_FAILED', async () => {
    const message = await connectExpectError(ts.url, 'not-a-jwt')
    expect(message).toBe('AUTH_FAILED')
  })

  it('rejects a missing token with AUTH_FAILED', async () => {
    const message = await connectExpectError(ts.url, null)
    expect(message).toBe('AUTH_FAILED')
  })

  it('responds ok on /health', async () => {
    const response = await fetch(`${ts.url}/health`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })
})
