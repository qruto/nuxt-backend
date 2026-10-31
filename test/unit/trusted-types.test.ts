import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { securityDefaults, securityDisabled } from '../../src/nuxt/security'
import { inertHtml, jsonScript, sameOriginScriptUrl, TRUSTED_TYPES_POLICIES } from '../../src/runtime/vue/trusted-types'

// The content security policy the package asks nuxt-security for, and the
// narrow `default` Trusted Types policy: what passes a sink without a policy
// of its own is what cannot run script. (Checked in Chrome on 2026-10-27:
// the head manager's JSON-LD passes, markup and foreign script URLs throw.)

describe('the security defaults', () => {
  it('a production build requires Trusted Types, with the policies the package creates, and keeps the nonce', () => {
    expect(securityDefaults(false)).toEqual({
      nonce: true,
      headers: { contentSecurityPolicy: { 'worker-src': ['\'self\''], 'manifest-src': ['\'self\''], 'require-trusted-types-for': '\'script\'', 'trusted-types': ['vue', 'nuxt-backend', 'default'] } },
    })
    expect(TRUSTED_TYPES_POLICIES).toContain('vue')
  })

  it('development keeps the nonce and leaves Trusted Types off, for Vite\'s overlay', () => {
    expect(securityDefaults(true)).toEqual({ nonce: true, headers: { contentSecurityPolicy: { 'worker-src': ['\'self\''], 'manifest-src': ['\'self\''] } } })
  })

  it('names the push worker and the web app manifest as the app\'s own, whatever the policy\'s fallback', () => {
    for (const dev of [true, false]) {
      expect((securityDefaults(dev).headers as { contentSecurityPolicy: Record<string, unknown> }).contentSecurityPolicy).toMatchObject({ 'worker-src': ['\'self\''], 'manifest-src': ['\'self\''] })
    }
  })

  it('is off only for `security: false`, nuxt-security\'s own switch, never for its options object', () => {
    const app = (security: unknown) => ({ options: { security } }) as unknown as Pick<Nuxt, 'options'>
    expect(securityDisabled(app(false))).toBe(true)
    for (const security of [undefined, {}, { nonce: false }, true]) {
      expect(securityDisabled(app(security))).toBe(false)
    }
  })
})

describe('the default policy', () => {
  it('passes HTML without markup, and refuses any with a tag', () => {
    expect(inertHtml('plain &amp; text')).toBe('plain &amp; text')
    expect(inertHtml('{"@type":"Product","name":"Pro \\u003Cb\\u003E"}')).not.toBeNull()
    expect(inertHtml('<img src=x onerror=alert(1)>')).toBeNull()
    expect(inertHtml('text <b>bold</b>')).toBeNull()
  })

  it('passes script text that is JSON, and refuses code', () => {
    expect(jsonScript('{"@context":"https://schema.org"}')).not.toBeNull()
    expect(jsonScript('[1,2]')).not.toBeNull()
    expect(jsonScript('alert(1)')).toBeNull()
    expect(jsonScript('{"a":1};alert(1)')).toBeNull()
  })

  it('passes a script URL on the page\'s origin, and refuses any other', () => {
    const page = 'https://app.example.com/pricing'
    expect(sameOriginScriptUrl('/_nuxt/entry.js', page)).toBe('/_nuxt/entry.js')
    expect(sameOriginScriptUrl('https://app.example.com/a.js', page)).not.toBeNull()
    expect(sameOriginScriptUrl('https://evil.example/a.js', page)).toBeNull()
    expect(sameOriginScriptUrl('//evil.example/a.js', page)).toBeNull()
    expect(sameOriginScriptUrl('javascript:alert(1)', page)).toBeNull()
    expect(sameOriginScriptUrl('data:text/javascript,alert(1)', page)).toBeNull()
  })
})
