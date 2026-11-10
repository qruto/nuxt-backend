import { allowOrigin, appPolicy, type SecurityNitroApp } from './csp'

/** Where a worker's script may come from: `worker-src`, then what CSP falls back to, nearest first. */
const WORKER = ['worker-src', 'child-src', 'script-src', 'default-src'] as const

/** The source that lets a page start a worker from a `blob:` URL. */
export const BLOB_WORKER_SOURCE = 'blob:'

/**
 * With `heic-to` installed, the security headers' policy lets its decoder
 * start: `heic-to/csp` decodes a HEIC in a worker it starts from a `blob:`
 * URL, which the package's `worker-src 'self'` refuses, so `preparePhoto`
 * would refuse every HEIC a browser can't open itself as `unreadable`.
 * `blob:` joins `worker-src` (or the directive it falls back to, `child-src`
 * when that is set). That build runs libheif as plain JavaScript, so
 * `script-src` needs neither `'unsafe-eval'` nor `'wasm-unsafe-eval'`. The
 * module registers it only when the app installs `heic-to`.
 * `nuxt/server`-free, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function photoDecoderSecurityPlugin(nitroApp: SecurityNitroApp): void {
  nitroApp.hooks.hook('nuxt-security:routeRules', (rules) => {
    const csp = appPolicy(rules)
    if (csp) allowOrigin(csp, WORKER, BLOB_WORKER_SOURCE)
  })
}
