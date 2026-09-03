import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { activityRoutes } from './activity.js'
import { authRoutes } from './auth.js'
import { getPool } from './db.js'
import { goalsRoutes } from './goals.js'
import { obligationsRoutes } from './obligations.js'
import { paymentIntentsRoutes } from './paymentIntents.js'
import { reconcilePendingIntents } from './paymentIntentReconciler.js'
import { sweepsRoutes } from './sweeps.js'

const PORT = Number(process.env.PORT ?? 8787)
// Comma-separated so a LAN URL (for on-device Nimiq Pay testing) can be
// allowed alongside localhost without dropping local dev access.
const WEB_ORIGINS = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim())

const app = Fastify({ logger: true })

// This API is only ever called from apps/web's own fetch() calls, never
// rendered in a browser itself — helmet's defaults (CSP, frame options,
// etc.) are all safe to take as-is; nothing here serves HTML.
await app.register(helmet)

// Global default is generous (normal polling — Home/Activity read a few
// endpoints on every load); auth and payment-intents routes set their own
// tighter per-route limits below, per BUILD_UPDATED.md §19 point 7
// ("Rate-limit auth, sync, and sweep endpoints").
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })

await app.register(cors, { origin: WEB_ORIGINS })
await app.register(activityRoutes)
await app.register(authRoutes)
await app.register(goalsRoutes)
await app.register(obligationsRoutes)
await app.register(paymentIntentsRoutes)
await app.register(sweepsRoutes)

// Real readiness probe, not just "the process is up" — checks the one
// dependency every route actually needs.
app.get('/health', async (_request, reply) => {
  try {
    await getPool().query('select 1')
    return { ok: true, db: 'ok' }
  } catch (err) {
    reply.code(503)
    return { ok: false, db: 'unreachable', error: err instanceof Error ? err.message : String(err) }
  }
})

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })

// Safety net for payment intents the frontend poller never got to confirm
// (app closed/backgrounded/crashed after a real send) — see
// paymentIntentReconciler.ts. Ticks every 30s; per-intent age-based backoff
// inside the reconciler governs actual RPC calls, not this tick rate.
const RECONCILE_INTERVAL_MS = 30_000
const reconcileTimer = setInterval(() => {
  reconcilePendingIntents(getPool())
    .then((result) => {
      if (result.scanned > 0 || result.expired > 0) {
        app.log.info(result, '[reconciler] cycle complete')
      }
    })
    .catch((err) => app.log.error(err, '[reconciler] cycle failed'))
}, RECONCILE_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(reconcileTimer))
