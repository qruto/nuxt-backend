/**
 * The installable app: a web app manifest from the brand, two icons and
 * the `installable` option, what the Nuxt module serves
 * (src/nuxt/installable.ts) and what `doctor` checks (`installable`).
 * Runtime-neutral of Nuxt: both read one rule.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BackendBrand } from './brand-file'
import { finding, type PreflightFinding } from './findings'

/** Where the module serves the manifest, linked from every page. */
export const MANIFEST_ROUTE = '/manifest.webmanifest'

/** The two sizes Chromium-based browsers require. */
export const INSTALL_SIZES = [192, 512] as const

/** An icon size the manifest lists. */
export type InstallSize = (typeof INSTALL_SIZES)[number]

/** Two icons, by their path on the site: `/icon-192.png`. */
export type InstallIcons = Readonly<Record<InstallSize, string>>

/** The icon pairs the module looks for in `public/`, in order: its own names, then the ones RealFaviconGenerator writes. */
export const ICON_SETS: readonly InstallIcons[] = [
  { 192: '/icon-192.png', 512: '/icon-512.png' },
  { 192: '/web-app-manifest-192x192.png', 512: '/web-app-manifest-512x512.png' },
]

/** The maskable pair the module looks for in `public/`. */
export const MASKABLE_ICONS: InstallIcons = { 192: '/icon-maskable-192.png', 512: '/icon-maskable-512.png' }

/** The Apple touch icon the module links when `public/` holds it; else the 192 px icon. */
export const APPLE_TOUCH_ICON = '/apple-touch-icon.png'

/** The manifest files an app of its own may ship in `public/`: then the module adds none. */
const OWN_MANIFESTS = ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']

/** The modules that write a manifest of their own. */
export const MANIFEST_MODULES = ['@vite-pwa/nuxt', '@kevinmarrec/nuxt-pwa', 'nuxt-pwa-module']

/**
 * `backend.installable` in nuxt.config: what the manifest says beyond the
 * brand's name, or `false` for no manifest at all.
 */
export interface InstallableOptions {
  /**
   * The colour of the browser's title bar and the task switcher for the
   * installed app, and of the address bar on Android: one colour, or one
   * per scheme (`{ light, dark }`), which the pages also carry as
   * `theme-color` meta tags. Default: none, the browser's own.
   */
  themeColor?: string | { light: string, dark: string }
  /** The splash screen's background while the installed app opens. Default: the theme colour, its light one. */
  backgroundColor?: string
  /** One line on what the app does, in the install dialog. */
  description?: string
  /**
   * The two icons, by their path on the site (`/icons/app-192.png`) when
   * they are not where the module looks: `icon-192.png` and
   * `icon-512.png` in `public/`, else RealFaviconGenerator's
   * `web-app-manifest-192x192.png` and `web-app-manifest-512x512.png`.
   */
  icons?: InstallIcons
  /**
   * Maskable icons: full-bleed artwork a platform crops to its own shape.
   * Their two paths; or `true` when the two icons are full-bleed already,
   * so each is listed for both purposes. Default: `icon-maskable-192.png`
   * and `icon-maskable-512.png` when `public/` holds them, else none.
   */
  maskable?: boolean | InstallIcons
}

/** A path on the site as a file in `public/`. */
const fileOf = (publicDir: string, path: string) => join(publicDir, ...path.replace(/^\/+/, '').split('/'))
const present = (publicDir: string, icons: InstallIcons) => INSTALL_SIZES.every(size => existsSync(fileOf(publicDir, icons[size])))

/** The two icons the manifest lists: the ones the option names, else the first pair `public/` holds whole, else the module's own names. */
export function installIcons(publicDir: string, options: InstallableOptions = {}): InstallIcons {
  return options.icons ?? ICON_SETS.find(set => present(publicDir, set)) ?? ICON_SETS[0]!
}

