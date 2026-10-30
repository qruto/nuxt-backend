import { DARK_SCHEME_QUERY } from './email-scheme.js'

// The look of the email layout: the colors of each scheme, the fonts, and the
// stylesheet that turns the dark scheme on. `setupEmail`'s `theme` sets them;
// what it leaves out keeps the package's default, and the dark scheme not
// given is derived from the light one. Runtime-neutral, so a preview, a test
// and a Convex mutation resolve the same theme.

/** The five colors of one color scheme of the layout. Each is a hex color: `#d500f9` or `#d0f`. */
export interface EmailColors {
  /** The page behind the message. */
  background: string
  /** The card the message sits on. */
  card: string
  /** The message's text. */
  text: string
  /** The color of buttons and of the code block, and of the kicker's text. */
  accent: string
  /** The text on an `accent` background: a button's label, a code. */
  accentText: string
}

/** The font stacks of the layout: CSS `font-family` values. */
export interface EmailFonts {
  /** The heading, the kicker, the code and the brand name in the header. */
  heading: string
  /** Everything else. */
  body: string
}

/**
 * The look of the emails the package sends and the ones you compose, as
 * `setupEmail`'s `theme` takes it. Every key is optional: what you leave out
 * keeps the package's default.
 */
export interface EmailTheme {
  /** The light scheme, the default one. */
  colors?: Partial<EmailColors>
  /**
   * The dark scheme, for readers whose client honors `prefers-color-scheme`.
   * What it leaves out is derived from `colors`.
   */
  dark?: Partial<EmailColors>
  /** CSS font stacks; most mail clients load no web fonts, so end each with one every device has. */
  fonts?: Partial<EmailFonts>
}

/** One color scheme as the layout renders it: the five colors, and two derived from them. */
export interface EmailScheme extends EmailColors {
  /** Quiet text, such as small print and the footer: the text color toward the card's. */
  muted: string
  /** The card's border: the text color, mostly faded into the card's. */
  rule: string
}

/** The theme in effect: every color and font set. What `EmailRenderContext.theme` carries. */
export interface ResolvedEmailTheme {
  colors: EmailScheme
  dark: EmailScheme
  fonts: EmailFonts
}

const SYSTEM_STACK = '-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif'

/** The package's default look: the light scheme, and the fonts. */
export const DEFAULT_EMAIL_COLORS: Readonly<EmailColors> = {
  background: '#f4f4f5',
  card: '#ffffff',
  text: '#18181b',
  accent: '#18181b',
  accentText: '#ffffff',
}

/** The package's default fonts: the system's own, in both stacks. */
export const DEFAULT_EMAIL_FONTS: Readonly<EmailFonts> = { heading: SYSTEM_STACK, body: SYSTEM_STACK }

const COLOR_KEYS = ['background', 'card', 'text', 'accent', 'accentText'] as const
const FONT_KEYS = ['heading', 'body'] as const

