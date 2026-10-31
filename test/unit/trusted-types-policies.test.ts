import { afterEach, describe, expect, it, vi } from 'vitest'

// The two Trusted Types policies the package creates in the browser: its own
// (`nuxt-backend`), which the bot check's script URL goes through, and the
// `default` one for code that knows nothing of Trusted Types. What each rule
// lets through is trusted-types.test.ts's; here, when each policy is made,
// and what happens where the browser has no Trusted Types or the page's CSP
// does not list the policy. The browser's factory is a stand-in.

type Rules = Record<string, (input: string) => unknown>

/** A browser's `trustedTypes`, stood in: it records each policy and wraps what a policy passes. */
function trustedTypes(options: { refuse?: string[], defaultPolicy?: unknown } = {}) {
  const policies = new Map<string, Rules>()
  const factory = {
    defaultPolicy: options.defaultPolicy,
    createPolicy: vi.fn((name: string, rules: Rules) => {
      if (options.refuse?.includes(name)) throw new TypeError(`Policy "${name}" disallowed.`)
      policies.set(name, rules)
      return { createScriptURL: (input: string) => ({ trusted: rules.createScriptURL!(input) }) }
    }),
  }
  return { factory, policies }
}

/** A fresh copy of the module, in a browser whose `window` is `browser`: the package's policy is made once per page. */
async function inBrowser(browser: Record<string, unknown> | undefined) {
  vi.resetModules()
  if (browser) vi.stubGlobal('window', browser)
  return import('../../src/runtime/vue/trusted-types')
}

afterEach(() => vi.unstubAllGlobals())

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

describe('the package\'s own policy', () => {
  it('passes the script URL it is given through the policy, made once for the page', async () => {
    const { factory } = trustedTypes()
    const { trustedScriptUrl } = await inBrowser({ trustedTypes: factory, location: { href: 'https://app.example.com/' } })
    expect(trustedScriptUrl(SCRIPT_URL)).toEqual({ trusted: SCRIPT_URL })
    expect(trustedScriptUrl(`${SCRIPT_URL}&again`)).toEqual({ trusted: `${SCRIPT_URL}&again` })
    expect(factory.createPolicy).toHaveBeenCalledOnce()
    expect(factory.createPolicy.mock.calls[0]![0]).toBe('nuxt-backend')
  })

  it('hands back the plain string where the browser has no Trusted Types, or none at all', async () => {
    expect((await inBrowser({ location: { href: 'https://app.example.com/' } })).trustedScriptUrl(SCRIPT_URL)).toBe(SCRIPT_URL)
    vi.unstubAllGlobals()
    expect((await inBrowser(undefined)).trustedScriptUrl(SCRIPT_URL)).toBe(SCRIPT_URL)
  })

  it('hands back the plain string, and asks no more, where the page\'s CSP does not list the policy', async () => {
    const { factory } = trustedTypes({ refuse: ['nuxt-backend'] })
    const { trustedScriptUrl } = await inBrowser({ trustedTypes: factory })
    // The sink refuses the string, as the page's CSP means it to.
    expect(trustedScriptUrl(SCRIPT_URL)).toBe(SCRIPT_URL)
    expect(trustedScriptUrl(SCRIPT_URL)).toBe(SCRIPT_URL)
    expect(factory.createPolicy).toHaveBeenCalledOnce()
  })
})

describe('the default policy', () => {
  it('lets inert HTML, JSON script text and same-origin script URLs through, by the page\'s own address', async () => {
    const { factory, policies } = trustedTypes()
    const { installDefaultPolicy } = await inBrowser({ trustedTypes: factory, location: { href: 'https://app.example.com/pricing' } })
    installDefaultPolicy()
    const rules = policies.get('default')!
    expect(rules.createHTML!('plain text')).toBe('plain text')
    expect(rules.createHTML!('<img src=x onerror=alert(1)>')).toBeNull()
    expect(rules.createScript!('{"@type":"Product"}')).toBe('{"@type":"Product"}')
    expect(rules.createScript!('alert(1)')).toBeNull()
    expect(rules.createScriptURL!('/_nuxt/entry.js')).toBe('/_nuxt/entry.js')
    expect(rules.createScriptURL!('https://evil.example/a.js')).toBeNull()
    // One it cannot read as an address at all is refused too.
    expect(rules.createScriptURL!('http://[::1')).toBeNull()
  })

  it('makes nothing where the browser has no Trusted Types, or the page made its own default already', async () => {
    const own = trustedTypes({ defaultPolicy: {} })
    ;(await inBrowser({ trustedTypes: own.factory })).installDefaultPolicy()
    expect(own.factory.createPolicy).not.toHaveBeenCalled()

    const { installDefaultPolicy } = await inBrowser({ location: { href: 'https://app.example.com/' } })
    expect(() => installDefaultPolicy()).not.toThrow()
  })

  it('goes quietly where the page\'s CSP does not list it: every untyped sink then refuses', async () => {
    const { factory } = trustedTypes({ refuse: ['default'] })
    const { installDefaultPolicy } = await inBrowser({ trustedTypes: factory })
    expect(() => installDefaultPolicy()).not.toThrow()
    expect(factory.createPolicy).toHaveBeenCalledWith('default', expect.any(Object))
  })
})
