---
name: depth-design
description: >-
  Principles and CSS techniques for creating depth along the Z axis using convex
  (raised) and concave (recessed) surface effects — from barely-there "tiny"
  elevation through to floating layers. Use this whenever building or restyling UI
  that should feel tactile or dimensional: buttons, cards, inputs, toggles, chips,
  panels, wells, keys. Trigger whenever choosing box-shadow / inset shadow / bevel /
  gradient values, or when the words depth, elevation, raised, pressed, inset,
  embossed, engraved, beveled, neumorphic, "soft UI", glass, or drop shadow come up —
  and even when the user just says "make this pop", "add depth", "make it feel 3D or
  tactile", or "it looks flat". Prefer this skill over ad-hoc shadow guessing. Do not
  use it for non-visual senses of these words — "depth" as test coverage or nesting,
  "elevation" as terrain/altitude, "texture" as a data value, "flatten" as simplifying
  an information architecture or Figma/SVG layers — nor for debugging why a shadow
  won't render or is clipped, editing shadows baked into images, or marketing copy
  about a physical product.
---

# Depth design: convex & concave along the Z axis

Depth on a flat screen is an illusion built almost entirely from **one cue: how
light falls on a surface.** The eye reads brightness as shape. A face that is bright
on top and dark on the bottom reads as bulging *toward* you (convex); the reverse
reads as scooped *away* from you (concave). Every tool here — gradients, offsets,
blur, borders, transforms — exists only to sell that single cue convincingly and
consistently.

Get the light logic right and even a 1px shadow looks intentional. Get it wrong —
mix light directions, use pure black on a colored surface, pile on blur — and it
looks cheap no matter how much CSS you add. So this skill is mostly about
*judgment*, with the CSS in service of it.

## The anatomy of a raised element

The light cue is built from **parts, and each part is owned by exactly one CSS
property.** This is the most practical model in the skill: when depth looks wrong,
name the broken part and turn *its* dial — don't stack more shadows onto a face
problem or darken a border to fix a height problem.

| Part | What it encodes | Owned by | The dial |
|------|-----------------|----------|----------|
| **Face** | how domed the surface is | `background` **gradient** | gradient contrast = how convex; its direction = where the light sits |
| **Edges** | how the rim is machined; which rims catch light | `inset` box-shadow / lit border edges | blur `0` = crisp chamfer; more blur = soft round-over |
| **Seam** | the visual **gap** between the control and the surface it's mounted in | **1px darker `border`** | presence and darkness of the parting line |
| **Cast shadow** | height above the page + silhouette softness | outer `box-shadow` | **offset = height; size & blur = edge roundness** and light softness; two layers = real |
| **Setting** | what the control sits in | a wrapper (groove / bezel ring) or overlap | roots the control in the panel instead of floating on it |

Curvature vs elevation — the two classic axes — fall out of this: *face + edges*
make curvature (the surface bulges or dips while staying in the page plane), the
*cast shadow* makes elevation (the whole element floats). A button can be both.
Never make one property do another's job.

Three consequences are worth spelling out, because they're the dials you'll touch
most:

- **The gradient is the convexity.** Inset shadows only light the rims; it's the
  background gradient across the *face* that makes the surface itself read as domed.
  A flat fill with strong edge shadows reads as a flat plate with machined edges;
  add a light→dark gradient (toward the light source) and the same element inflates.
  Gradient contrast is the curvature dial: barely-different endpoints = a gentle
  land; a wide spread = a bulging dome.
- **Shadow geometry is physical.** In the cast shadow, the **offset is the height**
  — how far the object stands off the page — and the **size/blur is the roundness**:
  tight, sharp shadows read as a hard-edged object under crisp light sitting low;
  large, soft blur reads as rounded silhouettes floating higher under diffuse light.
  The same holds inside: an inset edge with blur `0` is a chamfered (hard-cut) edge;
  raising the blur rounds it over into a fillet.
- **The seam sells the object-ness.** A **1px border slightly darker than both the
  face and the page** reads as the parting line — the tiny crack of shadow around a
  physical key mounted in a panel. Without it, a raised element can look painted on;
  with it, the control separates from the surface as its own object. Keep it a
  hairline, derived from the surface color, darker than the face's bottom edge but
  lighter than the cast contact shadow.

