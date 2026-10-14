# Design — nuxt-backend.dev

The site is a machined console: gunmetal, lit from the top-left, with three
signals and no brand colour. The reference is artboard "08 · Console" (Anybody,
Martian Mono and Handjet; engraved and embossed type; keys, LEDs, strips, an LCD
and a dial). This file is the *why* and the *how*; the values live in code:

| What | Where |
| --- | --- |
| Tokens: grounds, inks, signals, depth | [`assets/css/tokens.css`](./assets/css/tokens.css) |
| Parts: faces, wells, chrome, relief | [`assets/css/depth.css`](./assets/css/depth.css) |
| Parts: keys, lights, the LCD | [`assets/css/console.css`](./assets/css/console.css) |
| Ramps, fonts, Nuxt UI bridges, legacy utilities | [`app.css`](./app.css) |
| Part components | `components/{Led,Strip,Key,Lcd,Console,EngravedTitle}.vue` |
| Code colours | [`shiki-themes.ts`](./shiki-themes.ts) |
| Every part on one page | `/__parts`, under `nuxt dev` only |

---

## 1. One light source

Light falls from the **top-left**. Every highlight, shadow, gradient and glow
follows from it:

- **highlights** sit on the top and left edges, the faces turned to the light;
- **shadows** fall down and to the right, so a drop shadow has a positive x and y;
- **gradients** run lighter at the top-left, darker toward the bottom-right;
- **engraving** is subtractive: a cut's near wall (up-left) is in shadow and
  its far wall (down-right) catches light; embossing flips the offsets.

A key is the one exception that is lit straight from above: its top edge
catches the light and its bottom lip is dark, as a key on a panel would be.

## 2. Materials

The whole product sits on **one machined slab**: gunmetal in dark (the
reference), a light gunmetal in light, both at the same cool, nearly grey hue.

- **The ground** (`--bg`, painted by `--matte-bg`): a top-left light ray over a
  135° hairline grain (2px lines every 6px, under 1 % alpha: half the
  reference's, which hatched visibly at 1x).
- **Faces** are milled out of it and sit lighter: `--surface`, `--surface-hi`.
- **Wells** are cut into it and sit darker: `--sink`, with `--seam` the dark
  line between two machined parts.
- **The LCD** is backlit dark glass in both themes: an emissive display.

Lighter than the ground reads as closer, darker as recessed, before a single
shadow is added. Matte, never glossy: sheens stay tight and desaturated. The
metal has no colour of its own.

---

## 3. Palette and tokens

There is **no brand colour**. The only chroma is three status signals, which
are the site's main colours **and** its live-status language (LEDs, doctor
findings, delivery outcomes), so a green key and a green LED say the same
thing: *go*.

| Signal | Token family | Means | Nuxt UI aliases |
| --- | --- | --- | --- |
| **Green** | `--ok` `--ok-press` `--ok-soft` `--ok-dim` `--ok-glow` `--ok-lit` `--on-ok` | go · ok · live · **the primary action** · focus | `primary`, `success` |
| **Yellow** | `--warn` `--warn-press` `--warn-soft` `--warn-dim` `--warn-glow` `--warn-lit` `--on-warn` | attention · idle · **secondary** · experimental · notes | `secondary`, `info`, `warning` |
| **Red** | `--err` `--err-press` `--err-soft` `--err-dim` `--err-glow` `--err-lit` `--on-err` | danger · error · **destructive** | `error` |

Each family reads the same way:

- **the signal** (`--ok`): text-safe on the ground, the faces and the wells in
  both themes, so one token is the label, the hairline and the button fill;
- **`-lit`** the lit LED, strip, glyph or fill: the reference value (`#4ade80`,
  `#facc15`, `#f87171`, display-p3 where the screen has it) in **both** themes,
  because a light is a light whatever the page around it;
- **`-press`** the hover fill · **`-soft`** text on a tinted chip · **`-dim`** a
  faint tint *behind* a pill or a row · **`-glow`** the translucent colour of
  the `--glow-*` shadows · **`-on`** lettering on a filled control.

