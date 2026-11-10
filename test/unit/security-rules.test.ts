import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import contentWasmPlugin, { WASM_SOURCE } from '../../src/runtime/server/content-wasm'
import photoDecoderSecurityPlugin, { BLOB_WORKER_SOURCE } from '../../src/runtime/server/photo-decoder-csp'
import type { SecurityNitroApp } from '../../src/runtime/server/csp'
import { appBrandLogoPath, brandLogoPath } from '../../src/nuxt/brand'
import { allowCrossOriginResources, OG_IMAGE_ROUTE } from '../../src/nuxt/security'

// The security headers' exceptions: resources other sites load, Content's
// WebAssembly and the HEIC decoder's worker. The module wiring is in
// test/module/dev-server-boot.test.ts and test/unit/prepare-photo.test.ts,
// and the headers a built app answers with in test/e2e/starter.test.ts.

/** The app-wide policy after the plugin's hook ran on it. */
function afterHook(csp: Record<string, unknown>, plugin: (nitroApp: SecurityNitroApp) => void = contentWasmPlugin) {
  let run: ((rules: Record<string, unknown>) => void) | undefined
  plugin({ hooks: { hook: (_name, fn) => (run = fn) } })
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

describe('the HEIC decoder\'s worker', () => {
  const decoder = (csp: Record<string, unknown>) => afterHook(csp, photoDecoderSecurityPlugin)
  const scripts = ['\'self\'', '\'strict-dynamic\'', '\'nonce-{{nonce}}\'']

  it('joins the package\'s worker-src, only once, and leaves script-src as it was: no eval, no WebAssembly', () => {
    expect(decoder({ 'worker-src': ['\'self\''], 'script-src': scripts })).toEqual({ 'worker-src': ['\'self\'', BLOB_WORKER_SOURCE], 'script-src': scripts })
    expect(decoder({ 'worker-src': '\'self\' blob:' })).toEqual({ 'worker-src': '\'self\' blob:' })
  })

  it('follows the fallback of a policy with no worker-src: child-src when set, else a worker-src of its own', () => {
    expect(decoder({ 'child-src': ['\'self\''] })).toEqual({ 'child-src': ['\'self\'', BLOB_WORKER_SOURCE] })
    expect(decoder({ 'script-src': scripts, 'default-src': ['\'self\''] })).toEqual({ 'script-src': scripts, 'default-src': ['\'self\''], 'worker-src': [...scripts, BLOB_WORKER_SOURCE] })
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

  it('keeps the app\'s own header for the path, said either way, in both forms', () => {
    const rules = { [OG_IMAGE_ROUTE]: { headers: { 'Cross-Origin-Resource-Policy': 'same-site', 'X-Own': '1' } }, '/logo.png': { security: { headers: { crossOriginResourcePolicy: 'same-site' } } } }
    const nuxt = { options: { routeRules: rules } } as unknown as Pick<Nuxt, 'options'>
    allowCrossOriginResources(nuxt, [OG_IMAGE_ROUTE, '/logo.png'])
    expect(nuxt.options.routeRules?.[OG_IMAGE_ROUTE]).toEqual({
      headers: { 'Cross-Origin-Resource-Policy': 'same-site', 'X-Own': '1' },
      security: { headers: { crossOriginResourcePolicy: 'same-site' } },
    })
    expect(nuxt.options.routeRules?.['/logo.png']).toEqual({
      headers: { 'Cross-Origin-Resource-Policy': 'same-site' },
      security: { headers: { crossOriginResourcePolicy: 'same-site' } },
    })
  })

  it('says cross-origin in both forms where the app has no rule', () => {
    const nuxt = { options: {} } as unknown as Pick<Nuxt, 'options'>
    allowCrossOriginResources(nuxt, [OG_IMAGE_ROUTE])
    expect(nuxt.options.routeRules?.[OG_IMAGE_ROUTE]).toEqual({
      headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
      security: { headers: { crossOriginResourcePolicy: 'cross-origin' } },
    })
  })
})