All five parts together, on one key:

```css
.key {
  /* face — the gradient IS the convexity (light source: above) */
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--surface), white 10%),
    color-mix(in oklch, var(--surface), black 8%));
  /* seam — 1px parting line separates the key from the panel */
  border: 1px solid color-mix(in oklch, var(--surface), black 30%);
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 var(--highlight),   /* edge — lit top rim */
    0 1px 1px rgb(0 0 0 / .30),       /* cast: contact — pins it at a low height */
    0 3px 6px rgb(0 0 0 / .12);       /* cast: direct — soft, slightly rounded */
}
```

Most elements don't need all five — a quiet chip might be seam + tiny contact
shadow only. But *diagnose* with the full anatomy: flat-looking face? gradient.
Painted-on? seam. Wrong height or too crisp/too pillowy? cast offset/blur. Rim not
catching light? inset edge.

## Convex vs concave

- **Convex** — *raised, extruded, tactile.* Light on the top(-left) edges, shadow on
  the bottom(-right), face gradient light→dark downward. Use for things you act
  **on**: buttons, keys, pills, toggle knobs, primary chips. It invites a press.
- **Concave** — *pressed, inset, carved, a well.* Shadow on the top(-left) edges,
  light on the bottom(-right), face gradient dark→light downward. Use for things
  that **hold** or **receive**: text inputs, search fields, slider tracks, progress
  rails, sunken panels, and the *active/pressed* state of a convex element.
- **Flat/level** — no self-shading. The honest default for most content; spend depth
  only where it earns attention.

Convex and concave are literally the same two inset shadows (and the same gradient)
with their light/dark ends swapped. That symmetry is the whole trick.

### The one rule that matters most: a single light source

Pick **one** light direction for the entire product and never break it. The
conventional choice is top (12 o'clock) or top-left (10–11 o'clock). Every convex
highlight and every face gradient starts on that side; every shadow lands opposite.
The instant two elements disagree about where the light is, the illusion collapses.

Throughout this skill the light source is **top-left**, so a positive inset offset
carries the *highlight* and a negative one carries the *shadow*:

```css
:root {
  --surface: #e8e8ec;                       /* the base plane color */
  --highlight: rgb(255 255 255 / 0.7);      /* highlight = surface, lightened */
  --shadow: rgb(0 0 0 / 0.15);              /* shadow    = surface, darkened  */
}

/* CONVEX — bulges toward you: light top-left, shadow bottom-right */
.convex {
  background: var(--surface);
  border-radius: 12px;
  box-shadow:
    inset  2px  2px 4px var(--highlight),
    inset -2px -2px 4px var(--shadow);
}

/* CONCAVE — carved in: swap the edges. Shadow top-left, light bottom-right */
.concave {
  background: var(--surface);
  border-radius: 12px;
  box-shadow:
    inset  2px  2px 4px var(--shadow),
    inset -2px -2px 4px var(--highlight);
}
```

