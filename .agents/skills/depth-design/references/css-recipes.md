# Depth recipes — copy-paste CSS

Every recipe assumes a **top-left light source** (positive offset = highlight,
negative offset = shadow) and a `--surface` custom property. Adjust offset, blur, and
opacity to move up or down the Z ladder; the *direction* logic never changes.

## Table of contents

1. [Convex & concave (the core)](#1-convex--concave-the-core)
2. [Elevation — layered outer shadows](#2-elevation--layered-outer-shadows)
3. [Gradient surface faces](#3-gradient-surface-faces)
4. [Radial dome / orb / knob](#4-radial-dome--orb--knob)
5. [Bevel with border edges](#5-bevel-with-border-edges)
6. [Shape-aware cast shadow (`drop-shadow`)](#6-shape-aware-cast-shadow-drop-shadow)
7. [Glass depth (`backdrop-filter`)](#7-glass-depth-backdrop-filter)
8. [Specular sheen with a pseudo-element](#8-specular-sheen-with-a-pseudo-element)
9. [Animating depth (and gradients)](#9-animating-depth-and-gradients)
10. [Real 3D transforms](#10-real-3d-transforms)
11. [Embossed & engraved type](#11-embossed--engraved-type)
12. [Deriving colors from the surface](#12-deriving-colors-from-the-surface)
13. [Light-from-above edges: raised & inset](#13-light-from-above-edges-raised--inset)
14. [Solid shadow (flat depth)](#14-solid-shadow-flat-depth)
15. [Gradient border (masked bevel)](#15-gradient-border-masked-bevel)
16. [Gradient text](#16-gradient-text)
17. [Glow (light emission)](#17-glow-light-emission)
18. [Texture (brushed metal / grain)](#18-texture-brushed-metal--grain)
19. [Overlap & invisible borders](#19-overlap--invisible-borders)
20. [Seam — the 1px parting line](#20-seam--the-1px-parting-line)
21. [Full anatomy — a complete raised control](#21-full-anatomy--a-complete-raised-control)

---

## 1. Convex & concave (the core)

The two building blocks. Swap the light/dark edges to flip between them.

```css
.convex {                       /* raised: light top-left, shadow bottom-right */
  background: var(--surface);
  border-radius: 14px;
  box-shadow:
    inset  2px  2px 4px rgb(255 255 255 / 0.70),
    inset -2px -2px 4px rgb(0 0 0 / 0.15);
}
.concave {                      /* sunken: shadow top-left, light bottom-right */
  background: var(--surface);
  border-radius: 14px;
  box-shadow:
    inset  2px  2px 4px rgb(0 0 0 / 0.15),
    inset -2px -2px 4px rgb(255 255 255 / 0.70);
}
```

**Tiny variant** (step 1 — a seam, not a lift): drop blur to `0` and offsets to `1px`.

```css
.convex-tiny {
  box-shadow:
    inset  1px  1px 0 rgb(255 255 255 / 0.5),
    inset -1px -1px 0 rgb(0 0 0 / 0.12);
}
```

**Full neumorphism** = a convex/concave surface *plus* a matching outer shadow, on a
surface the same color as its parent, so the element looks pushed out of / into one
continuous material:

```css
.neumorphic {
  background: var(--surface);
  box-shadow:
    8px 8px 16px rgb(0 0 0 / 0.15),          /* outer shadow, bottom-right */
    -8px -8px 16px rgb(255 255 255 / 0.7);   /* outer light, top-left */
}
```

---

## 2. Elevation — layered outer shadows

One shadow looks flat; real cast shadows are *two or more* stacked — a tight, darker
contact shadow plus a wider, softer ambient one. Opacity drops as blur grows.

```css
--elevation-1: 0 1px 2px rgb(0 0 0 / 0.08);
--elevation-2: 0 2px 4px rgb(0 0 0 / 0.10), 0 1px 2px rgb(0 0 0 / 0.06);
--elevation-3: 0 4px 8px rgb(0 0 0 / 0.12), 0 1px 3px rgb(0 0 0 / 0.08);
--elevation-4: 0 12px 24px rgb(0 0 0 / 0.16), 0 4px 8px rgb(0 0 0 / 0.10);
--elevation-5: 0 24px 48px rgb(0 0 0 / 0.22), 0 8px 16px rgb(0 0 0 / 0.12);
```

Vertical offset should slightly exceed nothing but stay smaller than the blur — a
shadow that's offset more than it's blurred looks like a hard sticker, not a lift.

The two numbers carry physical meaning — use them deliberately:

- **Offset = height.** How far the shadow drops below the element is how high the
  element reads off the page.
- **Size/blur = roundness.** Tight, sharp blur = a hard-edged object under crisp
  light, sitting low. Large, soft blur = a rounded, pillowy silhouette floating
  higher under diffuse light. Choose the blur to match how "machined" vs "soft" the
  object should feel — and keep it near zero for anything at tiny elevation.

---

## 3. Gradient surface faces

A subtle background gradient makes the *face* of a surface look curved, reinforcing
the inset edges. Light-to-dark top-to-bottom = convex; dark-to-light = concave. Keep
the endpoints close in lightness or it reads as a painted stripe.

```css
.convex-face {
  background: linear-gradient(to bottom,
    color-mix(in oklch, var(--surface), white 8%),
    color-mix(in oklch, var(--surface), black 8%));
}
.concave-face {
  background: linear-gradient(to bottom,
    color-mix(in oklch, var(--surface), black 8%),
    color-mix(in oklch, var(--surface), white 8%));
}
```

---

## 4. Radial dome / orb / knob

For round elements, a radial gradient with the highlight offset **toward** the light
source makes a sphere. Add an outer shadow to seat it.

```css
.orb {
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%,
    color-mix(in oklch, var(--surface), white 45%) 0%,
    var(--surface) 45%,
    color-mix(in oklch, var(--surface), black 25%) 100%);
  box-shadow: 0 4px 8px rgb(0 0 0 / 0.25);
}
```

The highlight position (`35% 30%`) must match your global light direction.

---

## 5. Bevel with border edges

A crisp, blur-free lip — cheaper than a shadow and pixel-sharp. Good for the hard-edge
graphic style.

```css
.bevel {
  border-top:    1px solid rgb(255 255 255 / 0.6);   /* lit edge */
  border-left:   1px solid rgb(255 255 255 / 0.35);
  border-bottom: 1px solid rgb(0 0 0 / 0.25);         /* shadowed edge */
  border-right:  1px solid rgb(0 0 0 / 0.15);
}
```

---

## 6. Shape-aware cast shadow (`drop-shadow`)

`box-shadow` traces the border-box; `filter: drop-shadow()` traces the actual alpha
outline. Use it for icons, SVGs, images with transparency, and clipped shapes.

```css
.icon { filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35)); }
```

Chain two for a softer, layered cast: `drop-shadow(...) drop-shadow(...)`.

---

## 7. Glass depth (`backdrop-filter`)

Depth by *separation*: blur whatever is behind the element so it clearly floats in
front. Pair with a faint border and a top inner highlight so the pane has an edge.

```css
.glass {
  background: rgb(255 255 255 / 0.10);
  backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgb(255 255 255 / 0.18);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.25),   /* top sheen */
    0 8px 24px rgb(0 0 0 / 0.20);            /* cast shadow */
}
```

Always provide a fallback background for browsers without `backdrop-filter`, and test
over busy backgrounds for contrast.

---

## 8. Specular sheen with a pseudo-element

A thin bright line along the top edge reads as a highlight catching the light — extra
tactility on buttons and cards.

```css
.sheen { position: relative; overflow: hidden; }
.sheen::before {
  content: "";
  position: absolute; inset: 0 0 auto 0; height: 40%;
  background: linear-gradient(to bottom, rgb(255 255 255 / 0.35), transparent);
  pointer-events: none;
}
```

---

## 9. Animating depth (and gradients)

Three techniques, in order of when to reach for them.

**A — Transition `box-shadow` directly (the convex ↔ concave morph).** `box-shadow` *is*
animatable, and CSS interpolates it **layer by layer** — so as long as the two states
have the **same number of shadow layers**, the browser smoothly morphs between them.
Both convex and concave are two inset layers, so a press animates for free:

```css
.press {
  box-shadow: inset 2px 2px 4px var(--highlight), inset -2px -2px 4px var(--shadow);   /* convex */
  transition: box-shadow .16s ease, transform .16s ease;
}
.press:active {
  box-shadow: inset 2px 2px 4px var(--shadow), inset -2px -2px 4px var(--highlight);   /* concave */
  transform: translateY(1px);
}
```

Caveat: if the layer counts differ (e.g. two shadows → three), it *snaps* instead of
tweening. Keep both states structurally identical and only vary offsets/colours. This
repaints each frame, which is fine for a single control on `:active`/`:hover`; avoid it
on many elements animating during scroll.

**B — Cross-fade a pseudo-element (compositor-cheap, for big or scroll-time changes).**
Put the "raised" shadow on `::after` and animate its **opacity** — opacity is
GPU-composited, so it never repaints the shadow:

```css
.card { position: relative; box-shadow: var(--elevation-1); }
.card::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: var(--elevation-4); opacity: 0;
  transition: opacity 180ms ease; pointer-events: none;
}
.card:hover::after { opacity: 1; }   /* lifts on hover without repainting shadows */
```

**C — Animating gradient *faces* needs `@property`.** Unlike `box-shadow`, gradient
backgrounds do **not** transition natively — `background-image` is not an interpolatable
property, so changing gradient stops or angle snaps. Register the moving part as a
typed custom property and CSS can tween it:

```css
@property --gradient-angle { syntax: "<angle>"; inherits: false; initial-value: 120deg; }

.surface {
  background: linear-gradient(var(--gradient-angle),
    color-mix(in oklch, var(--surface), white 12%),
    color-mix(in oklch, var(--surface), black 14%));
  transition: --gradient-angle .6s ease;          /* now the gradient rotates smoothly */
}
.surface:hover { --gradient-angle: 300deg; }
```

The same trick works for animating a gradient's colour stops (register them as
`<color>`) or a radial highlight's position (register `<percentage>` / `<length>`),
letting a "light" appear to sweep across a convex face. Where `@property` isn't
available, cross-fade two stacked gradient layers with opacity (technique B).

```css
@media (prefers-reduced-motion: reduce) {
  .press, .card::after, .surface { transition: none; }
}
```

Always include the reduced-motion guard — depth cues should never *require* motion.

---

## 10. Real 3D transforms

When you want geometric depth (tilt, parallax) rather than painted shading, use a
perspective context and translate/rotate on Z.

```css
.scene { perspective: 800px; }
.tilt {
  transform: rotateX(6deg) rotateY(-6deg) translateZ(20px);
  transform-style: preserve-3d;
  transition: transform 200ms ease;
}
.tilt:hover { transform: rotateX(0) rotateY(0) translateZ(40px); }
```

Heavier than shadows and easy to overdo — reserve for hero moments, and pair with a
cast shadow that shifts opposite the tilt so the lighting still agrees.

---

## 11. Embossed & engraved type

Convex/concave applies to text too. A light shadow *below* the glyphs reads as text
pressed **into** the surface (engraved); a dark shadow below reads as text standing
**out** (embossed). Works best on mid-tone surfaces, not on high-contrast text.

```css
.engraved { color: color-mix(in oklch, var(--surface), black 35%);
            text-shadow: 0 1px 0 rgb(255 255 255 / 0.6); }
.embossed { color: color-mix(in oklch, var(--surface), black 20%);
            text-shadow: 0 -1px 0 rgb(0 0 0 / 0.4), 0 1px 0 rgb(255 255 255 / 0.5); }
```

---

## 12. Deriving colors from the surface

Hard-coding highlight/shadow colors breaks the moment the surface hue or theme
changes. Derive them so one definition works everywhere:

```css
.depth {
  --highlight: color-mix(in oklch, var(--surface), white 55%);
  --shadow: color-mix(in oklch, var(--surface), black 20%);
  box-shadow: inset 2px 2px 4px var(--highlight), inset -2px -2px 4px var(--shadow);
}
```

On a blue surface the shadow stays a deep blue and the highlight a pale blue — the
material feels lit rather than smudged with grey. This is what keeps a depth system
coherent across light mode, dark mode, and accent-colored surfaces.

---

## 13. Light-from-above edges: raised & inset

The most reliable *tiny* elevation (Refactoring UI). A raised element has a lit top
edge and a tight, sharp shadow directly below — the border is lighter than the shadow
beneath it. Pick the highlight color by hand (a lightened surface tone); raw
semi-transparent white desaturates a tint.

```css
.raise {                              /* a milled lip catching the light */
  background: var(--surface);
  box-shadow:
    inset 0 1px 0 0 var(--highlight),        /* lit top edge */
    0 1px 1px 0 rgb(0 0 0 / .28);     /* tight, sharp shadow BELOW only */
  transition: box-shadow .16s, transform .12s;
}
.raise:active {                       /* press: drop the shadow, nudge down */
  box-shadow: inset 0 1px 0 0 var(--highlight);
  transform: translateY(1px);
}
.inset {                              /* a well / recessed input */
  box-shadow:
    inset 0 1px 2px 0 rgb(0 0 0 / .30),  /* lip above blocks the light */
    inset 0 -1px 0 0 var(--highlight);           /* lit bottom lip */
}
```

Keep the blur to ~1–2px. These edges should be crisp, like the shadow under a wall
outlet — big blur on a low element reads as fake.

## 14. Solid shadow (flat depth)

Depth without abandoning a flat aesthetic: a short, vertically-offset shadow with **no
blur**. Reads as a card standing slightly off the page.

```css
.solid { box-shadow: 0 2px 0 0 color-mix(in oklch, var(--surface), black 18%); }
```

Also works as color-only depth: an element *lighter* than its background reads as
raised, *darker* reads as inset — no shadow required.

## 15. Gradient border (masked bevel)

A 1px rim that's light on top and dark on the bottom = a beveled, lit edge at any
border-radius. The mask trick paints only the padding ring.

```css
.gborder { position: relative; background: var(--surface); border-radius: 12px; }
.gborder::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--surface), white 55%),
    color-mix(in oklch, var(--surface), black 30%));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;   /* punch out the center */
  pointer-events: none;
}
```

Swap the gradient for `var(--accent) → darker` to get an accent-lit rim. Animate the
gradient angle with `@property` (recipe 9) for a sweeping-light border.

## 16. Gradient text

Top-lit → bottom-shadowed glyphs read as dimensional/embossed. Use on one hero word or
a numeric readout — never body copy (it costs legibility).

```css
.gtext {
  background: linear-gradient(180deg,
    color-mix(in oklch, currentColor, white 35%),
    color-mix(in oklch, currentColor, black 28%));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
```

## 17. Glow (light emission)

A colored outer shadow with no offset = the element emits light, which pulls it toward
the viewer. Reserve it for the one live/primary/focused element. Two layers — a crisp
ring plus a soft bloom — read best.

```css
.glow {
  --accent: #ff5c1a;
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--accent), transparent 45%),   /* ring */
    0 0 14px 0 color-mix(in oklch, var(--accent), transparent 55%);  /* bloom */
}
```

Great as a focus ring (`:focus-visible`) and for toggle knobs in the "on" state.

## 18. Texture (brushed metal / grain)

Fine surface grain adds material depth. Keep it a whisper — if you notice the lines
before the layout, it's too strong. Brushed lines via repeating gradients (cheap) or
grain via an inline SVG `feTurbulence` noise (richer).

```css
.brushed { position: relative; overflow: hidden; }
.brushed::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  opacity: .5; mix-blend-mode: overlay;
  background:
    repeating-linear-gradient(90deg, rgb(255 255 255 / .05) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgb(0 0 0 / .05) 0 1px, transparent 1px 2px);
}
/* grain: background-image:url("data:image/svg+xml,...feTurbulence baseFrequency='0.8'...") */
```

## 19. Overlap & invisible borders

The strongest depth cue that uses no shadow at all: let one element cross a boundary so
the design reads as layered.

```css
.seam { position: relative; background: linear-gradient(180deg, var(--accent) 0 45%, var(--surface) 45%); }
.seam .card {
  position: absolute; top: 45%; translate: 0 -50%;   /* straddles the seam */
  box-shadow: var(--elevation-3);
}
```

- Make an element taller than its parent so it laps both edges.
- When overlapping images that would clash, give each an **invisible border** the color
  of the background (`border: 4px solid var(--background)`) so there's always a clean gap —
  layered look, no muddy collision.

---

## 20. Seam — the 1px parting line

A hairline border slightly **darker than both the face and the page** reads as the
crack of shadow around a physical control mounted in a panel — it visually separates
the object from the surface. Without it a raised element can look painted on; with it,
it becomes a thing. Derive it from the surface so it survives theming:

```css
.seam {
  border: 1px solid color-mix(in oklch, var(--surface), black 30%);
}
```

Calibration: darker than the face's bottom gradient stop, lighter than the cast
contact shadow — it's a gap, not an outline. Keep it 1px; thicker reads as a drawn
stroke. Check it stays visible against both the control and the page in both themes.

---

## 21. Full anatomy — a complete raised control

Every part of the illusion, each owned by one property. Delete the parts a quieter
element doesn't need — but *diagnose* with all five (face → gradient, edges → insets,
seam → border, height/roundness → cast offset/blur, setting → wrapper).

```css
.key {
  /* FACE — the gradient IS the convexity (light from above) */
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--surface), white 10%),
    color-mix(in oklch, var(--surface), black 8%));
  /* SEAM — 1px parting line between the key and the panel */
  border: 1px solid color-mix(in oklch, var(--surface), black 30%);
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 var(--highlight),   /* EDGE — lit top rim (blur 0 = chamfer) */
    0 1px 1px rgb(0 0 0 / .30),       /* CAST: contact — pins it low */
    0 3px 6px rgb(0 0 0 / .12);       /* CAST: direct — offset = height, blur = roundness */
  transition: box-shadow .16s ease, transform .12s ease;
}
.key:active {                          /* press = down the Z axis */
  background: linear-gradient(180deg,  /* face flips subtly toward concave */
    color-mix(in oklch, var(--surface), black 4%),
    color-mix(in oklch, var(--surface), white 6%));
  box-shadow: inset 0 1px 2px rgb(0 0 0 / .25);
  transform: translateY(1px);
}
/* SETTING — optional: seat it in a groove for the mounted-hardware read */
.socket {
  border-radius: 12px; padding: 4px;
  background: color-mix(in oklch, var(--surface), black 6%);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / .18),
              inset 0 -1px 0 var(--highlight);
}
```
