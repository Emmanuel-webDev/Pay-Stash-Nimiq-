import Fastify from 'fastify'
import cors from '@fastify/cors'
import { goalsRoutes } from './goals.js'

const PORT = Number(process.env.PORT ?? 8787)
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173'

const app = Fastify({ logger: true })
await app.register(cors, { origin: WEB_ORIGIN })
await app.register(goalsRoutes)

app.get('/health', async () => ({ ok: true }))

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
