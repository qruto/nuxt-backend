export interface Tokens {
  ramps: Map<string, string>
  root: Map<string, string>
  scopes: Record<string, Map<string, string>>
  /** The wide-gamut block: tokens re-declared under `@media (color-gamut: p3)`. */
  p3: Map<string, string>
  /** The properties app.css declares on `:root` (the Nuxt UI bridges among them). */
  bridges: Map<string, string>
  /** The `cut` part's floor colour, as depth.css declares it. */
  floor: string
}

/** A resolved colour: sRGB or Display P3 channels in 0–1, and its alpha. */
export interface Colour {
  space: 'srgb' | 'display-p3'
  rgb: [number, number, number]
  alpha: number
}

export interface ContrastPair {
  ink: string
  scopes?: string[]
  grounds?: Array<string | { base: string, layers: string[] }>
  /** Layers that lie over the text as well as its ground. */
  overlay?: string[]
  min: number
  note?: string
}

export interface ContrastRow {
  ink: string
  on: string
  light: number
  dark: number
  min: number
  note: string
}

/** The pairs the design relies on: an ink, the scopes or grounds it is read on, its bar. */
export declare const PAIRS: ContrastPair[]

/** The `cut` part's lighter floor, named as an ink (see {@link inkColor}). */
export declare const FLOOR: string

/** Every token, per scope. */
export declare function readTokens(): Tokens

/** A token's sRGB hex in one theme and scope, or undefined when it is not an opaque sRGB colour. */
export declare function resolve(tokens: Tokens, name: string, theme: 'light' | 'dark', scope?: string): string | undefined

/** A token's colour in one theme and scope; `p3` reads the wide-gamut block first. */
export declare function resolveColor(tokens: Tokens, name: string, theme: 'light' | 'dark', scope?: string, gamut?: 'srgb' | 'p3'): Colour

/** An ink's colour: a token, or the `cut` floor ({@link FLOOR}). */
export declare function inkColor(tokens: Tokens, ink: string, theme: 'light' | 'dark', scope?: string, gamut?: 'srgb' | 'p3'): Colour

/** The WCAG contrast ratio of two colours: sRGB hex strings or resolved colours. */
export declare function contrast(a: string | Colour, b: string | Colour): number

/** Every measurement: one row per pair and scope, worst ground per theme. */
export declare function measure(tokens?: Tokens): ContrastRow[]

/** The table design.md carries. */
export declare function table(rows?: ContrastRow[]): string

/**
 * The `:root` properties that read a per-ground ink, directly or through
 * another, without a re-declaration in every per-ground block: each scope one
 * is missing from.
 */
export declare function unscopedBridges(tokens?: Tokens): Array<{ property: string, scope: string }>

/** design.md with its contrast table regenerated. */
export declare function withTable(markdown: string, rows?: ContrastRow[]): string

/** website/design.md as it is on disk. */
export declare function designDoc(): string
