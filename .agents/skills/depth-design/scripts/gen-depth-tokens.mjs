#!/usr/bin/env node
/**
 * gen-depth-tokens.mjs — generate a convex/concave depth token scale for one surface.
 *
 * Emits STATIC CSS custom properties (concrete hex, no color-mix) tuned to a single
 * surface colour and light direction. Use it when you can't rely on color-mix(), want
 * a fixed pre-computed scale, need light + dark blocks generated side by side, or want
 * a starting point to hand-tweak. For the runtime, self-adjusting version prefer
 * assets/depth-system.css.
 *
 * Usage:
 *   node gen-depth-tokens.mjs --surface "#e6e6ea"
 *   node gen-depth-tokens.mjs --surface "#26262b" --dark --name panel
 *   node gen-depth-tokens.mjs --surface "#6d7cff" --light top     # colored surface
 *
 * Flags:
 *   --surface <hex>  base surface colour depth sits on           (required)
 *   --name <str>     token prefix                                (default "depth")
 *   --dark           rebalance for a dark surface (bright highlight leads)
 *   --light <dir>    light source: top-left (default) | top | top-right
 */

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const surface = flag('surface');
if (!surface || surface === true) {
  console.error('Error: --surface "#rrggbb" is required. See header for usage.');
  process.exit(1);
}
const name = flag('name', 'depth');
const dark = Boolean(flag('dark', false));
const light = flag('light', 'top-left');

// --- colour helpers --------------------------------------------------------
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
const clamp = (c) => Math.max(0, Math.min(255, Math.round(c)));
const rgbToHex = (rgb) =>
  '#' + rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const lighten = (rgb, t) => mix(rgb, [255, 255, 255], t);
const darken = (rgb, t) => mix(rgb, [0, 0, 0], t);

// --- light direction -> inset offset signs ---------------------------------
// For an inset shadow, a positive offset paints the colour on the TOP/LEFT inner
// edge — so the highlight sits toward the light source, the shadow opposite it.
const DIRECTIONS = {
  'top-left': { x: 1, y: 1 },
  top: { x: 0, y: 1 },
  'top-right': { x: -1, y: 1 },
};
const dir = DIRECTIONS[light] || DIRECTIONS['top-left'];
const px = (n, sign) => `${n * sign || 0}px`;
const insets = (n, blur, highlightColor, shadowColor) =>
  `inset ${px(n, dir.x)} ${px(n, dir.y)} ${blur}px ${highlightColor}, ` +
  `inset ${px(n, -dir.x)} ${px(n, -dir.y)} ${blur}px ${shadowColor}`;

// --- derive highlight / shadow colours from the surface --------------------
const rgb = hexToRgb(surface);
const highlight = rgbToHex(dark ? lighten(rgb, 0.55) : lighten(rgb, 0.62));
const shadow = rgbToHex(dark ? darken(rgb, 0.6) : darken(rgb, 0.24));
// seam: the 1px parting-line border — darker than the face, lighter than the
// cast contact shadow, so it reads as a gap rather than an outline
const seam = rgbToHex(darken(rgb, dark ? 0.45 : 0.3));

// --- build the token block -------------------------------------------------
const steps = [
  ['-tiny', 1, 0],
  ['-xs', 1.5, 2],
  ['', 2, 4],
];
const elevation = dark
  ? [
      '0 1px 2px rgb(0 0 0 / .5)',
      '0 2px 4px rgb(0 0 0 / .5), 0 1px 2px rgb(0 0 0 / .4)',
      '0 4px 8px rgb(0 0 0 / .55), 0 1px 3px rgb(0 0 0 / .4)',
      '0 12px 24px rgb(0 0 0 / .6), 0 4px 8px rgb(0 0 0 / .45)',
      '0 24px 48px rgb(0 0 0 / .7), 0 8px 16px rgb(0 0 0 / .5)',
    ]
  : [
      '0 1px 2px rgb(0 0 0 / .08)',
      '0 2px 4px rgb(0 0 0 / .10), 0 1px 2px rgb(0 0 0 / .06)',
      '0 4px 8px rgb(0 0 0 / .12), 0 1px 3px rgb(0 0 0 / .08)',
      '0 12px 24px rgb(0 0 0 / .16), 0 4px 8px rgb(0 0 0 / .10)',
      '0 24px 48px rgb(0 0 0 / .22), 0 8px 16px rgb(0 0 0 / .12)',
    ];

const out = [];
out.push(`/* depth tokens — surface ${surface}, light ${light}${dark ? ', dark' : ''} */`);
out.push(':root {');
out.push(`  --${name}-surface: ${surface};`);
out.push(`  --${name}-highlight: ${highlight};`);
out.push(`  --${name}-shadow: ${shadow};`);
out.push(`  --${name}-seam: ${seam};`);
for (const [suffix, n, blur] of steps) {
  out.push(`  --${name}-convex${suffix}: ${insets(n, blur, `var(--${name}-highlight)`, `var(--${name}-shadow)`)};`);
  out.push(`  --${name}-concave${suffix}: ${insets(n, blur, `var(--${name}-shadow)`, `var(--${name}-highlight)`)};`);
}
elevation.forEach((e, i) => out.push(`  --${name}-elevation-${i + 1}: ${e};`));
out.push('}');

console.log(out.join('\n'));
