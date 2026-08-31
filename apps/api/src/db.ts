import pg from 'pg'

// pg parses BIGINT (OID 20) as a JS string by default, not a lossy number —
// that's what we want, but callers must convert explicitly (BigInt(row.x))
// rather than assume a numeric type. Left as the driver default on purpose.

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not configured. Set it to a real Postgres/Supabase connection string — see README "Phase 2 setup".',
      )
    }
    // Supabase requires TLS; local Docker Postgres typically doesn't have a
    // cert configured. Default to TLS (Supabase's case) and let local dev
    // opt out explicitly rather than the other way around.
    const ssl = process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
    // All Stash tables live in the `stash` schema, not `public` — this may
    // be a shared Postgres instance with an unrelated app's tables already
    // in `public` (see migrations/0001_init.sql). Setting search_path here
    // means unqualified table names elsewhere in this codebase resolve to
    // `stash` without every query needing an explicit prefix.
    pool = new pg.Pool({ connectionString, ssl, options: '-c search_path=stash,public' })
  }
  return pool
}
