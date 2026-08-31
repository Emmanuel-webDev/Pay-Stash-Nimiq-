import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'

// Verified against @nimiq/mini-app-sdk@0.1.0 dist/index.d.ts and dist/provider.d.ts
// (inspected directly from the published npm tarball on 2026-08-31).
// init() resolves once Nimiq Pay injects `window.nimiq`; it throws/hangs
// per its `timeout` option (default from the SDK) when not run inside Nimiq Pay.

let providerPromise: ReturnType<typeof init> | undefined

export function getNimiqProvider(): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init({ timeout: 10_000 })
  }

  return providerPromise
}

export function resetNimiqProvider(): void {
  providerPromise = undefined
}
