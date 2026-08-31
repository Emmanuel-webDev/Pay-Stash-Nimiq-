import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPool } from './db.js'

const MIGRATIONS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../migrations')

async function main() {
  const pool = getPool()

  await pool.query('create schema if not exists stash')
  await pool.query(`
    create table if not exists stash.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const { rows } = await pool.query('select 1 from schema_migrations where name = $1', [file])
    if (rows.length > 0) {
      console.log(`skip  ${file} (already applied)`)
      continue
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`apply ${file}`)
    } catch (err) {
      await client.query('rollback')
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      client.release()
    }
  }

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
