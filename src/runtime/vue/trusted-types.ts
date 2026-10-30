// Trusted Types: with the content security policy's
// `require-trusted-types-for 'script'` (a production build's default, see
// src/nuxt/security.ts), the browser refuses a plain string at every DOM
// sink that can run script: `innerHTML`, a script's text, a script's `src`.
// A value passes only through a named policy the policy lists. Vue brings
// its own (`vue`); the package's code goes through `nuxt-backend`; and the
// `default` policy below decides for code that knows nothing of Trusted
// Types, such as the head manager writing a JSON-LD script. It lets through
// only what cannot run script, and refuses the rest, so the sink throws.

/** The policy the package's own sinks go through. */
export const TRUSTED_TYPES_POLICY = 'nuxt-backend'

/** The policy names the package creates, for the content security policy's `trusted-types` list. */
export const TRUSTED_TYPES_POLICIES = ['vue', TRUSTED_TYPES_POLICY, 'default'] as const

interface PolicyFactory {
  createPolicy: (name: string, rules: {
    createHTML?: (input: string) => string | null
    createScript?: (input: string) => string | null
    createScriptURL?: (input: string) => string | null
  }) => { createScriptURL: (input: string) => unknown }
  defaultPolicy?: unknown
}

function factory(): PolicyFactory | undefined {
  return typeof window === 'undefined' ? undefined : (window as { trustedTypes?: PolicyFactory }).trustedTypes
}

/**
 * HTML with no markup: text the browser parses into text nodes alone, which
 * no `<` means. Character references (`&amp;`) stay text.
 */
export function inertHtml(input: string): string | null {
  return input.includes('<') ? null : input
}

/** Script text that is JSON (a JSON-LD block, a data island): it parses as data, never as a call. */
export function jsonScript(input: string): string | null {
  try {
    JSON.parse(input)
    return input
  }
  catch {
    return null
  }
}

/** A script URL on the page's own origin, as a bundler's chunks are; any other is refused. */
export function sameOriginScriptUrl(input: string, base: string): string | null {
  try {
    return new URL(input, base).origin === new URL(base).origin ? input : null
  }
  catch {
    return null
  }
}

let packagePolicy: { createScriptURL: (input: string) => unknown } | null | undefined

/**
 * A script URL the package loads (the bot check's provider), through its
 * own policy where the browser has Trusted Types; the plain string where it
 * has none. Only the URLs the package names reach it, so the policy passes
 * what it is given.
 */
export function trustedScriptUrl(url: string): string {
  if (packagePolicy === undefined) {
    try {
      packagePolicy = factory()?.createPolicy(TRUSTED_TYPES_POLICY, { createScriptURL: input => input }) ?? null
    }
    catch {
      // A policy this page's CSP does not list: the sink refuses the string, as it should.
      packagePolicy = null
    }
  }
  return (packagePolicy ? packagePolicy.createScriptURL(url) : url) as string
}

/**
 * Create the `default` policy, once per page: inert HTML, JSON script text,
 * and same-origin script URLs pass; anything else is refused at its sink.
 * Nothing where the browser has no Trusted Types, or the page made one
 * already.
 */
export function installDefaultPolicy(): void {
  const types = factory()
  if (!types || types.defaultPolicy) return
  try {
    types.createPolicy('default', {
      createHTML: inertHtml,
      createScript: jsonScript,
      createScriptURL: input => sameOriginScriptUrl(input, window.location.href),
    })
  }
  catch {
    // The CSP does not list `default`: every untyped sink then refuses outright.
  }
}