Light versus dark is the *ramp*, not a second palette. Dark text runs each
ramp's **400** step, which *is* the lit signal. Light text runs **500**: a lit
signal on a light ground is far below 4.5:1 (the reference yellow is 1.1:1),
so light pages read the same hue deep enough to be text. At the yellow's hue
that is olive (`#6d5600`), kept on review over the old amber. Nuxt UI binds its
aliases to the same steps (500 light, 400 dark), so the docs chrome and the
playground show one signal. "amber" is the ramp that carries the yellow, named
for the alias it backs.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` · `--surface` · `--surface-hi` · `--sink` · `--seam` | `#dcdee2` · `#ebedef` · `#f6f7f9` · `#ced1d6` · `#b7bac0` | `#26292e` · `#33373e` · `#3b3f46` · `#1c1e22` · `#101216` |
| `--ink` · `--ink-dim` · `--ink-faint` | `#1f2226` · `#575b62` · `#5b5f67` | `#e6e8ec` · `#9fa3ad` · `#9498a3` |
| `--ok` · `--warn` · `--err` | `#116632` · `#6d5600` · `#a1302d` (500) | `#4ade80` · `#facc15` · `#f87171` (400) |
| `--on-ok` · `--on-warn` · `--on-err` | `#fff` | `#052912` · `#1a1200` · `#1c0707` |
| `--trim` (never text) | `#9a9ea7` | `#666a75` |

Every token is declared once. Colours that differ by theme use `light-dark()`,
and so does every layer of every shadow: a layer keeps its geometry in both
themes and changes only its colour, so a token follows the page's
`color-scheme` (the OS preference, or Docus's toggle through the `html.dark` /
`html.light` bridge in app.css). `light-dark()` takes colours only, so a
gradient that differs by theme composes per-stop tokens (`--key-face` from
`--key-hi`, `--key-mid`, `--key-lo`).

### Contrast

A raised face is lighter than the ground in both themes and a well is darker,
so an ink that clears its bar on the ground can miss it on either. The blocks at
the end of tokens.css re-derive the text inks per ground, and small red on a
dark plate takes the soft red. Every pair, measured on the declared values by
`scripts/design-contrast.mjs` (worst ground per row; `test/docs/design-tokens.test.ts`
fails when one drops below its bar or this table is stale; `pnpm generate`
rewrites it):

<!-- contrast:start -->
| Ink | On | Light | Dark | Bar |
| --- | --- | --- | --- | --- |
| `--ink` | ground | 11.85:1 | 11.90:1 | 4.5:1 |
| `--ink` | raised | 13.61:1 | 8.62:1 | 4.5:1 |
| `--ink` | well | 10.43:1 | 13.61:1 | 4.5:1 |
| `--ink-dim` | ground | 5.06:1 | 5.78:1 | 4.5:1 |
| `--ink-dim` | raised | 5.81:1 | 4.60:1 | 4.5:1 |
| `--ink-dim` | well | 4.67:1 | 6.61:1 | 4.5:1 |
| `--ink-faint` | ground | 4.76:1 | 5.06:1 | 4.5:1 |
| `--ink-faint` | raised | 5.46:1 | 4.61:1 | 4.5:1 |
| `--ink-faint` | well | 4.65:1 | 5.79:1 | 4.5:1 |
| `--ok` | ground | 5.25:1 | 8.37:1 | 4.5:1 |
| `--ok` | raised | 6.02:1 | 6.07:1 | 4.5:1 |
| `--ok` | well | 4.62:1 | 9.58:1 | 4.5:1 |
| `--warn` | ground | 5.23:1 | 9.53:1 | 4.5:1 |
| `--warn` | raised | 6.00:1 | 6.91:1 | 4.5:1 |
| `--warn` | well | 4.60:1 | 10.90:1 | 4.5:1 |
| `--err` | ground | 5.24:1 | 5.28:1 | 4.5:1 |
| `--err` | raised | 6.01:1 | 5.57:1 | 4.5:1 |
| `--err` | well | 4.61:1 | 6.03:1 | 4.5:1 |
| `--engrave-ink-sm` | ground | 4.69:1 | 5.06:1 | 4.5:1 |
| `--engrave-ink-sm` | raised | 5.39:1 | 4.61:1 | 4.5:1 |
| `--engrave-ink-sm` | well | 4.60:1 | 5.79:1 | 4.5:1 |
| `--engrave-ink` | ground | 4.69:1 | 3.59:1 | 3:1 (24px and up) |
| `--engrave-ink` | raised | 5.39:1 | 3.10:1 | 3:1 (24px and up) |
| `--engrave-ink` | well | 4.13:1 | 4.11:1 | 3:1 (24px and up) |
| `--emb-ink` | ground | 11.85:1 | 12.79:1 | 4.5:1 (embossed titles) |
| `--emb-ink` | raised | 13.61:1 | 9.27:1 | 4.5:1 (embossed titles) |
| `--key-ink` | `--key-hi`, `--key-mid`, `--key-lo` | 10.39:1 | 6.76:1 | 4.5:1 |
| `--ok` | `--key-down-hi`, `--key-down-lo` | 4.62:1 | 7.37:1 | 4.5:1 |
| `--key-warn-ink` | `--key-hi`, `--key-mid`, `--key-lo` | 6.67:1 | 7.60:1 | 4.5:1 |
| `--key-err-ink` | `--key-hi`, `--key-mid`, `--key-lo` | 6.66:1 | 4.99:1 | 4.5:1 |
| `--go-ink` | `--go-hi`, `--go-lo`, `--ok-lit` | 6.07:1 | 6.07:1 | 4.5:1 |
| `--on-ok` | `--ok` | 7.07:1 | 9.05:1 | 4.5:1 |
| `--on-warn` | `--warn` | 7.04:1 | 12.13:1 | 4.5:1 |
| `--on-err` | `--err` | 7.06:1 | 7.01:1 | 4.5:1 |
| `--ok-lit` | `--lcd-ground` | 9.71:1 | 9.71:1 | 4.5:1 |
| `--warn-lit` | `--lcd-ground` | 11.05:1 | 11.05:1 | 4.5:1 |
| `--err-lit` | `--lcd-ground` | 6.12:1 | 6.12:1 | 4.5:1 |
<!-- contrast:end -->

