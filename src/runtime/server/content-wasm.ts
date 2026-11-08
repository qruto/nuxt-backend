import { allowOrigin, appPolicy, type SecurityNitroApp } from './csp'

/** Where a script's permissions come from: `script-src`, which falls back to `default-src`. */
const SCRIPT = ['script-src', 'default-src'] as const

/** The source that lets a page compile WebAssembly, and nothing else that `'unsafe-eval'` would. */
export const WASM_SOURCE = '\'wasm-unsafe-eval\''

/**
 * With `@nuxt/content` installed, the security headers' policy lets a page
 * compile WebAssembly: Content queries its collections in the browser
 * through SQLite built to WebAssembly, and a `script-src` without
 * `'wasm-unsafe-eval'` refuses it, so a client-side navigation to a Content
 * page finds nothing. `'wasm-unsafe-eval'` allows WebAssembly alone, never
 * `eval()` of JavaScript. The module registers it only when the app installs
 * Content. `nuxt/server`-free, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function contentWasmPlugin(nitroApp: SecurityNitroApp): void {
  nitroApp.hooks.hook('nuxt-security:routeRules', (rules) => {
    const csp = appPolicy(rules)
    if (csp) allowOrigin(csp, SCRIPT, WASM_SOURCE)
  })
}
