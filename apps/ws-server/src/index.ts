import { createDb } from '@degommix/db'
import { makeJwksVerifier } from './auth'
import { loadEnv } from './env'
import { createWsServer } from './server'

const env = loadEnv()

const server = createWsServer({
  db: createDb(env.databaseUrl),
  verifyToken: makeJwksVerifier(env.jwksUrl),
  webOrigin: env.webOrigin,
  startJobs: true,
})

function log(message: string): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), message })}\n`)
}

server.httpServer.listen(env.port, () => {
  log(`ws-server listening on port ${env.port} (CORS origin: ${env.webOrigin})`)
})

process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down')
  void server
    .close()
    .then(() => {
      process.exit(0)
    })
    .catch(() => {
      process.exit(1)
    })
})
