---
# DESIGN.md — Google Labs design.md format (alpha).
# Drop this at a project root so coding agents inherit a consistent depth language.
# This example instantiates the depth-design skill as a "Titanium EDC" system:
# machined-metal surfaces, precise micro-bevels, one vivid orange accent.
version: alpha
name: Titanium EDC — Depth System
description: >-
  A tactile, machined-metal UI language. Surfaces feel milled from titanium and lit
  from above; depth is built from tiny, precise elevation rather than big soft
  shadows. A single EDC-orange accent marks the one thing that is live.

colors:
  # Titanium neutral ramp (cool grey, faint warmth)
  ti-50:  "#f4f4f6"
  ti-100: "#e4e4e8"
  ti-200: "#d7d7db"
  ti-300: "#bcbcc3"
  ti-500: "#78787f"
  ti-700: "#3a3a40"
  ti-800: "#26262b"
  ti-900: "#1b1b1e"
  ti-950: "#121214"
  # Accent — anodized EDC orange
  accent:         "#ff5c1a"
  accent-hover:   "#ff6f38"
  accent-pressed: "#e24d12"
  on-accent:      "#1a1206"
  # Semantic surfaces (light default; see Colors for dark)
  surface:        "{colors.ti-200}"
  surface-raised: "{colors.ti-100}"
  surface-sunken: "{colors.ti-300}"
  ink:            "{colors.ti-900}"
  ink-muted:      "{colors.ti-500}"

typography:
  display: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "2rem",    fontWeight: 600, lineHeight: 1.1,  letterSpacing: "-0.02em" }
  body:    { fontFamily: "system-ui, sans-serif",                   fontSize: "0.95rem", fontWeight: 450, lineHeight: 1.5 }
  mono:    { fontFamily: "'Space Mono', ui-monospace, monospace",   fontSize: "0.8rem",  fontWeight: 400, letterSpacing: "0.02em" }

rounded:
  sm: 8px
  md: 12px
  lg: 16px
  pill: 999px

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  6: 24px
  8: 32px

# Elevation tokens (extension). Two-part shadows: a tight ambient contact shadow
# plus a softer direct-light shadow. Tuned tight so a TINY lift still reads.
elevation:
  flat:  "none"
  hair:  "inset 0 1px 0 0 {colors.surface-raised}, 0 1px 1px 0 rgb(0 0 0 / .28)"
  low:   "0 1px 1px rgb(0 0 0 / .10), 0 2px 3px rgb(0 0 0 / .08)"
  mid:   "0 1px 2px rgb(0 0 0 / .10), 0 4px 8px rgb(0 0 0 / .10)"
  high:  "0 2px 4px rgb(0 0 0 / .08), 0 12px 24px rgb(0 0 0 / .14)"
  glow:  "0 0 0 1px rgb(255 92 26 / .55), 0 0 14px 0 rgb(255 92 26 / .45)"

components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.6}"
---

## Overview

The product should feel like a piece of **machined titanium hardware** — a premium
everyday-carry tool. Surfaces read as solid metal, milled and bead-blasted, lit by a
soft light from above. Restraint is the whole aesthetic: mostly flat, precise
surfaces, with depth applied in **tiny, deliberate** amounts. Exactly one element per
context glows **orange** — the live, primary, or currently-focused thing. Everything
else stays quiet metal.

If a screen looks busy or toy-like, you have overdone the depth. Machined tools are
subtle; so is this UI.

## Colors

- **Neutrals are a titanium ramp** (`ti-50 … ti-950`) — cool grey with a faint
  warmth so it never looks like plastic. Build surfaces from these.
- **Light mode:** `surface = ti-200`, raised panels `ti-100`, sunken wells `ti-300`,
  text `ti-900`.
- **Dark mode:** remap `surface = ti-800`, raised `ti-700`, sunken `ti-900`, text
  `ti-50`. Keep the light direction identical; only the contrast balance changes.
- **Orange is a scalpel, not a paint bucket.** Use `accent` for a single primary
  action, active state, or focus ring per view. Never fill large areas with it.
  Text on orange is `on-accent` (near-black), never white.

## Typography

