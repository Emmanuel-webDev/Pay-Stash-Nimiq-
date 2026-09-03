export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505'
}

export function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23503'
}

/** Whitespace/case-insensitive comparison for Nimiq addresses (mirrors apps/web/src/lib/format.ts's isSameAddress). */
export function isSameAddress(a: string, b: string): boolean {
  return a.replace(/\s+/g, '').toUpperCase() === b.replace(/\s+/g, '').toUpperCase()
}