/** The maskable pair, or `null` for none. */
export function maskableIcons(publicDir: string, options: InstallableOptions = {}): InstallIcons | null {
  if (options.maskable === true) return installIcons(publicDir, options)
  // A pair of the app's that `public/` does not hold is left out: a manifest never names a missing icon.
  if (options.maskable) return present(publicDir, options.maskable) ? options.maskable : null
  if (options.maskable === false) return null
  return present(publicDir, MASKABLE_ICONS) ? MASKABLE_ICONS : null
}

/** What stops the module from making the app installable: the icons missing from `public/`, and a missing brand name. Empty when nothing does. */
export function installableGaps(publicDir: string, brand: BackendBrand | null, options: InstallableOptions = {}): string[] {
  const icons = installIcons(publicDir, options)
  return [
    ...INSTALL_SIZES.filter(size => !existsSync(fileOf(publicDir, icons[size]))).map(size => `public${icons[size]} (${size} × ${size} px)`),
    ...(brand?.name ? [] : ['app.config\'s `backend.brand.name`']),
  ]
}

/** Whether the app ships a manifest of its own: a file in `public/`, a PWA module, or a `<link rel="manifest">` in `app.head`. Then the module adds none. */
export function ownsManifest(publicDir: string, modules: readonly string[], links: readonly unknown[] = []): boolean {
  const linked = links.some(link => typeof link === 'object' && link !== null && String((link as { rel?: unknown }).rel).split(/\s+/).includes('manifest'))
  return linked || OWN_MANIFESTS.some(file => existsSync(join(publicDir, file))) || modules.some(name => MANIFEST_MODULES.includes(name))
}

/** The light theme colour of an option, the one the manifest carries. */
const lightColor = (color: InstallableOptions['themeColor']) => (typeof color === 'string' ? color : color?.light)

/** The manifest the module serves for a brand name, its icons and the option. */
export function webAppManifest(name: string, { icons = ICON_SETS[0]!, maskable = null, ...options }: Omit<InstallableOptions, 'maskable' | 'icons'> & { icons?: InstallIcons, maskable?: InstallIcons | null } = {}): Record<string, unknown> {
  const theme = lightColor(options.themeColor)
  const background = options.backgroundColor ?? theme
  const entries = (pair: InstallIcons, purpose: 'any' | 'maskable') => INSTALL_SIZES.map(size => ({ src: pair[size], sizes: `${size}x${size}`, type: 'image/png', purpose }))
  return {
    name,
    short_name: name,
    ...(options.description ? { description: options.description } : {}),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    ...(theme ? { theme_color: theme } : {}),
    ...(background ? { background_color: background } : {}),
    icons: [...entries(icons, 'any'), ...(maskable ? entries(maskable, 'maskable') : [])],
  }
}

/** The `theme-color` meta tags the pages carry: one, or one per scheme. */
export function themeColorMeta(color: InstallableOptions['themeColor']): Array<{ name: 'theme-color', content: string, media?: string }> {
  if (!color) return []
  if (typeof color === 'string') return [{ name: 'theme-color', content: color }]
  return [
    { name: 'theme-color', content: color.light, media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: color.dark, media: '(prefers-color-scheme: dark)' },
  ]
}

/**
 * `doctor`'s check: installable, or which icon or brand name is missing.
 * It warns once the app reaches for it, with an icon in place; before
 * that it passes, saying what is missing (push keys alone are no sign: `env
 * push` generates them for every app). Nothing for an app with a manifest
 * of its own, or with `installable: false`.
 */
export function installableFinding(publicDir: string, brand: BackendBrand | null, { modules, pushKeys, options, links }: { modules: readonly string[], pushKeys: boolean, options?: InstallableOptions | false, links?: readonly unknown[] }): PreflightFinding[] {
  if (options === false || ownsManifest(publicDir, modules, links)) return []
  const gaps = installableGaps(publicDir, brand, options)
  if (gaps.length === 0) return [finding('installable', 'pass', `The app is installable: the module serves ${MANIFEST_ROUTE} for ${brand!.name}, with both icons.`)]
  const icons = installIcons(publicDir, options)
  const reaching = INSTALL_SIZES.some(size => existsSync(fileOf(publicDir, icons[size])))
  const message = `The module adds no web app manifest: ${gaps.join(' and ')} ${gaps.length === 1 ? 'is' : 'are'} missing.${pushKeys ? ' iPhone and iPad take web push only once the app is on the Home Screen.' : ''}`
  const fix = `Add two square PNG icons with a solid background to public/ (${INSTALL_SIZES.map(size => icons[size].slice(1)).join(' and ')}), and set backend.brand.name in app.config.`
  return [finding('installable', reaching ? 'warn' : 'pass', reaching ? message : `Not installable yet (optional): ${gaps.join(' and ')} ${gaps.length === 1 ? 'is' : 'are'} missing.`, reaching ? fix : '')]
}

