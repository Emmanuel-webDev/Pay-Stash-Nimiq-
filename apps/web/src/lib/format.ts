/** Whitespace/case-insensitive comparison for Nimiq addresses — the same address can be typed or pasted with different spacing. */
export function isSameAddress(a: string, b: string): boolean {
  return a.replace(/\s+/g, '').toUpperCase() === b.replace(/\s+/g, '').toUpperCase()
}

/** Shortened address for compact UI contexts (design.md §7: "nimiq...k7" style). */
export function shortenAddress(address: string): string {
  const compact = address.replace(/\s+/g, '')
  if (compact.length <= 12) return compact
  return `${compact.slice(0, 6)}...${compact.slice(-4)}`
}

export function formatDateMarker(date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Compact date for a goal's "Started 12 August" line — no weekday, no year. */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
