/** The signals with a wide-gamut tier. */
export declare const SIGNALS: string[]

/** The gamuts a tier is computed for. */
export declare const GAMUTS: Record<'display-p3' | 'rec2020', unknown>

/** `#rrggbb` → OKLCH `[L, C, h]`. */
export declare function hexToOklch(hex: string): [number, number, number]

/** An OKLCH colour's linear channels in a gamut, and its luminance (Y). */
export declare function inGamut(lch: [number, number, number], gamut: 'display-p3' | 'rec2020'): { linear: number[], luminance: number }

/** A signal's tier in OKLCH: same lightness and hue, more chroma. */
export declare function tierLch(hex: string, gamut: 'display-p3' | 'rec2020'): [number, number, number]

/** A signal's tier in a gamut: `color(<gamut> r g b)`. */
export declare function tier(hex: string, gamut: 'display-p3' | 'rec2020'): string

/** The sRGB `light-dark()` pairs tokens.css declares for the signals. */
export declare function srgbPairs(css?: string): Record<string, [string, string]>

/** tokens.css with its generated block rewritten. */
export declare function tokensCss(css?: string): string