> In a token system (e.g. Tailwind's `@theme`) expose these as named shadows —
> `--shadow-convex`, `--shadow-concave`, plus size and theme variants — so authors
> apply `shadow-convex` instead of hand-tuning pixels. Consistency beats bespoke.

### Light comes from above: raised & inset *edges*

*Refactoring UI* frames the same idea physically: **light comes from above.** Look
at a raised door panel — its **top edge is lighter** (angled toward the sky) and its
**bottom edge is darker**. That's the only lighting physically possible for a raised
shape, so the brain reads it as raised. An inset panel is the reverse: a shadow at
the top (the lip above blocks the light) and a lit bottom edge.

You don't need full four-sided curvature to use this — a single **lit top edge plus
a tight shadow below** is the cheapest, most reliable raise (the *"shadow under
border"* lever: the lit border is lighter than the shadow beneath it):

```css
/* RAISED — a milled lip catching the light (the go-to TINY elevation) */
.raise {
  box-shadow: inset 0 1px 0 0 var(--highlight),   /* lit top edge */
              0 1px 1px 0 rgb(0 0 0 / .28);        /* tight, SHARP shadow below only */
}
/* INSET — a well: dark lip on top, lit lip on the bottom */
.inset {
  box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / .3),
              inset 0 -1px 0 0 var(--highlight);
}
```

Two details from the book that matter: **pick the highlight color by hand** (a
lightened surface tone) rather than overlaying semi-transparent white — raw white
*sucks the saturation out* of a tint and it stops looking like lit material. And
keep this shadow **sharp**: a couple of pixels of blur, like the shadow under a wall
outlet — remember, blur is the roundness dial, and a low crisp lip has almost none.

## The Z scale: from *tiny* to floating

"Depth" is not one setting; it's a **small, fixed ladder** of steps you apply
consistently. Subtle steps are the workhorses — reach for the tiny end far more
often than the loud end. Bigger offset = higher; bigger blur = softer and rounder;
higher opacity = louder.

| Step | Read | Curvature (inset) | Elevation (outer) | Use for |
|------|------|-------------------|-------------------|---------|
| **0 — flat** | in the plane | none | none | body content, most surfaces |
| **1 — tiny / hairline** | a seam, barely lifted | `inset 1px 1px 0` highlight + `inset -1px -1px 0` shadow, or a single `0 1px 0` edge | — | dividers, list rows, quiet chips |
| **2 — xs / low** | gently tactile | 1.5–2px insets, 0–3px blur | `0 1px 2px /.08` | small buttons, tags, switches |
| **3 — sm/md** | clearly raised | 2–3px insets, 4px blur | `0 4px 8px /.12, 0 1px 2px /.08` | cards, primary buttons |
| **4 — high** | floating | (usually flat surface) | layered, `0 12px 32px /.18, 0 4px 8px /.10` | menus, popovers, modals, toasts |

"Tiny or not elevated" lives at steps **1–2**: 1–2px offsets, little or no blur,
low-opacity edge colors. It *separates* an element from its background without
making it hover. That restraint is the point — most good interfaces are mostly
flat, with depth used sparingly to signal what's interactive or layered.

Three things make an elevation scale feel real:

- **Think position, not shadow.** Don't pick a shadow — decide where on the Z axis
  the element sits (a button is barely up; a dropdown is higher; a modal is highest)
  and assign the matching step. Closer-to-the-user elements pull more focus, so
  elevation *is* hierarchy.
- **Use two-part shadows.** A convincing cast shadow is two layers: a larger, softer
  one (the direct-light shadow) plus a tighter, darker one right at the edges (the
  ambient-occlusion contact shadow). Fade the tight contact shadow out as things
  rise — it's distinct at low elevation and nearly gone up high. See
  [css-recipes.md §2](references/css-recipes.md).
- **Fix the scale at ~5 steps** and reuse it everywhere; consistency reads as
  intentional. On press, drop an element *down* the scale (smaller/no shadow) so it
  feels pushed into the page.

## Make it look real: color the light, and make it *clear* the surface

Two things have to be true of the highlight and shadow — the right **hue** and
enough **contrast**. Direction alone is not enough.

**Hue.** Shadows are not pure black and highlights are not pure white; they are the
surface color pushed darker or lighter. Pure `#000`/`#fff` at low opacity reads as
grey haze, not light. Derive both from the surface:
`color-mix(in oklch, var(--surface), black 18%)` for the shadow and `… white 60%)`
for the highlight. On a **colored** surface this keeps the shadow tinted toward the
hue instead of muddy grey.

**Contrast — the effect reads only as strongly as the light differs from the
surface.** This is the one most people get wrong. If the highlight is only a hair
brighter than the surface it sits on, the eye has nothing to catch and the thing
looks flat no matter how many shadows you stack. There must be a *reasonable,
perceptible* color gap between the simulated light and the background it falls on.
Think of a convex/concave surface's strength as the **spread** between its highlight
and its shadow: widen the spread to push depth, narrow it to calm it down. The same
applies to the face gradient — its endpoint spread is the curvature strength.

Crucially this gap is surface-dependent, and it's *why dark mode looks different*:

- On a **light** surface there's lots of headroom to go darker, so the **shadow**
  opens the gap; the highlight can stay gentle.
- On a **dark** surface there's almost no headroom below, so the **highlight** must
  open the gap — a crisp, clearly brighter top-left edge is what sells "raised." A
  timid highlight (white at ~8–12%) on a dark surface reads as nothing; give it a
  real luminance jump (often 20–100%). This is exactly the bright-edge-on-dark look.

Treat opacity as a means to a *visible gap*, not a fixed number — rough starting
ranges: ~5–15% for tiny, ~15–30% for raised, up to ~50%+ for strong sunken effects
or bright dark-mode edges. Then trust your eye: if you can't clearly see the curve
against that surface, widen the spread.

**The hard-edge look** takes contrast to its logical end: blur `0` and
near-full-opacity black *and* white on 1–2px edges, for a crisp "molded plastic /
pixel-art / retro hardware" feel. It's deliberate and graphic rather than photoreal
— a valid choice, just commit to it consistently rather than mixing it with soft
shadows.

## Two dialects, one grammar

The same anatomy produces two very different aesthetics — pick one per product and
commit:

- **Machined-dark** (metal / hardware): dark surfaces, crisp bright top edges, tight
  low-blur shadows, hairline seams, faint texture, maybe one accent glow. Lives in
  [assets/depth-playground.html](assets/depth-playground.html) and
  [assets/DESIGN.md](assets/DESIGN.md).
- **Soft-light** (soft UI / neumorphic): pale low-saturation surfaces, shadow-led
  depth in a surface-tinted hue, generous blur (rounded, pillowy silhouettes),
  gradient faces doing much of the work. Lives in
  [assets/soft-ui-buttons.html](assets/soft-ui-buttons.html) — floating, cushion,
  seated-in-a-groove, and tiny-lift treatments.

Same rules in both: one light source, surface-derived colors, a visible contrast
gap, press-sinks. What changes is which part of the anatomy leads — dark leans on
edges and seams; soft-light leans on faces and cast blur.

## Dark mode: same light, rebalanced

Keep the light direction identical; only shift *which edge does the work*.

- **Light theme** leads with the **shadow** (there's plenty of headroom to go darker
  than the surface).
- **Dark theme** leads with the **highlight** (little room to go darker, so a crisp
  bright top-left edge is what sells "raised"), and the shadow softens.

Provide per-theme values rather than reusing one shadow for both:

```css
@media (prefers-color-scheme: dark) {
  :root { --surface: #26262b; }
  .convex {                                   /* highlight now carries the shape */
    box-shadow:
      inset  2px  2px 3px rgb(255 255 255 / 0.28),  /* bright enough to clear the dark surface */
      inset -2px -2px 4px rgb(0 0 0 / 0.55);
  }
}
```

## Interaction: state = movement along Z

The most satisfying feedback isn't a color change, it's a change in depth. A resting
**convex** control becomes **concave** when pressed — it visibly sinks into the
surface.

```css
.button {
  box-shadow: inset 2px 2px 4px var(--highlight), inset -2px -2px 4px var(--shadow);
  transition: box-shadow .16s ease, transform .16s ease;   /* the morph animates */
}
.button:active {
  box-shadow: inset 2px 2px 4px var(--shadow), inset -2px -2px 4px var(--highlight);
  transform: translateY(1px);   /* nudge down to complete the "push" */
}
```

**You can animate the convex↔concave change.** `box-shadow` interpolates layer by
layer, so as long as both states have the *same number of shadow layers* (here, two
insets → two insets) the browser tweens smoothly between raised and pressed. One
catch: gradient *backgrounds* don't transition natively — to animate a gradient face
you register the moving part with `@property`. Both techniques, plus the
compositor-cheap pseudo-element cross-fade for large or scroll-time changes, are in
[references/css-recipes.md](references/css-recipes.md#9-animating-depth-and-gradients).

Inputs default concave (a well you type into); hovering a card can raise its
elevation a step; dragging lifts it highest then drops it back. Let the Z position
tell the interaction story.

## The depth toolkit — the levers

These are the independent levers you pull to build depth. The anatomy above tells
you *which* to reach for; full copy-paste recipes for each are in
[references/css-recipes.md](references/css-recipes.md).

| Lever | Depth job | Reach for it when |
|-------|-----------|-------------------|
| **Shadows — inset** (a light + a dark) | edge lighting → convex / concave curvature | the core move — almost every tactile surface |
| **Shadows — outer, layered/two-part** | elevation; offset = height, blur = roundness | lifting an element above the page (cards → modals) |
| **Shadow under border** (border lighter than shadow) | tiny raised lip (light from above) | the cheapest, most reliable *tiny* elevation |
| **Seam** (1px darker border) | the visual gap between control and surface | any solid control that should read as a mounted object |
| **Gradients** (`linear`/`radial`) | the *face* — surface convexity / dome / orb | making the surface itself bulge; knobs, status dots |
| **Lighter / darker colors** | flat-friendly depth (lighter = closer, darker = inset) | flat designs, or reinforcing any shadow with tone |
| **Gradient border** (masked) | beveled edge — light top → dark bottom | a crisp lit rim on cards/controls at any radius |
| **Gradient text** (`background-clip: text`) | dimensional / embossed type | one hero word or numeric readout, not body copy |
| **Glows** (colored outer shadow) | light *emission* — pulls toward the viewer | marking the one live/primary/focused element |
| **Perspective** (`perspective`, `rotateX/Y`) | literal geometric Z | tilt-on-hover cards, parallax, hero moments |
| **Overlap elements** | layers — one element crosses a boundary | cards over section seams; carousel controls |
| **Texture** (grain / brushed lines) | material depth on a surface | metal/paper feel — kept faint, never the first thing seen |
| **Glass** (`backdrop-filter: blur`) | depth by separation from blurred content | frosted overlays floating over content |

Two supporting utilities you'll use constantly: `color-mix()` / relative color to
derive highlight, shadow, and seam from the surface (so depth stays consistent
across themes and hues), and `filter: drop-shadow()` for cast shadows that follow a
non-rectangular alpha shape (icons, SVGs).

**Overlap and "invisible borders."** Overlapping is one of the strongest depth cues
and needs no shadows at all: offset a card so it crosses the boundary between two
backgrounds, or make an element taller than its parent so it laps both edges. When
overlapping images that would clash, give each an *invisible border* the color of
the background so there's always a clean gap — the layered look without the mess.

## The rule set

1. **One light source, always.** Default top-left. Every face gradient, edge
   highlight, and shadow agrees; no exceptions.
2. **One property, one job.** The gradient shapes the *face*; inset shadows light
   the *edges*; the 1px darker border cuts the *seam*; outer shadows set the
   *height*. When depth looks wrong, fix the responsible part — don't stack more
   shadows.
3. **Offset is height, blur is roundness.** A tight sharp shadow = a hard-edged
   object sitting low; big soft blur = a rounded object floating high. Inside, blur
   `0` is a chamfer, more blur is a fillet. Never use big blur on a low element.
4. **Cut the seam.** Give solid controls a hairline border slightly darker than both
   face and page — the parting line that separates the object from the surface.
   Derive it from the surface color; keep it 1px.
5. **Match elevation to meaning.** Higher Z = more interactive, more important, or
   more transient. Popovers and modals sit highest; resting content stays low.
6. **Stay subtle by default.** Small offsets, small/zero blur, low opacity. Reserve
   big soft shadows for things that genuinely float. Most of the UI should be flat.
7. **Color from the surface, not from black/white** — unless you're deliberately
   going for the hard-edge graphic look, in which case commit to it everywhere.
8. **Give the light a real gap.** Depth reads only as strongly as the highlight,
   shadow, and gradient endpoints differ from the surface they sit on. A
   correct-but-timid edge looks flat — widen the spread until the curve is clearly
   visible against *that* surface. On dark surfaces this means a genuinely bright
   highlight, not white at 10%.
9. **Convex for actionable, concave for receptacles.** Buttons/keys/knobs bulge;
   inputs/tracks/wells/pressed-states sink.
10. **Press = move down the Z axis.** Convex → concave (and/or `translateY(1px)`)
    on `:active`. Never signal a press with color alone.
11. **Rebalance for dark mode, don't recolor direction.** Light theme leads with
    shadow; dark theme leads with highlight; light direction stays fixed.
12. **Harmonize radius and softness.** Rounder corners read more convex; sharp
    corners read flatter. Match shadow blur to the border-radius.
13. **Animate `opacity`/`transform` for anything large or scroll-time.** Direct
    `box-shadow` transitions are fine for a single control's press; cross-fade a
    shadow-bearing pseudo-element for everything else, and honor
    `prefers-reduced-motion`.
14. **Depth is never the only signal.** Keep text/contrast affordances so the UI
    still works for anyone who doesn't perceive the shading. Consistency of a small
    depth scale beats pixel-perfect physics applied ad hoc.

## How to apply this

1. **Decide the job.** Is this element *raised* (act on it → convex), a *receptacle*
   (put things in it → concave), or *floating above* (menu/modal → elevation)? Many
   elements are simply flat — that's fine.
2. **Pick a Z step** from the ladder (1–2 for subtle, 3+ only when it should hover).
3. **Build by anatomy.** Face gradient for convexity → lit/shaded inset edges → 1px
   seam → cast shadow at the chosen height (offset) and roundness (blur) → a setting
   (groove/ring/overlap) if it should feel mounted.
4. **Reach for the ready-made system first.** Copy
   [assets/depth-system.css](assets/depth-system.css) into the project, set
   `--depth-surface`, and apply classes like `depth-convex`, `depth-press`,
   `depth-seam`, `depth-elevation-3`. It already derives light/dark and keeps a
   visible contrast gap. Only hand-tune when the system doesn't cover the case.
5. **Wire the state.** If it's pressable, use `depth-press` (or the convex→concave
   `:active` swap) so a press moves it down the Z axis.
6. **Check the whole screen together.** Every highlight and gradient agrees on the
   light direction, and the depths form a clear hierarchy, not noise.

## What's in this skill

Progressive detail — pull these in as the task needs them:

- **[assets/depth-system.css](assets/depth-system.css)** — the drop-in. A complete
  depth layer driven by one `--depth-surface` knob (+ `--depth-accent`):
  convex/concave, an elevation ladder, and every lever — `.depth-raise`/`.depth-inset`
  (light-from-above edges), `.depth-seam`, `.depth-solid`, `.depth-glow`,
  `.depth-gradient-border`, `.depth-gradient-text`, `.depth-texture`, and an animated
  `.depth-press`. Light/dark handled. **Prefer this over hand-writing shadows.**
- **[assets/DESIGN.md](assets/DESIGN.md)** — a design.md standard file (Google Labs
  format: YAML tokens + prose) encoding a complete depth language, richest in its
  **Elevation & Depth** section. Drop it at a project root so coding agents inherit
  consistent depth. The example instantiates a "Titanium EDC" system — retheme the
  tokens for your brand, keep the depth rules.
- **[assets/depth-playground.html](assets/depth-playground.html)** — the interactive
  machined-dark reference: the anatomy build-up (one part per tile), convex/concave/raise/inset, the contrast-gap comparison,
  the two-part elevation ladder, live controls, and the levers (perspective tilt,
  overlap, gradient border/text, glow, texture, glass) in light and dark.
- **[assets/soft-ui-buttons.html](assets/soft-ui-buttons.html)** — the soft-light
  dialect specimen, pure HTML/CSS: floating, cushion (convex pillow face), seated
  (raised ring, face in a groove), and tiny-lift button treatments, each with a
  press-sinks `:active` state.
- **[assets/design-spec.html](assets/design-spec.html)** — the DESIGN.md rendered as
  a standalone HTML/CSS spec sheet (ramp, type, elevation ladder, curvature
  specimens, components, principles), light + dark via `prefers-color-scheme`.
- **[scripts/gen-depth-tokens.mjs](scripts/gen-depth-tokens.mjs)** — generate a
  static, per-surface token scale when you can't use `color-mix()` or want concrete
  fallback values:
  `node scripts/gen-depth-tokens.mjs --surface "#e6e6ea" [--dark] [--light top]`.
- **[references/css-recipes.md](references/css-recipes.md)** — the full copy-paste
  catalog (two-part elevation, gradient faces & borders, seam, full anatomy,
  gradient text, glow, texture, overlap, radial dome, bevel, glass, animating depth
  & gradients, 3D transforms, embossed type, deriving colors).
