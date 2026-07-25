import { z } from 'zod'
import { createWsServer } from './server.js'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
})

const env = envSchema.parse(process.env)

const { httpServer, close } = createWsServer({ webOrigin: env.WEB_ORIGIN })

function log(message: string): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), message })}\n`)
}

httpServer.listen(env.PORT, () => {
  log(`ws-server listening on port ${env.PORT} (CORS origin: ${env.WEB_ORIGIN})`)
})

process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down')
  void close()
    .then(() => {
      process.exit(0)
    })
    .catch(() => {
      process.exit(1)
    })
})