The code inks (`shiki-themes.ts`) are measured against their well in the same
test.

### Rules

1. **Never engrave a signal.** Relief is for the metal's inks; a signal sits
   *on* the metal, crisp, like a lamp in a milled pocket.
2. **Never fill more than a control.** A signal fills a key, a toggle track, an
   LED, a pill: never a panel, a hero, a section.
3. **One signal per element.** A control is green *or* yellow *or* red; a
   status row carries one LED.
4. **Gunmetal carries structure.** Hierarchy and depth come from the greys and
   the ladder; colour only ever says *go / look / stop*.
5. **Text is the signal, not the tint.** `-dim` tints sit behind text and never
   carry it.
6. **Lit is not text.** `--*-lit` is for lights; text on a light page uses the
   signal.

---

## 4. Type

| Face | Role | Width |
| --- | --- | --- |
| **Anybody** | display and prose (`--display`, `--font`, `--font-sans`, `--font-display`) | 112 % on h1–h3; 118 % uppercase on the hero and nameplates; 100 % in prose |
| **Martian Mono** | code, labels, keys, tables (`--mono`, `--font-mono`) | 87.5 % in code; 100 % in labels and keys |
| **Handjet** | the LCD's glyphs only (`--lcd`, `--font-lcd`) | — |

These three are the only families on the site (the design-parts test holds
it). @nuxt/fonts self-hosts them with their width axis; `check-website-css`
fails the build when the axis goes missing.

- Prose: Anybody 400/500, sentence case, about 68 characters to a line.
- Headings h1–h3: sentence case (`pnpm docs:style`), Anybody wide.
- **Uppercase is for labels only**: `stamp`, keys, LCD lines. One recipe, the
  `stamp` part, so a label never gets hand-rolled tracking.
- Inline code may break anywhere: Martian Mono is wide enough that a long name
  would push a phone page sideways.

---

## 5. Depth

Every raised shadow is **two shadows doing two jobs** plus a rim: a tight
**contact** shadow under the element, a soft **cast** down-right, and a 1px lit
**rim** on the top-left edge. As elevation rises the contact fades and the cast
grows. Resting UI whispers: blur under 8px, offset under 4px.

| Token | Use |
| --- | --- |
| `--elev-0` | flush: a lit rim and a hairline |
| `--elev-1` | resting: button, pill, card, tile |
| `--elev-2` | hover, a lifted card |
| `--elev-3` | dropdown, popover |
| `--elev-4` | modal: the cast alone |
| `--inset-1` · `--inset-2` | wells, inputs, tracks, the pressed state |
| `--plaque` · `--plaque-hi` | the raised panel, at rest and on hover |
| `--slot` | a milled well, deeper than `--inset-2` |
| `--key-shadow` · `--key-shadow-down` | a key at rest and pressed |
| `--unit-shadow` · `--unit-bevel` | the console slab and its rim |