/** A CSS colour as the manifest and the `theme-color` tag take it: a hex, a named colour, or a colour function. */
const COLOR = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\))$/i

/** A path on this site that maps into `public/`: one leading `/`, no other origin, no way out of the folder. */
function isPublicPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/^[a-z][\w+.-]*:/i.test(value) && !value.split(/[/\\]/).includes('..')
}

/** What is wrong with an icon pair: both sizes, each a path into `public/`. */
function pairProblems(key: string, pair: unknown): string[] {
  if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return [`\`installable.${key}\` takes \`{ 192: '/icon-192.png', 512: '/icon-512.png' }\`.`]
  return INSTALL_SIZES.flatMap((size) => {
    const path = (pair as Record<number, unknown>)[size]
    if (path === undefined) return [`\`installable.${key}\` has no ${size} px icon: give both sizes.`]
    return isPublicPath(path) ? [] : [`\`installable.${key}[${size}]\` is ${JSON.stringify(path)}: give a path of a file in \`public/\`, with one leading \`/\`, never another origin.`]
  })
}

/**
 * Why the `installable` option cannot be used, one sentence each; empty
 * when it can. `assertModuleOptions` refuses the build with them, so a
 * mistake shows at the start and never as a broken manifest.
 */
export function installableProblems(value: unknown): string[] {
  if (value === undefined || value === false) return []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['`installable` takes an object of options, or `false` for no manifest.']
  const options = value as Record<string, unknown>
  const color = (key: string, color: unknown) => (typeof color === 'string' && COLOR.test(color.trim()) ? [] : [`\`installable.${key}\` is ${JSON.stringify(color)}: give a CSS colour, such as '#ffb900'.`])
  const theme = options.themeColor
  return [
    ...(theme === undefined ? [] : typeof theme === 'object' && theme !== null ? [...color('themeColor.light', (theme as Record<string, unknown>).light), ...color('themeColor.dark', (theme as Record<string, unknown>).dark)] : color('themeColor', theme)),
    ...(options.backgroundColor === undefined ? [] : color('backgroundColor', options.backgroundColor)),
    ...(options.description === undefined || typeof options.description === 'string' ? [] : ['`installable.description` takes a string.']),
    ...(options.icons === undefined ? [] : pairProblems('icons', options.icons)),
    ...(options.maskable === undefined || typeof options.maskable === 'boolean' ? [] : pairProblems('maskable', options.maskable)),
  ]
}

/**
 * What the build says of a pair the option names that `public/` does not
 * hold both of: `icons`, which leaves the app with no manifest, and
 * `maskable`, which leaves the manifest without maskable icons. A typo in a
 * path would otherwise pass in silence. Empty when nothing is missing.
 */
export function namedIconWarnings(publicDir: string, options: InstallableOptions = {}): string[] {
  const missing = (key: 'icons' | 'maskable', pair: InstallIcons, outcome: string) => `\`installable.${key}\` names ${pair[192]} and ${pair[512]}, and public/ does not hold both: ${outcome}`
  return [
    ...(options.icons && !present(publicDir, options.icons) ? [missing('icons', options.icons, 'the module serves no manifest.')] : []),
    ...(typeof options.maskable === 'object' && !present(publicDir, options.maskable) ? [missing('maskable', options.maskable, 'the manifest lists no maskable icon.')] : []),
  ]
}
