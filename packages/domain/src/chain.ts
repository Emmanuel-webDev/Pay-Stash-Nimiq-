// Shared between apps/api's transaction verifier and any apps/web UI copy
// that references the same number, so both always agree — see
// apps/api/src/nimiqRpc.ts.

/**
 * Minimum confirmations (blocks produced after the one containing the
 * transaction) required before treating a transaction as settled. A real
 * TestAlbatross transaction observed during this project's development was
 * already 44 confirmations deep within seconds of being sent — Albatross's
 * BFT-style consensus finalizes fast, so 1 confirmation is a real (non-zero)
 * safety margin without meaningfully slowing down the UX.
 */
export const MIN_TX_CONFIRMATIONS = 1
