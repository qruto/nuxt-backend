import { useRuntimeConfig } from 'nuxt/server'
import { allowOrigin, appPolicy, type SecurityNitroApp } from '../csp'

/** Where a browser's reports go: `connect-src`, which falls back to `default-src`. */
const CONNECT = ['connect-src', 'default-src'] as const

/** The origin a DSN reports to, its public key left out; `null` for a value that is no URL. */
export function dsnOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null
  try {
    return new URL(dsn).origin
  }
  catch {
    return null
  }
}

/**
 * With the SDK wired, the security headers' policy lets the browser's error
 * reports out: the DSN's origin joins `connect-src`, which the base module
 * narrows to the deployment in production, or the `default-src` it falls
 * back to. The module registers it after the base module's plugin, so its
 * hook finds the narrowed directive. `nuxt/server` is its only server
 * import, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function monitoringSecurityPlugin(nitroApp: SecurityNitroApp): void {
  nitroApp.hooks.hook('nuxt-security:routeRules', (rules) => {
    const { dsn } = (useRuntimeConfig().public.backend as { monitoring?: { dsn?: string } } | undefined)?.monitoring ?? {}
    const origin = dsnOrigin(dsn)
    const csp = appPolicy(rules)
    if (origin && csp) allowOrigin(csp, CONNECT, origin)
  })
}
