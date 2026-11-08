import { afterEach, describe, expect, it, vi } from 'vitest'

// The security headers with the error-reporting SDK wired: the DSN's origin
// joins the policy the base module narrowed, so the browser's reports leave.

const runtimeConfig = { public: { backend: { monitoring: { dsn: '' } } } }
vi.mock('nuxt/server', () => ({ useRuntimeConfig: () => runtimeConfig }))

const DSN = 'https://public-key@o123.ingest.de.sentry.io/456'
const ORIGIN = 'https://o123.ingest.de.sentry.io'

/** The `/**` rule nuxt-security hands the hook, after the plugin ran. */
async function afterHook(csp: unknown, dsn = DSN) {
  runtimeConfig.public.backend.monitoring.dsn = dsn
  const { default: plugin } = await import('../../src/runtime/server/monitoring/csp')
  let run: ((rules: Record<string, unknown>) => void) | undefined
  plugin({ hooks: { hook: (_name, fn) => (run = fn) } })
  const rules = { '/**': { headers: { contentSecurityPolicy: csp } } }
  run!(rules)
  return rules['/**'].headers.contentSecurityPolicy
}

describe('the security headers, with the SDK wired', () => {
  afterEach(() => {
    runtimeConfig.public.backend.monitoring.dsn = ''
  })

  it('appends the DSN\'s origin to a connect-src, the public key left out', async () => {
    const narrowed = ['\'self\'', 'https://happy-otter-123.convex.cloud', 'wss://happy-otter-123.convex.cloud']
    expect(await afterHook({ 'connect-src': narrowed })).toEqual({ 'connect-src': [...narrowed, ORIGIN] })
  })

  it('keeps a port, for a server of the app\'s own', async () => {
    expect(await afterHook({ 'connect-src': ['\'self\''] }, 'https://key@sentry.acme.test:9000/1')).toEqual({ 'connect-src': ['\'self\'', 'https://sentry.acme.test:9000'] })
  })

  it('reads a directive written as a string, and names an origin once', async () => {
    expect(await afterHook({ 'connect-src': '\'self\' https://api.acme.test' })).toEqual({ 'connect-src': ['\'self\'', 'https://api.acme.test', ORIGIN] })
    expect(await afterHook({ 'connect-src': ['\'self\'', ORIGIN] })).toEqual({ 'connect-src': ['\'self\'', ORIGIN] })
  })

  it('gives a policy that restricts only default-src a connect-src of its own, and leaves the fallback as it was', async () => {
    expect(await afterHook({ 'default-src': ['\'self\''] })).toEqual({ 'default-src': ['\'self\''], 'connect-src': ['\'self\'', ORIGIN] })
    expect(await afterHook({ 'default-src': ['\'none\''] })).toEqual({ 'default-src': ['\'none\''], 'connect-src': [ORIGIN] })
  })

  it('leaves an unrestricted connect-src unrestricted', async () => {
    expect(await afterHook({ 'img-src': ['\'self\''] })).toEqual({ 'img-src': ['\'self\''] })
  })

  it('changes nothing without a DSN, for a value that is no URL, or with the policy off', async () => {
    const policy = { 'connect-src': ['\'self\''] }
    expect(await afterHook(policy, '')).toEqual(policy)
    expect(await afterHook(policy, 'not a url')).toEqual(policy)
    expect(await afterHook(false)).toBe(false)
  })
})
