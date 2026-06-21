# Depth Design Standard — Nuxt backend

> The canonical guide for the website UI's look & feel. It codifies a **depth
> design** system: full-rounded surfaces lifted off the canvas with *tiny*
> elevation, two-part shadows, light-catching rims, soft glows and gradients.
> Implementation lives in [`app.css`](./app.css); this file is the *why* and the
> copy-paste *how*.

**One rule above all:** light falls from the **top-left**. Every highlight,
shadow, gradient and glow in this system is derived from that single light
source. Get that right and depth becomes consistent and automatic.

Sources this standard is built on:

- **Refactoring UI** — *Creating Depth* (Adam Wathan & Steve Schoger, pp. 148–172):
  emulate a light source · use shadows to convey elevation · shadows have two
  parts · even flat designs have depth · overlap elements to create layers.
- **Tegra** — *How to create depth in UI design* [Part 1](https://medium.com/hellotegra/how-to-create-depth-in-ui-design-part-1-c762b652219c) ·
  [Part 2](https://medium.com/hellotegra/how-to-create-depth-in-ui-design-part-2-da81686ba70).
- The attached reference shots: dark pill navs (active = raised + accent glow),
  neumorphic light/dark buttons, the gradient "Appearance" modal, the Keel-style
  sidebar.

---

## 0. TL;DR cheat-sheet

| Goal | Reach for |
| --- | --- |
| Raise an element a hair off the page | `--elev-1` (rim highlight + ambient + cast) |
| Hover / focus lift | step up one elevation (`--elev-1 → --elev-2`) |
| Press / active-down | step *down* to `--inset-1` (RUI: pressed = smaller/removed shadow) |
| Carve a well (input, track, readout) | `--inset-1` / `--inset-2` |
| Make a surface feel lit | `135deg` gradient, lighter top-left |
| Add a crisp lit edge | gradient border (light top-left → dark bottom-right) |
| Draw focus / signal "live" | `--glow-accent` (orange) or `--glow-ok` (green status dot) |
| Lift text off a surface | gradient text + 1px letterpress shadow |
| Stack layers without shadows | overlap elements; lighter = closer, darker = inset |
| Stop flat banding on big panels | 2–4 % noise texture |

**Tiny elevation is the house style.** Blur radii stay in the single digits for
resting components; offsets a few px. Big diffuse shadows are reserved for
modals only. When in doubt, use *less*.

---

## 1. Mental model

### Light from the top-left
RUI teaches "light comes from above"; we tilt it to the **top-left corner** so
depth reads with a little more direction and matches the reference shots.

Consequences, applied everywhere:

- **Highlights** sit on the **top + left** edges (the faces angled toward the
  light).
- **Shadows** fall to the **bottom + right** (faces angled away). Drop shadows
  therefore use a small **positive x** *and* positive y offset.
- **Gradients** run **`135deg`** (top-left → bottom-right): lighter origin,
  darker tail.

```
        ☀  ← light source
         ╲
          ╲   ┌───────────────┐  ← top & left edges: highlight
           ╲  │               │
              │     surface    │
              │               │
              └───────────────┘
                               ╲  shadow falls bottom-right
```

### The z-axis (RUI: "use shadows to convey elevation")
Shadows position elements on a virtual z-axis. The closer something is to the
user, the larger/softer its shadow and the more it attracts focus. We expose a
**fixed 5-step ladder** (`--elev-0…4`) so elevation is a decision, not a
guess — *"don't think about the shadow, think about where the element sits on
the z-axis and assign it a shadow accordingly."*

### Tiny elevation
Resting UI (buttons, pills, cards, tiles) lives at `--elev-1`. It should *whisper*
— a hairline rim + a soft few-pixel shadow. We are not doing photo-realistic
neumorphism; RUI's warning applies — *"don't get carried away."*

---

## 2. Shadows have two parts (the core recipe)

Every raised shadow is **two shadows doing two jobs** (RUI, pp. 162–166):

1. **Cast** — larger, softer, offset down-right. Simulates the shadow thrown by
   the top-left light. *Subtle.*
2. **Ambient occlusion** — tight, darker, small offset, little/no blur.
   Simulates the dark contact line right under the element. *Crisp.*

Plus, because light is top-left, we add a third layer:

3. **Rim highlight** — a 1px inset highlight on the top-left edge (RUI: "make the
   top edge slightly lighter… using a top border or an inset box shadow with a
   slight vertical offset"). **Pick the light colour by hand**, don't just dump
   semi-transparent white — overlaying white "sucks the saturation out of the
   underlying colour."

> **Elevation rule:** as elevation rises, the *ambient/contact* shadow fades
> (distinct at `--elev-1`, nearly gone at `--elev-4`) while the *cast* grows.
> "Distinct at your lowest elevation, almost invisible at your highest."

```css
/* Anatomy of one raised step (light theme, light from top-left) */
box-shadow:
  inset 1px 1px 0 0 rgb(255 255 255 / .85),  /* 3. rim highlight  (top-left)   */
  inset -1px -1px 0 0 rgb(0 0 0 / .04),       /*    faint inner shade (br) → "border lighter than shadow" */
  1px 1px 1px rgb(0 0 0 / .05),               /* 2. ambient/contact (tight)    */
  2px 4px 8px rgb(0 0 0 / .07);               /* 1. cast (soft, down-right)    */
```

The first two insets make the **border lighter than the shadow beneath it** —
the "shadow under border" cue you asked for: the top-left rim catches light, the
drop shadow underneath is darker, so the element looks physically lifted.

---

## 3. Token reference (paste-ready)

These extend the existing `:root` palette in `app.css` (`--bg`, `--surface`,
`--surface-hi`, `--sink`, `--ink`, `--accent` …). Drop them in and reference the
ladder instead of hand-rolling shadows.

### 3.1 Elevation ladder — light theme

```css
:root {
  /* RAISED — tiny → modal. Rim highlight + fading ambient + growing cast. */
  --elev-0:                                   /* flush, hairline only */
    inset 1px 1px 0 rgb(255 255 255 / .6),
    0 0 0 1px rgb(0 0 0 / .04);
  --elev-1:                                   /* resting: button, pill, card, tile */
    inset 1px 1px 0 rgb(255 255 255 / .85),
    inset -1px -1px 0 rgb(0 0 0 / .04),
    1px 1px 1px rgb(0 0 0 / .05),
    2px 4px 8px rgb(0 0 0 / .07);
  --elev-2:                                   /* hover / lifted card */
    inset 1px 1px 0 rgb(255 255 255 / .9),
    1px 2px 2px rgb(0 0 0 / .05),
    3px 6px 14px rgb(0 0 0 / .09);
  --elev-3:                                   /* dropdown, popover */
    inset 1px 1px 0 rgb(255 255 255 / .9),
    2px 4px 6px rgb(0 0 0 / .04),
    5px 12px 24px rgb(0 0 0 / .11);
  --elev-4:                                   /* modal — cast only, ambient gone */
    inset 1px 1px 0 rgb(255 255 255 / .95),
    8px 20px 48px rgb(0 0 0 / .16);

  /* INSET — wells, inputs, tracks, pressed. Dark top-left, lit bottom-right. */
  --inset-1:
    inset 1px 1px 2px rgb(0 0 0 / .10),
    inset -1px -1px 0 rgb(255 255 255 / .6);
  --inset-2:
    inset 2px 2px 5px rgb(0 0 0 / .14),
    inset -1px -1px 0 rgb(255 255 255 / .5);
}
```

### 3.2 Elevation ladder — dark theme

In the dark, near-flat material the rim highlight is a *faint* white edge and the
shadows go deep. (Multi-layer shadows can't live inside `light-dark()` — keep
dark variants in a `prefers-color-scheme`/`html.dark` block, as `app.css` already
does.)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --elev-0:
      inset 1px 1px 0 rgb(255 255 255 / .05),
      0 0 0 1px rgb(255 255 255 / .05);
    --elev-1:
      inset 1px 1px 0 rgb(255 255 255 / .06),
      1px 1px 2px rgb(0 0 0 / .4),
      2px 5px 12px rgb(0 0 0 / .4);
    --elev-2:
      inset 1px 1px 0 rgb(255 255 255 / .07),
      2px 4px 6px rgb(0 0 0 / .45),
      3px 8px 18px rgb(0 0 0 / .5);
    --elev-3:
      inset 1px 1px 0 rgb(255 255 255 / .08),
      5px 12px 26px rgb(0 0 0 / .55);
    --elev-4:
      inset 1px 1px 0 rgb(255 255 255 / .1),
      10px 24px 56px rgb(0 0 0 / .68);
    --inset-1:
      inset 1px 1px 3px rgb(0 0 0 / .5),
      inset -1px -1px 0 rgb(255 255 255 / .05);
    --inset-2:
      inset 2px 2px 6px rgb(0 0 0 / .6),
      inset -1px -1px 0 rgb(255 255 255 / .04);
  }
}
```

### 3.3 Glows

```css
:root {
  /* Accent (fluorescent orange) — focus, primary, "live" emphasis */
  --glow-accent:
    0 0 0 1px rgb(255 90 31 / .35),
    0 4px 16px rgb(255 90 31 / .35);
  --glow-accent-soft: 0 0 14px rgb(255 90 31 / .30);
  /* Status — the green "live" dot from the nav reference */
  --glow-ok:   0 0 8px rgb(74 222 128 / .55);
  --glow-warn: 0 0 8px rgb(251 191 36 / .5);
  --glow-err:  0 0 8px rgb(248 113 113 / .5);
}
```

Glows are *additive*: append a glow to an existing elevation, never replace the
shadow.

```css
.is-active { box-shadow: var(--elev-1), var(--glow-accent); }
```

### 3.4 Legacy aliases — one ladder, two names

The base components (`.btn`, `.card`, `.well`, `.input`, `.pill`) and the
playground's `Lab*` components predate this ladder and reference an older set of
names. Those names are **not a second system** — in [`app.css`](./app.css)
they're thin aliases onto the ladder above, so the whole product (homepage, docs
**and** playground) is lit by one sun and shares the light/dark toggle:

| Legacy name | Resolves to | Use |
| --- | --- | --- |
| `--raise` · `--raise-sm` | `--elev-1` | resting card / control |
| `--raise-lg` | `--elev-3` | large lifted surface / popover |
| `--raise-accent` | `--elev-1` + `--glow-accent-soft` | primary (accent) control |
| `--inset` | `--inset-2` | deep well (`panel.well`, tracks) |
| `--inset-sm` | `--inset-1` | shallow well (input, chip) |

Reach for `--elev-*` / `--inset-1|2` in **new** code; the legacy names live on
only so existing components keep working. Before they were aliased they cast
their shadow *straight down* and silently ignored the theme toggle (depth tracked
the OS preference but not the Docus switch) — the "mixed light source" bug §7
warns against. Aliasing them onto the ladder fixed both in one move.

---

## 4. The ten depth tools

Each tool below maps to one of the requested parameters. Use them in
combination — depth is cumulative.

### 4.1 Shadows → see §2–§3. The backbone. Always two-part + a rim.

### 4.2 Lighter / darker colours (RUI: "even flat designs have depth")
Independent of shadow: **lighter than the background = closer/raised; darker =
inset.** Our surface scale is already ordered for this:

```
--sink  (recessed)  <  --bg  (canvas)  <  --surface  <  --surface-hi (raised)
```

Place a `--surface` panel on `--bg` and it lifts before a single shadow is added.
Solid (blur-less) offset shadows keep that flat feel while still lifting:

```css
.flat-lift { box-shadow: 1px 2px 0 rgb(0 0 0 / .08); } /* RUI "solid shadows" */
```

### 4.3 Gradients (surfaces)
A `135deg` gradient makes a face look lit from the top-left instead of evenly
painted. Keep the range tight — this is texture, not a rainbow.

```css
.surface {
  background: linear-gradient(135deg,
    var(--surface-hi) 0%,
    var(--surface) 55%,
    color-mix(in srgb, var(--surface), #000 4%) 140%);
  border-radius: var(--r);
  box-shadow: var(--elev-1);
}
```

### 4.4 Gradient border ("shadow under border", border lighter than shadow)
A 1px border that is **bright at the top-left and dark at the bottom-right**
reads as a lit bevel. Implement with two backgrounds (`padding-box` +
`border-box`) so it survives any radius, then sit it on a drop shadow:

```css
.gradient-border {
  border: 1px solid transparent;
  border-radius: var(--r);
  background:
    linear-gradient(135deg, var(--surface-hi), var(--surface)) padding-box,
    linear-gradient(135deg,
      rgb(255 255 255 / .9),
      rgb(255 255 255 / .12) 45%,
      rgb(0 0 0 / .14)) border-box;
  box-shadow: var(--elev-1);     /* shadow lives *under* the lighter border */
}
```

Dark theme: swap the border-gradient stops to
`rgb(255 255 255 / .14) → transparent → rgb(0 0 0 / .5)`.

### 4.5 Gradient text
Two uses:

- **Accent emphasis** — a top-left → bottom-right orange ramp for hero words /
  active labels.
- **Engraved neutral** — `--ink → --ink-dim` plus a 1px letterpress shadow so
  the text feels stamped *into* the surface.

```css
.text-accent-grad {
  background: linear-gradient(135deg, #ff7a3c, #f0420a);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.text-engraved {                 /* letterpress: light below, on a light surface */
  color: var(--ink);
  text-shadow: 0 1px 0 rgb(255 255 255 / .6);
}
@media (prefers-color-scheme: dark) {
  .text-engraved { text-shadow: 0 1px 0 rgb(0 0 0 / .5); } /* shadow above-dark */
}
```

### 4.6 Glows → see §3.3. Reserve for focus, primary, and "live"/status signals.
The reference nav's green dot = `box-shadow: var(--glow-ok)` on a 6px circle.

### 4.7 Perspective
A *subtle* tilt sells a card or console as a physical object. Keep angles ≤ ~4°,
anchor `transform-origin` to the lit corner (top-left), and never tilt text the
user must read carefully.

```css
.tilt {
  transform: perspective(1200px) rotateX(3deg) rotateY(-4deg);
  transform-origin: top left;
}
```

### 4.8 Overlap elements (RUI: "overlap to create layers")
The strongest depth cue that needs *no* shadow:

- Offset a card so it **crosses a background transition** (e.g. hero → section).
- Make a child **taller than its parent** so it spills over both edges.
- Float controls (cursor, badges, the cube icon in the nav) **over** the bar.
- **Overlapping images** get an "invisible border" the colour of the background
  so neighbours never clash:

```css
.stack-image { border: 3px solid var(--bg); border-radius: var(--r); }
```

### 4.9 Texture
A whisper of noise (2–4 %) on large surfaces stops flat-colour banding and adds
tactility — like the matte panels in the references.

```css
.noise::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  pointer-events: none; opacity: .035; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

### 4.10 Tiny elevation (the constraint)
Defaults to obey: resting blur ≤ 8px, resting offset ≤ 4px, rim highlight 1px,
ambient alpha ≤ .06 (light) / contact only where elements touch. Step the ladder
for state changes; don't invent new shadows per component.

---

## 5. Component recipes

All surfaces are **fully rounded** (`--r-sm` for chips, `--r` for controls,
`--r-lg` for cards, full pill `999px` for nav/segmented controls).

### 5.1 Pill nav / segmented control (reference: v.1–v.3)
- **Track:** an inset well — `background: var(--sink); box-shadow: var(--inset-1)`.
  Items recess *into* it.
- **Idle item:** transparent, `--ink-dim`, mono-ish label + leading icon.
- **Active item:** a raised pill lifted out of the track —
  `background: var(--surface); box-shadow: var(--elev-1)` and, for the primary
  "live" tab, `+ var(--glow-accent)` and a gradient/accent label. The green
  status dot uses `--glow-ok`.
- **Hover item:** `--elev-0` (just a hairline lift), label → `--ink`.

```css
.seg { background: var(--sink); border-radius: 999px; box-shadow: var(--inset-1); padding: 4px; }
.seg__item { border-radius: 999px; color: var(--ink-dim); }
.seg__item:hover { color: var(--ink); box-shadow: var(--elev-0); }
.seg__item.is-active {
  color: var(--ink); background: var(--surface);
  box-shadow: var(--elev-1);
}
.seg__item.is-active.is-primary { box-shadow: var(--elev-1), var(--glow-accent); }
```

### 5.2 Button (reference: Think / Upgrade / Customize)
- **Rest:** `--elev-1` + `135deg` surface gradient + a gradient border.
- **Hover:** step to `--elev-2` (rises toward the user).
- **Active/press:** swap to `--inset-1` and nudge `translateY(.5px)` — RUI's
  "pressed into the page."
- **Primary:** accent gradient fill + `--glow-accent-soft`; **selected** (the
  "Upgrade" ring) adds a brighter gradient border.

```css
.btn { border-radius: 999px; box-shadow: var(--elev-1); transition: box-shadow .18s, transform .12s; }
.btn:hover { box-shadow: var(--elev-2); }
.btn:active { box-shadow: var(--inset-1); transform: translateY(.5px); }
.btn--primary { background: linear-gradient(135deg, var(--accent), var(--accent-press)); color: #fff; box-shadow: var(--elev-1), var(--glow-accent-soft); }
```

### 5.3 Icon tile (the round glyph chips in the references)
Small circle, same raised recipe at one notch lower; on dark, a faint ring +
inner top-left highlight so the glyph sits in a shallow dish.

```css
.icon-tile { border-radius: 999px; background: var(--surface); box-shadow: var(--elev-1); }
.icon-tile--selected { box-shadow: var(--elev-0), var(--glow-accent); }
```

### 5.4 Input / well / readout
`background: var(--sink); box-shadow: var(--inset-1);` Focus = keep the inset and
add an accent ring **on top** of the depth: `var(--inset-1), 0 0 0 2px var(--accent)`.

### 5.5 Card / panel
`--surface` gradient + gradient border + `--elev-1` (→ `--elev-2` if hoverable).
Use **overlap** (§4.8) to cross section boundaries instead of stacking shadows.

### 5.6 Modal (reference: gold "Appearance")
Largest elevation in the system: `--elev-4`, a subtle surface gradient, a lit
gradient border, generous `--r-lg`. The backdrop dims the page so the modal reads
as nearest to the user. Inner option cards are `--elev-1`; the selected one gets a
bright ring (`0 0 0 2px var(--accent)` or a white ring on a tinted theme).

### 5.7 Toggle
Track = `--inset-1` well; knob = `--elev-1` raised bead that slides; ON track gets
the accent fill + `--glow-accent-soft`.

---

## 6. Light vs dark

| | Light | Dark |
| --- | --- | --- |
| Rim highlight | strong, hand-picked light colour (≈ .85 white) | faint white edge (≈ .06–.10) |
| Cast shadow | soft grey, low alpha | deep black, higher alpha |
| Raised surface | lighter than canvas (`--surface-hi`) | *slightly* lighter than near-black (`#232323` on `#161616`) |
| Glow | subtle | reads brighter — dial alpha down a touch |
| Letterpress | light shadow *below* text | dark shadow *above*/below |

Both modes are driven by the same tokens; only the values differ (see §3.1 vs
§3.2). A `html.dark { color-scheme: dark }` / `html.light` bridge keeps any
`light-dark()` tokens in sync with the Docus theme toggle (already wired in
`app.css`).

---

## 7. Do / don't

**Do**
- Keep one light source (top-left) across the *entire* app.
- Use the ladder; change *elevation*, not bespoke shadows.
- Combine cues sparingly: surface gradient + 1px lit border + `--elev-1` is
  usually the whole recipe.
- Fade the contact shadow as things rise; grow the cast.
- Put focus rings and accent glows **on top of** depth, never instead of it.

**Don't**
- Don't overlay flat semi-transparent white for highlights (desaturates the
  surface) — pick the colour.
- Don't reach for big blurry shadows on resting UI; that's modal-only.
- Don't tilt or texture content that must stay crisp/legible.
- Don't mix light directions (no bottom-lit element next to a top-lit one).
- Don't animate shadow blur on scroll for many elements at once (jank) — animate
  `transform`/`opacity`, swap pre-baked shadow tokens for state.

---

## 8. Accessibility & performance

- **Reduced motion:** gate tilt/glow animation behind
  `@media (prefers-reduced-motion: reduce)` (the home components already do).
- **Contrast:** depth is decoration — text/icon contrast must pass on its own,
  never rely on a glow to make a label legible.
- **Focus:** a 2px solid `--accent` outline with `outline-offset: 2px` sits above
  all depth (see `app.css`).
- **Perf:** prefer `box-shadow` tokens + `transform`; avoid layout-affecting
  properties in transitions; keep noise textures to large, few surfaces.

---

## 9. Where this lives

- **Tokens & base:** [`app.css`](./app.css) — the `--elev-*` ladder + `--inset-1|2`
  (`:root` light, then an `@media (prefers-color-scheme: dark)` block **and** an
  `html.dark` / `html.light` bridge, so the OS preference *and* the Docus theme
  switch drive the same tokens across the whole app). The legacy `--raise/--inset`
  aliases (§3.4) live here too.
- **Playground depth components:** `components/` (`LabPanel`, `LabButton`,
  `LabToggle`, `LabField`, `StatusRing`, `StatusPill`, `MetricCard`,
  `StateReadout`, `LiveTrace`, `PageHeader` …) — the depth system in use; treat
  them as the reference implementation. They reference the legacy alias names (§3.4).
- **Homepage depth demos:** `components/home/` (`HeroStage`, `BackendBoot`,
  `Architecture`, `Capabilities`, `ClosingCta`) plus the `.depth-surface` /
  `.depth-border` / `.depth-well` utilities and the `.text-grad` / `.noise` helpers.
- **Docus / Nuxt UI coat:** the docs chrome is Nuxt UI, re-toned to the EDC
  palette — `info` folds into the orange `accent` (no blue; set in
  [`app.config.ts`](./app.config.ts)) — with tiny top-left elevation added to the
  header, sidebar/TOC pills, code wells and **MDC `::card` tiles**. This theme
  renders content with **no `.prose` wrapper**, so card depth targets Nuxt UI's
  `border-default rounded-md bg-default` classes directly rather than `.prose …`.

When adding UI: reach for an existing component first; if you must build new,
compose from the tokens in §3 and the recipes in §5 so the whole product stays
lit by the same sun.