Shades are a cool near-black (`rgb(24 28 36)`) on the light grounds and black
on gunmetal, so a shadow never greys the hue it falls on.

**Glows** are signals: `--glow-ok` (an LED), `--glow-ok-soft` (a resting
primary), `--glow-ok-ring` (an active control), and the same for `warn` and
`err`. A glow is appended to an elevation, never replaces it, and lands on a
control or a light, never on a panel.

---

## 6. Parts

Every part is a Tailwind `@utility`: one class, one complete recipe, in the
utilities layer. A **modifier** never repeats a recipe; it sets the custom
properties its part reads, so parts and modifiers compose in any order
(`k k-xs k-go`, `slot slot-pill`, `led led-warn`).

| Part | What it is | Modifiers |
| --- | --- | --- |
| `plaque` | the raised panel; a link or button plaque lifts on hover | — |
| `unit` | the console slab, with a bevelled rim | — |
| `slot` | a milled well: inputs, readouts, code | `slot-pill` (fully round), `slot-xs` (shallow, small radius) |
| `carved` | the slot's shadow alone, for a tinted well | — |
| `bar` | the header: opaque, a lit top edge, a seam below | — |
| `seam` | the footer's cut | — |
| `code-plate` | a code block's filename plate | — |
| `k` | a key: 40px, mono uppercase lettering; down when `:active`, `.k-down`, `aria-pressed` or `aria-current="page"` (then lettered green) | `k-nav` (34px, 44px on touch), `k-xs` (28px), `k-go` (lit green, the one primary), `k-warn`, `k-err` |
| `led` | an LED | `led-ok`, `led-warn`, `led-err`, `led-off`, `led-lg`, `led-pulse` |
| `strip` | a tritium strip, lying flat | `strip-v` (standing), `strip-ok`, `strip-warn`, `strip-err` |
| `lcd` | backlit glass in a bezel, with scanlines | — |
| `lcd-row` | one line of the LCD | — |
| `px` | lit Handjet glyphs | the LED signals (`px led-warn`) |
| `pxled` | a square pixel LED | the LED signals |

The relief parts are in §7. The components wrap the parts that take props:

| Component | Part | Props |
| --- | --- | --- |
| `<Led>` | `led` | `tone`, `size`, `pulse`, `label` (its accessible name; decorative without) |
| `<Strip>` | `strip` | `tone`, `vertical` |
| `<Key>` | `k` | `to` (a link) or a button's `type`; `size`, `signal`, `pressed`, `disabled` |
| `<Lcd>` | `lcd` | `label`, `live` |
| `<Console>` | `unit` | slots `display`, `dial`, `keys` |
| `<EngravedTitle>` | `cut` / `cut-sm` | `text`, `as`, `size` |

**In Nuxt UI slot strings** a part replaces the component's own background,
ring, border, radius and shadow, and a relief part its text colour and shadow:
`app.config.ts` gives the parts tailwind-merge class groups that conflict with
what they draw, so the part named last wins instead of losing to the
stylesheet's order. `carved` and `seam` draw only an edge and keep a tinted
background. The design-parts test keeps the groups equal to the parts declared.

**Dynamic classes** are spelled out in full (`{ ok: 'led-ok', … }`), so
Tailwind's scan finds every part it must emit.

---

## 7. Relief

| Part | Use | Ink |
| --- | --- | --- |
| `cut` | engraved display type, 24px and up; with `data-text` repeating the text (`<EngravedTitle>` sets it), each letter's lower half takes a lighter floor | `--engrave-ink` (3:1, large text) |
| `cut-sm` | engraved page and prose titles, which cannot carry `data-text` | `--engrave-ink` |
| `emb` · `emb-sm` | a title lifted off the metal in stepped layers | `--emb-ink` |
| `engr` | an engraved label at any size | `--engrave-ink-sm` (4.5:1) |
| `engr-lt` | the same cut in a brighter ink | `--ink-dim` |
| `stamp` | the uppercase mono label | `--ink-dim` |

- **A text-shadow never counts toward contrast.** Each relief part sets an ink
  that clears its bar on its own, re-derived on faces and in wells.
- The `cut` floor repeats the text visually only (`content: attr(data-text) / ""`),
  so a screen reader reads a heading once.
