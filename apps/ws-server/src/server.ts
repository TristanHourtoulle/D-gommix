import { createServer, type Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'

export interface WsServerOptions {
  webOrigin: string
}

export interface WsServer {
  httpServer: HttpServer
  io: SocketIOServer
  close: () => Promise<void>
}

export function createWsServer({ webOrigin }: WsServerOptions): WsServer {
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    res.writeHead(404)
    res.end()
  })

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: webOrigin,
    },
  })

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      io.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

  return { httpServer, io, close }
}
