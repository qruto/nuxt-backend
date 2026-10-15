import { addTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { logger } from './logger'

// The generated theme stylesheet: what the package's own stylesheet cannot
// say for itself, added right after it.
// - For every app, the light default for `light-dark()` once a production
//   build has rewritten it, in the first layer, so any `color-scheme` rule of
//   the app's wins over it.
// - The bridge onto the theme an app already has. With @nuxt/ui, the
//   neutrals, the edge and the card radius map onto Nuxt UI's own, while the
//   signals stay the package's (wide-gamut, see tokens.css). With
//   @nuxtjs/color-mode (which @nuxt/ui installs), the components follow the
//   class it puts on <html>, not the OS preference, and with either module,
//   the nearest `.dark` or `.light` around them. In the same cascade layer
//   as the package's own stylesheet, so an app's override still wins without
//   specificity.

/**
 * Every root the token layer themes. tokens.css declares the same list;
 * test/unit/theme-bridge.test.ts holds the two together.
 *
 * @internal
 */
export const TOKEN_ROOTS = [
  '[data-auth=\'form\']',
  '[data-auth=\'page\']',
  '[data-invitation]',
  '[data-consent]',
  '[data-gift=\'banner\']',
  '[data-credits=\'banner\']',
  '[data-history=\'root\']',
  '[data-usage=\'root\']',
  '[data-pricing=\'table\']',
  '[data-pricing=\'page\']',
  '[data-settings=\'root\']',
  '[data-settings=\'page\']',
  '[data-profile=\'root\']',
  '[data-profile=\'page\']',
  '[data-security=\'root\']',
  '[data-security=\'page\']',
] as const

/**
 * The `--bk-*` tokens on Nuxt UI's: the neutrals, the edge and the card
 * radius, the variables Nuxt UI documents for an app to theme (an app
 * restyles them the Nuxt UI way, in its own CSS). The signals and the text on
 * the accent stay the package's own wide-gamut colours, `--bk-ink` keeps
 * inheriting the text colour Nuxt UI gives the page, and controls stay pills
 * (`--bk-radius-control`). The card radius is Nuxt UI's `rounded-lg`, its
 * cards'.
 *
 * @internal
 */
export const NUXT_UI_TOKENS: Readonly<Record<string, string>> = {
  '--bk-muted': 'var(--ui-text-muted)',
  '--bk-edge': 'var(--ui-border)',
  '--bk-surface': 'var(--ui-bg-muted)',
  '--bk-radius': 'calc(var(--ui-radius) * 2)',
}

/**
 * The light default for a rewritten `light-dark()`, set on the root. Vite
 * minifies CSS with Lightning CSS for its default targets (Chrome 111, Safari
 * 16.4, Firefox 114), which predate `light-dark()`, so each `light-dark(a, b)`
 * becomes `var(--lightningcss-light, a) var(--lightningcss-dark, b)`, and
 * Lightning CSS defines the two variables only in rules that declare
 * `color-scheme`. On a page that declares none, both stay undefined and every
 * `--bk-*` colour reads `a b`, which no property accepts. With these, the
 * light value stands, as `light-dark()` itself resolves without a scheme;
 * `nuxt dev` never rewrites, so there they do nothing. At zero specificity in
 * `theme.backend`, below every other layer: a rule of the app's that declares
 * `color-scheme` wins in any layer or none, and an element that declares one
 * passes its own pair down.
 *
 * @internal
 */
export const LIGHT_DARK_DEFAULT: Readonly<Record<string, string>> = {
  '--lightningcss-light': 'initial',
  '--lightningcss-dark': '',
}

/** @internal */
export interface ThemeBridge {
  /** Map the tokens onto @nuxt/ui's, and follow its `.dark` and `.light` classes. */
  nuxtUi: boolean
  /** The class names @nuxtjs/color-mode puts on <html>, or `false` without it. */
  colorMode: { dark: string, light: string } | false
}

const roots = `:where(${TOKEN_ROOTS.join(', ')})`

/** One rule, indented to sit in a layer block. */
function rule(selector: string, declarations: Readonly<Record<string, string>>): string {
  const body = Object.entries(declarations).map(([property, value]) => `    ${property}: ${value};`)
  return `  ${selector} {\n${body.join('\n')}\n  }`
}

/**
 * The `color-scheme` rules for one scheme, given the classes that mean it.
 * The <html> rule follows the class color-mode sets there. The `@scope` rule
 * follows the nearest element with one of the classes, the root itself
 * included, since Nuxt UI switches its neutrals on `.dark` and `.light`
 * anywhere: a dark section on a light page gets dark signals too. Scoping
 * proximity puts the nearest class first, and a browser without `@scope`
 * keeps the <html> rule.
 */
function schemeRules(scheme: 'dark' | 'light', classes: readonly string[]): string[] {
  if (classes.length === 0) return []
  const declaration = { 'color-scheme': scheme }
  const scoped = rule(`:scope${roots}, ${roots}`, declaration).replace(/^/gm, '  ')
  return [
    rule(`:where(${classes.map(name => `html.${name}`).join(', ')}) ${roots}`, declaration),
    `  @scope (${classes.map(name => `.${name}`).join(', ')}) {\n${scoped}\n  }`,
  ]
}

/**
 * The generated stylesheet: the light-dark default for every app, then the
 * bridges the app has modules for.
 *
 * @internal
 */
export function themeBridgeCss(bridge: ThemeBridge): string {
  const rules: string[] = []
  if (bridge.nuxtUi) rules.push(rule(roots, NUXT_UI_TOKENS))
  // light-dark() in the token defaults resolves against color-scheme, which
  // neither module sets: without these, a dark page under a light OS keeps
  // the light values. Nuxt UI's own classes are `dark` and `light`.
  for (const scheme of ['dark', 'light'] as const) {
    const classes = new Set<string>(bridge.nuxtUi ? [scheme] : [])
    if (bridge.colorMode) classes.add(bridge.colorMode[scheme])
    rules.push(...schemeRules(scheme, [...classes]))
  }
  const blocks = [`@layer theme.backend {\n${rule(':where(:root)', LIGHT_DARK_DEFAULT)}\n}`]
  if (rules.length > 0) blocks.push(`@layer components.backend {\n${rules.join('\n\n')}\n}`)
  // The layer order statement again, as ui.css declares it: wherever this
  // file ends up, `components` never becomes the first layer declared.
  return `/* Generated by nuxt-backend: the packaged components on the app's theme. */\n@layer theme, base, components, utilities;\n\n${blocks.join('\n\n')}\n`
}

/** A class-name affix @nuxtjs/color-mode may be configured with. */
const CLASS_AFFIX = /^[\w-]*$/

/** An installed module by name; one the app turned off (`colorMode: false`) does not count. */
function installedModule(nuxt: Nuxt, name: string): { meta: { version?: string } } | undefined {
  return nuxt.options._installedModules.find(({ meta }) => meta.name === name && !meta.disabled)
}

/**
 * The options @nuxtjs/color-mode rendered for its own runtime
 * (`#build/color-mode-options.mjs`, an `export const` per option): what it
 * runs with, every source resolved. Empty when there is no such file to read.
 */
async function renderedColorModeOptions(nuxt: Nuxt): Promise<Record<string, unknown>> {
  const template = nuxt.options.build.templates.find(entry => entry.filename === 'color-mode-options.mjs')
  if (!template?.getContents) return {}
  try {
    const contents = await template.getContents({ nuxt, app: {} as never, options: template.options ?? {} })
    return Object.fromEntries([...contents.matchAll(/^export const (\w+) = (".*")$/gm)].map(([, key, value]) => [key, JSON.parse(value!)]))
  }
  catch {
    return {}
  }
}

/**
 * The affixes of the class color-mode puts on <html>
 * (`${classPrefix}dark${classSuffix}`). `nuxt.options.colorMode` holds only
 * the keys the app set: neither the module's own defaults (`classSuffix:
 * '-mode'` up to v3, none from v4) nor options another module passed it
 * inline (Nuxt UI 3 installs it with `classSuffix: ''`). So the options it
 * rendered decide; without them, the configured keys over the installed
 * version's defaults.
 */
async function colorModeAffixes(nuxt: Nuxt, version: string | undefined): Promise<{ prefix: unknown, suffix: unknown }> {
  const rendered = await renderedColorModeOptions(nuxt)
  const configured = (nuxt.options as { colorMode?: { classPrefix?: unknown, classSuffix?: unknown } }).colorMode ?? {}
  const major = Number.parseInt(version ?? '', 10)
  return {
    prefix: 'classPrefix' in rendered ? rendered.classPrefix : configured.classPrefix ?? '',
    suffix: 'classSuffix' in rendered ? rendered.classSuffix : configured.classSuffix ?? (major < 4 ? '-mode' : ''),
  }
}

/**
 * What the app has installed to bridge to: read once every module is in,
 * because an app may list @nuxt/ui after this module.
 *
 * @internal
 */
export async function detectThemeBridge(nuxt: Nuxt): Promise<ThemeBridge> {
  let colorMode: ThemeBridge['colorMode'] = false
  const colorModeModule = installedModule(nuxt, '@nuxtjs/color-mode')
  if (colorModeModule) {
    const { prefix, suffix } = await colorModeAffixes(nuxt, colorModeModule.meta.version)
    if (typeof prefix === 'string' && typeof suffix === 'string' && CLASS_AFFIX.test(prefix) && CLASS_AFFIX.test(suffix)) {
      colorMode = { dark: `${prefix}dark${suffix}`, light: `${prefix}light${suffix}` }
    }
    else {
      logger.warn(`The packaged components can't follow @nuxtjs/color-mode: its class affixes (${JSON.stringify(prefix)}, ${JSON.stringify(suffix)}) aren't plain class names. Set \`color-scheme\` on the page yourself.`)
    }
  }
  return { nuxtUi: Boolean(installedModule(nuxt, '@nuxt/ui')), colorMode }
}

/**
 * Add the generated stylesheet right after `uiCss` once every module is in.
 */
export function registerThemeBridge(nuxt: Nuxt, uiCss: string): void {
  nuxt.hook('modules:done', async () => {
    const contents = themeBridgeCss(await detectThemeBridge(nuxt))
    const { dst } = addTemplate({ filename: 'nuxt-backend/theme-bridge.css', getContents: () => contents, write: true })
    const at = nuxt.options.css.indexOf(uiCss)
    if (at < 0) nuxt.options.css.push(dst)
    else nuxt.options.css.splice(at + 1, 0, dst)
  })
}