Industrial and legible. `display` (Space Grotesk, tight tracking) for headings,
`body` (system) for prose, `mono` (Space Mono) for specs, labels, and numeric
readouts — the "engraved on the tool" voice. Reserve **gradient text** (top-lit →
bottom-shadowed) for a single hero word; body text stays solid for legibility.

## Layout

Generous negative space around few, precise elements. Align to an 8px grid
(`spacing`). Let a key element **overlap** a section boundary or its parent to
establish layers (see Depth). Max content width ~1080px.

## Elevation & Depth

Depth is the signature of this system, so it gets the most rules. The model:
**light comes from above (top), skewed slightly left.** Highlights sit on top edges,
shadows fall below. Two orthogonal axes:

1. **Curvature** — does a surface bulge toward you (*convex*, raised/actionable) or
   recede (*concave*, a well/receptacle)? Built with **inset** shadows: a hand-mixed
   highlight on the top-left, a hand-mixed shadow on the bottom-right. Swap the two to
   flip convex ↔ concave.
2. **Elevation** — how far the whole element floats above the base plane. Built with
   **outer** shadows from the `elevation` scale. Never conflate the two.

**Aim for TINY elevation.** The default raised affordance is `elevation.hair`: a
1px hand-picked light top edge + a single tight, **sharp** (near-zero blur) shadow
directly below — a milled lip catching the light. The border is lighter than the
shadow beneath it; that pairing is what sells "raised." Reach for `mid`/`high` only
for genuinely floating UI (dropdowns, modals).

Rules:

- **One light source.** Top, skewed left. Every highlight agrees; no exceptions.
- **Hand-pick highlight/shadow colours from the surface** (`color-mix` toward
  white/black). Never overlay raw semi-transparent white — it desaturates the metal.
- **Give the light a real gap.** The curve reads only as strongly as the highlight
  differs from the surface. On dark metal the *highlight* must be genuinely bright.
- **Two-part shadows.** Pair a tight dark ambient/contact shadow with a softer direct
  shadow; fade the tight one out as elevation rises. Offset is height, blur is
  roundness — keep both tiny for machined parts.
- **Cut the seam.** Solid controls get a 1px border slightly darker than both face
  and panel — the parting line of a mounted component. 1px only; it's a gap, not an
  outline.
- **Press = move down Z.** Convex → concave (and/or `translateY(1px)`); a raised
  button drops to a smaller/no shadow when active.
- **Glow means live.** `elevation.glow` (orange ring + bloom) marks focus/primary
  only — light emission pulls it forward. One glow per view.
- **Overlap for layers.** Offset a card across a background seam, or make it taller
  than its parent so it laps both edges. Give overlapping images an "invisible
  border" in the background colour so they never clash.
- **Texture is a whisper.** A faint brushed-metal grain adds material depth; if you
  can clearly see the lines, it's too strong.

## Shapes

Rounded but not soft: `sm (8px)` for controls, `lg (16px)` for cards, `pill` for
toggles and chips. Rounder corners read more convex — match shadow softness to the
radius. Bevel key edges with a **gradient border** (light top → dark bottom).

## Components

- **button-primary** — orange, `on-accent` text, `elevation.hair` at rest, sinks
  (`translateY(1px)`, shadow removed) on `:active`. The one glowing element when it's
  the main action.
- **button-secondary** — raised titanium, no fill; `elevation.hair`.
- **input** — `concave` / sunken well (`surface-sunken`), inset top shadow + lit
  bottom lip. Focus adds the orange glow ring.
- **card** — `surface`, `rounded.lg`, `elevation.low`; may overlap a section seam.
- **toggle** — concave track holding a convex knob; knob glows orange when on.

## Do's and Don'ts

- ✅ Keep elevation tiny and consistent — a fixed 5-step ladder, mostly `hair`/`low`.
- ✅ Derive shadow/highlight colours from the surface; keep one light direction.
- ✅ Let exactly one orange element glow per view.
- ✅ Rebalance depth for dark mode (highlight leads) without changing light direction.
- ❌ Don't stack big soft drop-shadows on resting content — that's not this system.
- ❌ Don't use raw `rgba(255,255,255,x)` highlights or pure-black shadows on tints.
- ❌ Don't fill large areas with orange, or put white text on it.
- ❌ Don't mix light directions, or make texture/gradients loud enough to notice first.