- **`prefers-contrast: more`** (and `?qa=contrast`) strips every relief part to
  plain `--ink` with no shadow. Apply relief through the parts only: a
  hand-written `text-shadow` in scoped CSS out-specifies the switch.
- The legacy `.engraved`, `.engraved-sm`, `.embossed` and `.embossed-sm` stay
  until R3–R5 rebuild what uses them; the switch reaches them too.

---

## 8. Chrome map

How the docs chrome maps onto parts. R3 applies the right-hand column through
`app.config.ts` `ui.*` slot overrides; until then the left-hand utilities
remain.

| Docus / Nuxt UI slot | Now | Target |
| --- | --- | --- |
| `header.root` | `mach-bar` | `bar`, with `k k-nav` keys |
| `contentSearchButton.base` | `search-slot` | `slot slot-pill`, a `k k-xs` kbd |
| `pageHeader.title` | `engraved` | `font-display cut-sm` |
| `prose.h1` · `prose.h2` | `engraved` · `rule-carved` | `cut-sm` · `emb-sm` with a carved rule |
| `prose.pre` | `slot` + `code-plate` | the same, a `k k-xs` copy key |
| `prose.code` | the inline chip rule in app.css | `slot slot-xs` |
| `prose.callout` | `carved` | `carved` with a `strip strip-v` rail |
| `card` · `contentSurround.link` | `plaque` | `plaque` |
| `contentToc.trigger` | `engraved-sm` | `engr` |
| `contentNavigation` | the `aside a::before` rules | `engr` section stamps, a `slot slot-pill` active entry |
| `footer.root` | `mach-seam` | `seam` |

Never override `commandPalette.slots.input` or `contentNavigation.slots.*`
without copying Docus's own strings first: defu replaces same-key strings.

---

## 9. The playground bridge

The packaged components read `--bk-*` tokens (the customization ladder's second
rung). Inside `.bk-depth`, app.css maps them onto the site's tokens
(`--bk-accent: var(--ok)` …), so the playground's packaged pages wear the site's
palette while `/playground/vanilla/*` keeps the zero-config look.

The playground's own components (`LabPanel`, `LabButton`, `LabToggle`,
`LabField`, `MetricCard`, `StateReadout`, `StatusPill` …) still use the names
they were written against: `--raise` and `--raise-sm` (= `--elev-1`),
`--raise-lg` (= `--elev-3`), `--inset` (= `--inset-2`), `--inset-sm`
(= `--inset-1`). R5 rebuilds them on the parts and drops the names; new
playground pages use the parts from the start.

---

## 10. Motion

- Presses are fast: 120–130ms, transform and shadow only (`--press`).
- Transitions use `--transition` (180ms, an ease-out curve).
- A live LED breathes (`led-pulse`); nothing else moves at rest.
- `prefers-reduced-motion: reduce` stills every animation and transition
  (app.css).
- Animate `transform` and `opacity`; swap shadow tokens for state rather than
  animating blur.

---

## 11. QA hooks

- **`/__parts`** (dev only) shows every part in both themes; the design-parts
  test fails when a declared part is missing from it.
- **`?qa=dark`, `light`, `contrast`, `reduced`** (comma-separated,
  `plugins/qa.client.ts`) stamp `html.dark` / `html.light` / `html.qa-contrast`
  / `html.qa-reduced` without touching OS settings.
- **Contrast**: `scripts/design-contrast.mjs` and the table in §3.
- **Build**: `scripts/check-website-css.mjs` fails when the ramps, the tokens
  import or a font's width axis go missing from the built CSS.
- **The ratchet** (`test/docs/design-parts.test.ts`): scoped `<style>` blocks
  and hand-rolled uppercase labels in the site's components only go down; the
  site uses three font families; the parts files hold nothing but `@utility`
  parts and keyframes.
- **Screenshots**: a website PR carries 390 and 1280 px, light and dark.

---

## 12. Do and don't

**Do**

- Build from parts; add a modifier before a new part, and a part before
  scoped CSS.
- Keep one light source across the whole site.
- Change elevation for state; don't invent a shadow per component.
- Put focus rings and glows on top of depth, never instead of it.

**Don't**

- Engrave or emboss a signal, or fill more than a control with one.
- Add a fourth colour: no brand accent, no blue, no violet.
- Overlay flat white for a highlight; pick the colour.
- Reach for a big blurry shadow on resting UI.
- Mix light directions.
