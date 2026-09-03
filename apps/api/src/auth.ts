import { randomBytes, createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { PublicKey, Signature } from '@nimiq/core'
import { getPool } from './db.js'
import { nimiqAddressSchema } from './nimiqAddress.js'

// Signed-challenge wallet auth (BUILD_UPDATED.md §8/§19). Replaces the
// self-reported `ownerAddress` trust model everywhere else in this API.
//
// Signing scheme: confirmed 2026-09-01 against a real Nimiq Pay
// `provider.sign()` call on-device (see README's Phase 2 section) that the
// Mini App SDK uses the same convention as Nimiq Hub's signMessage —
// SHA256('\x16Nimiq Signed Message:\n' + msg.length + msg), then
// Ed25519-signed — not raw message bytes. That was the one open question
// this module previously carried a dual-path fallback for; the fallback has
// been removed now that it's settled.

const NIMIQ_SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'
const NONCE_TTL_MS = 5 * 60 * 1000
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

declare module 'fastify' {
  interface FastifyRequest {
    walletAddress?: string
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function challengeMessage(walletAddress: string, nonce: string, issuedAtIso: string): string {
  return (
    `Stash Authentication\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAtIso}\n` +
    `Purpose: Authenticate to Stash`
  )
}

/** Verifies an Ed25519 signature produced by Nimiq Pay's provider.sign(message) over `message`. */
function verifyMessageSignature(publicKey: PublicKey, signature: Signature, message: string): boolean {
  const messageBytes = Buffer.from(message, 'utf8')
  const prefixed = Buffer.from(`${NIMIQ_SIGNED_MESSAGE_PREFIX}${messageBytes.length}${message}`, 'utf8')
  const prefixedHash = createHash('sha256').update(prefixed).digest()
  return publicKey.verify(signature, new Uint8Array(prefixedHash))
}

export async function createChallenge(walletAddress: string): Promise<{ nonce: string; message: string }> {
  const nonce = randomBytes(32).toString('hex')
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS)

  await getPool().query(
    'insert into auth_nonces (wallet_address, nonce, expires_at, issued_at) values ($1, $2, $3, $4)',
    [walletAddress, nonce, expiresAt.toISOString(), issuedAt.toISOString()],
  )

  return { nonce, message: challengeMessage(walletAddress, nonce, issuedAt.toISOString()) }
}

type VerifyResult = { ok: true; token: string; expiresAt: string } | { ok: false; status: 400 | 401; error: string }

export async function verifySignedChallenge(params: {
  walletAddress: string
  nonce: string
  publicKey: string
  signature: string
}): Promise<VerifyResult> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows } = await client.query(
      `select wallet_address, nonce, expires_at, used_at, issued_at
       from auth_nonces where nonce = $1 for update`,
      [params.nonce],
    )
    const row = rows[0]
    if (!row || row.wallet_address !== params.walletAddress) {
      await client.query('rollback')
      return { ok: false, status: 401, error: 'Unknown challenge nonce for this wallet' }
    }
    if (row.used_at) {
      await client.query('rollback')
      return { ok: false, status: 401, error: 'Challenge nonce has already been used' }
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('rollback')
      return { ok: false, status: 401, error: 'Challenge nonce has expired' }
    }

    // Mark used before doing anything else, atomically with this
    // transaction — a concurrent second verify attempt for the same nonce
    // blocks on the row lock above, then finds used_at already set.
    await client.query('update auth_nonces set used_at = now() where nonce = $1', [params.nonce])

    let publicKey: PublicKey
    let signature: Signature
    try {
      publicKey = PublicKey.fromHex(params.publicKey)
      signature = Signature.fromHex(params.signature)
    } catch {
      await client.query('rollback')
      return { ok: false, status: 400, error: 'Malformed publicKey or signature' }
    }

    const derivedAddress = publicKey.toAddress().toUserFriendlyAddress()
    if (derivedAddress !== params.walletAddress) {
      await client.query('rollback')
      return { ok: false, status: 401, error: 'Signature public key does not derive the challenged wallet address' }
    }

    const message = challengeMessage(row.wallet_address, row.nonce, new Date(row.issued_at).toISOString())
    if (!verifyMessageSignature(publicKey, signature, message)) {
      await client.query('rollback')
      return { ok: false, status: 401, error: 'Signature verification failed' }
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await client.query('insert into sessions (wallet_address, token_hash, expires_at) values ($1, $2, $3)', [
      params.walletAddress,
      hashToken(token),
      expiresAt.toISOString(),
    ])

    await client.query('commit')
    return { ok: true, token, expiresAt: expiresAt.toISOString() }
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

export async function resolveSession(token: string): Promise<string | undefined> {
  const { rows } = await getPool().query(
    'select wallet_address from sessions where token_hash = $1 and expires_at > now()',
    [hashToken(token)],
  )
  return rows[0]?.wallet_address
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  if (!token) {
    reply.code(401)
    reply.send({ error: 'Missing bearer token' })
    return
  }
  const walletAddress = await resolveSession(token)
  if (!walletAddress) {
    reply.code(401)
    reply.send({ error: 'Invalid or expired session' })
    return
  }
  request.walletAddress = walletAddress
}

const challengeSchema = z.object({ walletAddress: nimiqAddressSchema })
const verifySchema = z.object({
  walletAddress: nimiqAddressSchema,
  nonce: z.string().min(1),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  // Tighter than the global default — a nonce/signature flow is exactly
  // the kind of endpoint brute-forcing targets (BUILD_UPDATED.md §19
  // point 7).
  const authRateLimit = { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }

  app.post('/api/auth/challenge', authRateLimit, async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    return createChallenge(parsed.data.walletAddress)
  })

  app.post('/api/auth/verify', authRateLimit, async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    const result = await verifySignedChallenge(parsed.data)
    if (!result.ok) {
      reply.code(result.status)
      return { error: result.error }
    }
    reply.code(201)
    return { token: result.token, expiresAt: result.expiresAt }
  })
}
