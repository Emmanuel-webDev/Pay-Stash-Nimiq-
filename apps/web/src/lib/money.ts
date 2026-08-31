// 1 NIM = 100,000 Luna. Never use floating-point NIM amounts internally —
// only convert to/from NIM at the UI boundary, and always via this module.
const LUNA_PER_NIM = 100_000

export function nimToLuna(nim: string | number): number {
  const value = typeof nim === 'string' ? Number(nim) : nim
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number')
  }
  return Math.round(value * LUNA_PER_NIM)
}

export function lunaToNim(luna: number): string {
  return (luna / LUNA_PER_NIM).toFixed(5).replace(/\.?0+$/, '') || '0'
}
