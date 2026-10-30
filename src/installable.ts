/**
 * The installable app: a web app manifest from the brand and two icons,
 * what the Nuxt module serves (src/nuxt/installable.ts) and what `doctor`
 * checks (`installable`). Runtime-neutral of Nuxt: both read one rule.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BackendBrand } from './brand-file'
import { finding, type PreflightFinding } from './findings'

/** Where the module serves the manifest, linked from every page. */
export const MANIFEST_ROUTE = '/manifest.webmanifest'

/** The two icons Chromium-based browsers require, in `public/`, with their sizes. */
export const INSTALL_ICONS = [{ file: 'icon-192.png', size: 192 }, { file: 'icon-512.png', size: 512 }] as const

/** The manifest files an app of its own may ship in `public/`: then the module adds none. */
const OWN_MANIFESTS = ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']

/** The modules that write a manifest of their own. */
export const MANIFEST_MODULES = ['@vite-pwa/nuxt', '@kevinmarrec/nuxt-pwa', 'nuxt-pwa-module']

/** What stops the module from making the app installable: the icons missing from `public/`, and a missing brand name. Empty when nothing does. */
export function installableGaps(publicDir: string, brand: BackendBrand | null): string[] {
  return [
    ...INSTALL_ICONS.filter(icon => !existsSync(join(publicDir, icon.file))).map(icon => `public/${icon.file} (${icon.size} × ${icon.size} px)`),
    ...(brand?.name ? [] : ['app.config\'s `backend.brand.name`']),
  ]
}

/** Whether the app ships a manifest of its own, in `public/` or from a PWA module: then the module adds none. */
export function ownsManifest(publicDir: string, modules: readonly string[]): boolean {
  return OWN_MANIFESTS.some(file => existsSync(join(publicDir, file))) || modules.some(name => MANIFEST_MODULES.includes(name))
}

/** The manifest the module serves for a brand name. */
export function webAppManifest(name: string): Record<string, unknown> {
  return {
    name,
    short_name: name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    icons: INSTALL_ICONS.map(icon => ({ src: `/${icon.file}`, sizes: `${icon.size}x${icon.size}`, type: 'image/png', purpose: 'any' })),
  }
}

/**
 * `doctor`'s check: installable, or which icon or brand name is missing.
 * It warns once the app reaches for it, with an icon in place; before
 * that it passes, saying what is missing (push keys alone are no sign: `env
 * push` generates them for every app). Nothing for an app with a manifest
 * of its own.
 */
export function installableFinding(publicDir: string, brand: BackendBrand | null, { modules, pushKeys }: { modules: readonly string[], pushKeys: boolean }): PreflightFinding[] {
  if (ownsManifest(publicDir, modules)) return []
  const gaps = installableGaps(publicDir, brand)
  if (gaps.length === 0) return [finding('installable', 'pass', `The app is installable: the module serves ${MANIFEST_ROUTE} for ${brand!.name}, with both icons.`)]
  const reaching = INSTALL_ICONS.some(icon => existsSync(join(publicDir, icon.file)))
  const message = `The module adds no web app manifest: ${gaps.join(' and ')} ${gaps.length === 1 ? 'is' : 'are'} missing.${pushKeys ? ' iPhone and iPad take web push only once the app is on the Home Screen.' : ''}`
  const fix = 'Add two square PNG icons with a solid background to public/ (icon-192.png and icon-512.png), and set backend.brand.name in app.config.'
  return [finding('installable', reaching ? 'warn' : 'pass', reaching ? message : `Not installable yet (optional): ${gaps.join(' and ')} ${gaps.length === 1 ? 'is' : 'are'} missing.`, reaching ? fix : '')]
}
