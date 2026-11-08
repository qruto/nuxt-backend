import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import contentWasmPlugin, { WASM_SOURCE } from '../../src/runtime/server/content-wasm'
import { appBrandLogoPath, brandLogoPath } from '../../src/nuxt/brand'
import { allowCrossOriginResources, keepCanonicalCase, OG_IMAGE_ROUTE } from '../../src/nuxt/security'

// The security headers' exceptions: resources other sites load, Content's
// WebAssembly, and the case of canonical URLs. The module wiring is in
// test/module/dev-server-boot.test.ts.

/** The app-wide policy after the plugin's hook ran on it. */
function afterHook(csp: Record<string, unknown>) {
  let run: ((rules: Record<string, unknown>) => void) | undefined
  contentWasmPlugin({ hooks: { hook: (_name, fn) => (run = fn) } })
  const rules = { '/**': { headers: { contentSecurityPolicy: csp } } }
  run!(rules)
  return rules['/**'].headers.contentSecurityPolicy
}

describe('Content\'s WebAssembly', () => {
  it('joins script-src, and only once', () => {
    const scripts = ['\'self\'', '\'strict-dynamic\'', '\'nonce-{{nonce}}\'']
    expect(afterHook({ 'script-src': scripts })).toEqual({ 'script-src': [...scripts, WASM_SOURCE] })
    expect(afterHook({ 'script-src': [...scripts, WASM_SOURCE] })).toEqual({ 'script-src': [...scripts, WASM_SOURCE] })
  })

  it('writes script-src from default-src when the policy has none, leaving default-src as it was', () => {
    expect(afterHook({ 'default-src': ['\'self\''] })).toEqual({ 'default-src': ['\'self\''], 'script-src': ['\'self\'', WASM_SOURCE] })
  })

  it('leaves a policy alone that governs no script', () => {
    expect(afterHook({ 'img-src': ['\'self\''] })).toEqual({ 'img-src': ['\'self\''] })
  })
})

describe('resources other sites load', () => {
  it('names the brand logo\'s path, never another host\'s', () => {
    expect(brandLogoPath('/logo.png')).toBe('/logo.png')
    expect(brandLogoPath('/brand/logo.svg?v=3#mark')).toBe('/brand/logo.svg')
    for (const logo of [undefined, '', '/', 'https://cdn.acme.test/logo.png', '//cdn.acme.test/logo.png', 'logo.png']) expect(brandLogoPath(logo), String(logo)).toBeNull()
  })

  describe('read from the app config', () => {
    let root: string | undefined
    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true })
    })

    it('takes the app\'s own logo over a layer\'s', async () => {
      root = mkdtempSync(join(tmpdir(), 'brand-logo-'))
      const layer = join(root, 'layer')
      for (const [dir, logo] of [[join(root, 'app'), '/own.png'], [join(layer, 'app'), '/layer.png']] as const) {
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'app.config.ts'), `export default defineAppConfig({ backend: { brand: { logo: '${logo}' } } })\n`)
      }
      const options = { rootDir: root, srcDir: join(root, 'app'), _layers: [{ cwd: root, config: { rootDir: root } }, { cwd: layer, config: { rootDir: layer } }] }
      expect(await appBrandLogoPath({ options } as never)).toBe('/own.png')
    })
  })

  it('keeps a rule of the app\'s own for the same path over the package\'s', () => {
    const nuxt = { options: { routeRules: { [OG_IMAGE_ROUTE]: { headers: { 'Cross-Origin-Resource-Policy': 'same-site' } } } } } as unknown as Pick<Nuxt, 'options'>
    allowCrossOriginResources(nuxt, [OG_IMAGE_ROUTE])
    expect(nuxt.options.routeRules?.[OG_IMAGE_ROUTE]).toEqual({
      headers: { 'Cross-Origin-Resource-Policy': 'same-site' },
      security: { headers: { crossOriginResourcePolicy: 'cross-origin' } },
    })
  })
})

describe('the case of canonical URLs', () => {
  const options = (seo: unknown, seoUtils: unknown) => ({ options: { seo, runtimeConfig: { public: seoUtils === undefined ? {} : { 'seo-utils': seoUtils } } } }) as unknown as Pick<Nuxt, 'options'>

  it('is kept by default where nuxt-seo-utils is installed', () => {
    const nuxt = options(undefined, { canonicalLowercase: true })
    keepCanonicalCase(nuxt)
    expect(nuxt.options.runtimeConfig.public['seo-utils']).toEqual({ canonicalLowercase: false })
  })

  it('follows the app\'s own seo.canonicalLowercase, either way', () => {
    for (const own of [true, false]) {
      const nuxt = options({ canonicalLowercase: own }, { canonicalLowercase: own })
      keepCanonicalCase(nuxt)
      expect(nuxt.options.runtimeConfig.public['seo-utils']).toEqual({ canonicalLowercase: own })
    }
  })

  it('writes nothing without nuxt-seo-utils', () => {
    const nuxt = options(undefined, undefined)
    keepCanonicalCase(nuxt)
    expect(nuxt.options.runtimeConfig.public).toEqual({})
  })
})
