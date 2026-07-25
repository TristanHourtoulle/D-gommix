import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWsServer, type WsServer } from '../server.js'

describe('ws-server smoke', () => {
  let server: WsServer
  let port: number

  beforeAll(async () => {
    server = createWsServer({ webOrigin: 'http://localhost:3000' })
    await new Promise<void>((resolve) => {
      server.httpServer.listen(0, resolve)
    })
    port = (server.httpServer.address() as AddressInfo).port
  })

  afterAll(async () => {
    await server.close()
  })

  it('responds ok on /health', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })
})
