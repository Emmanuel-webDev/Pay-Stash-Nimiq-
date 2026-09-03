import { Address } from '@nimiq/core'
import { z } from 'zod'

/** True only for a well-formed Nimiq user-friendly (NQ...) address string. */
export function isValidNimiqAddress(value: string): boolean {
  try {
    Address.fromUserFriendlyAddress(value)
    return true
  } catch {
    return false
  }
}

/** zod string schema that also requires a well-formed Nimiq address — BUILD_UPDATED.md §19 point 6 ("validate all addresses"). */
export const nimiqAddressSchema = z.string().min(1).refine(isValidNimiqAddress, { message: 'Not a valid Nimiq address' })
