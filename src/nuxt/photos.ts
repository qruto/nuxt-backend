import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

// The HEIC decoder `preparePhoto` loads when a browser can't open a HEIC
// itself. `heic-to` is an optional peer (LGPL-3.0, a few megabytes of
// WebAssembly, fetched only when a HEIC arrives): without it, its import
// resolves to a stand-in, so the bundle builds and a HEIC opens where the
// browser does (Safari) and is refused as unreadable elsewhere.

/** Whether `heic-to` resolves from the app's root, as its build would find it. */
export function heicDecoderInstalled(rootDir: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve('heic-to')
    return true
  }
  catch {
    return false
  }
}

/** Point `heic-to` at the stand-in when the app has not installed it. */
export function registerPhotoDecoder(resolver: Resolver, nuxt: Nuxt): void {
  if (heicDecoderInstalled(nuxt.options.rootDir)) return
  nuxt.options.alias ||= {}
  nuxt.options.alias['heic-to'] = resolver.resolve('./runtime/vue/utils/heic-absent')
}