const HEX = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
/** A font stack is names, quotes, commas and hyphens: nothing that could end a style attribute or add a rule. */
const STACK = /^[\w\s'",.-]+$/

type Rgb = readonly [number, number, number]

function rgbOf(hex: string): Rgb {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map(d => d + d).join('') : digits
  return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb
}

function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`
}

/** `from` moved `amount` (0 to 1) of the way to `to`. */
function mix(from: string, to: string, amount: number): string {
  const [a, b] = [rgbOf(from), rgbOf(to)]
  return hexOf([0, 1, 2].map(i => a[i]! + (b[i]! - a[i]!) * amount) as unknown as Rgb)
}

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as unknown as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two colors, 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** `color` lightened toward white until it reads at 4.5:1 or better on `ground`; unchanged when it already does. */
function lightenOnto(color: string, ground: string): string {
  let lightened = color
  for (let step = 1; step <= 20 && contrastRatio(lightened, ground) < 4.5; step++) lightened = mix(color, '#ffffff', step / 20)
  return lightened
}

/** The text color on `accent`: the dark card when it reads at 4.5:1, else black or white, whichever reads better. */
function textOn(accent: string, preferred: string): string {
  if (contrastRatio(preferred, accent) >= 4.5) return preferred
  return contrastRatio('#ffffff', accent) >= contrastRatio('#000000', accent) ? '#ffffff' : '#000000'
}

/** The two derived colors of a scheme. */
function scheme(colors: EmailColors): EmailScheme {
  return { ...colors, muted: mix(colors.text, colors.card, 0.25), rule: mix(colors.text, colors.card, 0.88) }
}

/** The dark scheme a light one implies: the ink becomes the card, the page goes darker still, the paper becomes the text. */
function deriveDark(light: EmailColors, given: Partial<EmailColors>): EmailColors {
  const background = given.background ?? mix(light.text, '#000000', 0.6)
  const card = given.card ?? light.text
  const text = given.text ?? light.background
  // A monochrome brand (the accent is the ink) stays monochrome; any other accent keeps its hue and only lightens as far as it needs.
  const accent = given.accent ?? (light.accent.toLowerCase() === light.text.toLowerCase() ? text : lightenOnto(light.accent, card))
  const accentText = given.accentText ?? textOn(accent, card)
  return { background, card, text, accent, accentText }
}

function checked<Key extends string>(group: string, value: Partial<Record<Key, string>> | undefined, keys: readonly Key[], valid: RegExp, expected: string): Partial<Record<Key, string>> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null) throw new TypeError(`[nuxt-backend] setupEmail: theme.${group} must be an object.`)
  for (const key of Object.keys(value)) {
    if (!keys.includes(key as Key)) throw new TypeError(`[nuxt-backend] setupEmail: theme.${group}.${key} is not a key of the theme. It takes ${keys.join(', ')}.`)
  }
  const out: Partial<Record<Key, string>> = {}
  for (const key of keys) {
    const entry = value[key]
    if (entry === undefined) continue
    if (typeof entry !== 'string' || !valid.test(entry.trim())) throw new TypeError(`[nuxt-backend] setupEmail: theme.${group}.${key} must be ${expected}, got ${JSON.stringify(entry)}.`)
    out[key] = entry.trim()
  }
  return out
}

/**
 * The theme in effect: `theme` over the defaults, the dark scheme derived
 * where it is not given. Refuses at setup a key the theme does not have, a
 * color that is not hex and a font stack that holds more than names.
 *
 * @internal
 */
export function resolveEmailTheme(theme: EmailTheme | undefined): ResolvedEmailTheme {
  const given = checked('colors', theme?.colors, COLOR_KEYS, HEX, 'a hex color such as #d500f9')
  const light: EmailColors = { ...DEFAULT_EMAIL_COLORS, ...given }
  const dark = deriveDark(light, checked('dark', theme?.dark, COLOR_KEYS, HEX, 'a hex color such as #e36bff'))
  const fonts = { ...DEFAULT_EMAIL_FONTS, ...checked('fonts', theme?.fonts, FONT_KEYS, STACK, 'a CSS font stack such as \'Helvetica Neue\', Arial, sans-serif') }
  return { colors: scheme(light), dark: scheme(dark), fonts }
}

/**
 * The layout's stylesheet: the dark scheme under `prefers-color-scheme` and,
 * for Outlook.com's dark mode, under its `data-ogsc` and `data-ogsb`
 * attributes. Everything else is inline, so a client that drops the
 * stylesheet still shows the light scheme.
 */
export function layoutStyles({ dark }: ResolvedEmailTheme): string {
  const text = (selector: string, color: string) => `${selector}{color:${color}!important}`
  return ':root{color-scheme:light dark;supported-color-schemes:light dark}'
    + 'body{margin:0;padding:0}'
    + `${DARK_SCHEME_QUERY}{`
    + `.nb-page{background:${dark.background}!important}`
    + `.nb-card{background:${dark.card}!important;border-color:${dark.rule}!important}`
    + text('.nb-ink,.nb-ink a', dark.text)
    + text('.nb-muted,.nb-muted a', dark.muted)
    + text('.nb-accent', dark.accent)
    + `.nb-plate,a.nb-button{background:${dark.accent}!important;color:${dark.accentText}!important}`
    + '}'
    + `${text('[data-ogsc] .nb-ink,[data-ogsc] .nb-ink a', dark.text)}`
    + text('[data-ogsc] .nb-muted', dark.muted)
    + text('[data-ogsc] .nb-accent', dark.accent)
    + `[data-ogsb] .nb-page{background:${dark.background}!important}`
    + `[data-ogsb] .nb-card{background:${dark.card}!important}`
    + `[data-ogsb] .nb-plate,[data-ogsb] a.nb-button{background:${dark.accent}!important}`
    + `[data-ogsc] .nb-plate,[data-ogsc] a.nb-button{color:${dark.accentText}!important}`
}
