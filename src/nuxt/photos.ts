import { createRequire } from 'node:module'
import { join } from 'node:path'
import { addNitroPlugin, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { securityDisabled } from './security'

// The HEIC decoder `preparePhoto` loads when a browser can't open a HEIC
// itself. `heic-to` is an optional peer (LGPL-3.0). Its `heic-to/csp` build,
// the one imported, is about 3 MB of JavaScript (libheif compiled with no
// WebAssembly and no `eval`), fetched only when a HEIC arrives, and decodes
// in a worker it starts from a `blob:` URL. Without the package, the import
// resolves to a stand-in, so the bundle builds and a HEIC opens where the
// browser does (Safari) and is refused as unreadable elsewhere.

/** The specifier `preparePhoto` imports: the build that needs no `'unsafe-eval'`. */
const HEIC_DECODER = 'heic-to/csp'

/** Whether `heic-to` resolves from the app's root, as its build would find it. */
export function heicDecoderInstalled(rootDir: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve(HEIC_DECODER)
    return true
  }
  catch {
    return false
  }
}

/**
 * Point `heic-to/csp` at the stand-in when the app has not installed it.
 * When it has, and the security headers are on, a Nitro plugin adds
 * `blob:` to `worker-src`, the one source its decoder needs beyond the
 * package's policy (src/runtime/server/photo-decoder-csp.ts).
 */
export function registerPhotoDecoder(resolver: Resolver, nuxt: Nuxt): void {
  if (!heicDecoderInstalled(nuxt.options.rootDir)) {
    nuxt.options.alias ||= {}
    nuxt.options.alias[HEIC_DECODER] = resolver.resolve('./runtime/vue/utils/heic-absent')
    return
  }
  if (securityDisabled(nuxt)) return
  const plugin = resolver.resolve('./runtime/server/photo-decoder-csp')
  addNitroPlugin({ nitro2: plugin, nitro3: plugin })
}
