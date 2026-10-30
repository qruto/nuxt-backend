/**
 * The parts the social cards share (components/OgImage/*.takumi.vue): the
 * gunmetal ground and slab, the engraving's relief layers, the LED strip and
 * the house mark, as Takumi draws them. Takumi takes inline styles and inline
 * SVG only, so the values are spelled out here, from the site's dark tokens
 * (assets/css/tokens.css), rather than read from the stylesheet.
 *
 * Fonts stay in the cards' own templates: nuxt-og-image reads each card's
 * file for the families and weights it loads (`font-family` and
 * `font-weight` in a static `style`), so a value bound from here would load
 * nothing.
 */
import type { CSSProperties } from 'vue'

/** The ground under the slab: the top-left ray over a hairline machining grain. */
export const OG_GROUND = {
  position: 'relative',
  display: 'flex',
  width: '1200px',
  height: '630px',
  overflow: 'hidden',
  backgroundColor: '#26292e',
  backgroundImage: 'radial-gradient(1000px 700px at 18% -10%, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02) 42%, rgba(255, 255, 255, 0) 100%), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 1px, rgba(255, 255, 255, 0) 1px, rgba(255, 255, 255, 0) 3px), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 7px)',
} as const

/** The raised slab: a face lighter than the ground, an inset bevel lit from the top-left, and a cast down-right. */
export const OG_SLAB = {
  position: 'absolute',
  left: '48px',
  top: '48px',
  width: '1104px',
  height: '534px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '60px 72px 56px 72px',
  borderRadius: '28px',
  backgroundColor: '#33373e',
  backgroundImage: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0) 45%), linear-gradient(315deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0) 45%), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0px, rgba(255, 255, 255, 0.018) 1px, rgba(255, 255, 255, 0) 1px, rgba(255, 255, 255, 0) 3px)',
  boxShadow: 'inset 1.5px 2.5px 3px rgba(255, 255, 255, 0.07), inset -1.5px -2.5px 3px rgba(0, 0, 0, 0.55), inset 0.5px 1px 1px rgba(255, 255, 255, 0.06), inset -0.5px -1px 1px rgba(0, 0, 0, 0.45), 2px 4px 8px rgba(0, 0, 0, 0.45), 8px 16px 36px rgba(0, 0, 0, 0.45)',
} as const

/** One layer of an engraving: a copy of the text, offset and tinted, under the ink. */
const layer = (left: number, top: number, color: string): CSSProperties =>
  ({ position: 'absolute', left: `${left}px`, top: `${top}px`, width: '100%', display: 'flex', color })

/**
 * Engraved display type (the site's `cut`): two stacked text layers under the
 * ink, the cut's near wall in shade up-left and its far wall lit down-right.
 * Layers rather than a text-shadow: each is a plain copy of the text, so the
 * cut keeps its edges wherever the card is drawn, as the README heroes do.
 */
export const OG_RELIEF: readonly CSSProperties[] = [
  layer(-1, -1.7, 'rgba(0, 0, 0, 0.85)'),
  layer(1.2, 2, 'rgba(255, 255, 255, 0.17)'),
]

/** The same cut for small type (the site's `engr`), half as deep. */
export const OG_RELIEF_SM: readonly CSSProperties[] = [
  layer(-0.5, -0.9, 'rgba(0, 0, 0, 0.8)'),
  layer(0.6, 1, 'rgba(255, 255, 255, 0.14)'),
]

/** The inks the relief carries: `--engrave-ink` and `--engrave-ink-sm` on a raised face, dark. */
export const OG_INK = { display: '#8f939e', small: '#b1b5c0' } as const

/** A lit LED strip in its milled slot, in one of the three signals (never engraved). */
export function ogStrip(signal: 'ok' | 'warn' | 'err', width = 132) {
  const lit = { ok: '74, 222, 128', warn: '250, 204, 21', err: '248, 113, 113' }[signal]
  return {
    slot: { display: 'flex', alignItems: 'center', width: `${width}px`, height: '18px', padding: '0 5px', borderRadius: '9px', backgroundColor: '#1c1e22', boxShadow: 'inset 1px 2px 3px rgba(0, 0, 0, 0.6), inset -1px -1.5px 1.5px rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.05)' },
    light: { display: 'flex', width: `${width - 10}px`, height: '8px', borderRadius: '4px', backgroundColor: `rgb(${lit})`, boxShadow: `0 0 10px rgba(${lit}, 0.55), 0 0 22px rgba(${lit}, 0.28)` },
  }
}

const BARS = [
  { y: 13, glow: '#4ade80', core: '#c4ffd6', opacity: 0.9 },
  { y: 20.5, glow: '#facc15', core: '#ffeaa0', opacity: 0.85 },
  { y: 28, glow: '#f87171', core: '#ffb8b0', opacity: 0.85 },
]

/**
 * The house mark (public/logo-dark.svg) at `size` px, as markup: the plate,
 * its three milled slots and their tritium bars, colours baked in. `id`
 * keeps two marks on one page apart.
 */
export function ogMark(size: number, id = 'mark'): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="${size}" height="${size}">`,
    '<defs>',
    `<linearGradient id="${id}-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3e46"/><stop offset="1" stop-color="#17191d"/></linearGradient>`,
    `<linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.4"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></linearGradient>`,
    `<filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>`,
    '</defs>',
    '<rect x="1" y="1" width="42" height="42" rx="11" fill="#0a0b0d"/>',
    `<rect x="1.5" y="1.5" width="41" height="41" rx="10.5" fill="url(#${id}-face)"/>`,
    `<rect x="1.5" y="1.5" width="41" height="41" rx="10.5" fill="none" stroke="url(#${id}-rim)" stroke-width="1"/>`,
    ...[12, 19.5, 27].map(y => `<rect x="11" y="${y}" width="22" height="5" rx="2.5" fill="#08090a"/>`),
    ...BARS.flatMap(bar => [
      `<rect x="12" y="${bar.y}" width="20" height="3" rx="1.5" fill="${bar.glow}" filter="url(#${id}-glow)" opacity="${bar.opacity}"/>`,
      `<rect x="12" y="${bar.y}" width="20" height="3" rx="1.5" fill="${bar.core}"/>`,
    ]),
    '</svg>',
  ].join('')
}

/**
 * The house mark as an image source a card can draw: the markup above as a
 * data URI, so the card fetches nothing and sets no HTML.
 */
export function ogMarkSrc(size: number): string {
  return `data:image/svg+xml;base64,${btoa(ogMark(size))}`
}

/** Text cut to fit a card: whole, or `max - 1` characters and an ellipsis. */
export function ogClip(text: string | undefined, max: number): string {
  const trimmed = text?.trim() ?? ''
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}
