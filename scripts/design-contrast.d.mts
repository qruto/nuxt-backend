export interface Tokens {
  ramps: Map<string, string>
  root: Map<string, string>
  scopes: Record<string, Map<string, string>>
}

export interface ContrastPair {
  ink: string
  scopes?: string[]
  grounds?: string[]
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

/** The pairs the design relies on: an ink, the scopes it is read in, its bar. */
export declare const PAIRS: ContrastPair[]

/** Every token, per scope. */
export declare function readTokens(): Tokens

/** A token's sRGB hex in one theme and scope, or undefined when it is not a plain colour. */
export declare function resolve(tokens: Tokens, name: string, theme: 'light' | 'dark', scope?: string): string | undefined

/** The WCAG contrast ratio of two sRGB hex colours. */
export declare function contrast(a: string, b: string): number

/** Every measurement: one row per pair and scope, worst ground per theme. */
export declare function measure(tokens?: Tokens): ContrastRow[]

/** The table design.md carries. */
export declare function table(rows?: ContrastRow[]): string

/** design.md with its contrast table regenerated. */
export declare function withTable(markdown: string, rows?: ContrastRow[]): string

/** website/design.md as it is on disk. */
export declare function designDoc(): string
