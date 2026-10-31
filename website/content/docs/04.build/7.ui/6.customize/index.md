---
title: Customization ladder
description: "The seven rungs for changing the packaged UI, from mounting it as is to ejecting its source: tokens, labels, slots, swapping a part, headless composables and eject, loading no package CSS at all, and why there is no unstyled component layer."
kind: concept
capability: ui
navigation:
  title: Overview
  icon: i-lucide-palette
---

The packaged UI follows the pattern the Vue and React communities settled on: styled defaults you can mount as they are, headless state you can build any markup on, and source you can copy in when you want to own it outright. Between those three sit the small steps: tokens, labels, slots and swapping one part. You climb only as far as a change needs, and everything you did not touch keeps upgrading with the package.

## The model

| Rung | Reach for it when | You own | The package keeps | Page |
|---|---|---|---|---|
| 1. Mount | the defaults fit | nothing | everything | [Packaged pages](/docs/build/ui/pages) |
| 2. Tokens | the colours, corners or surfaces are not yours | a few CSS custom properties | markup, behaviour, words | [Restyle with tokens](/docs/build/ui/customize/tokens) |
| 3. Labels | a word, the plan copy or the language is not yours | copy in app config or i18n messages | markup and behaviour | [Change copy and labels](/docs/build/ui/customize/labels), [Translate the UI](/docs/build/ui/customize/translation) |
| 4. Slots | one region of one placement should differ | that region, with the state it receives | every other region | [Customize with slots](/docs/build/ui/customize/slots) |
| 5. Swap a part | one part should differ everywhere, packaged pages included | a component named like the part | the pages and the other parts | [Swap a part](/docs/build/ui/customize/parts) |
| 6. Headless | none of the packaged markup fits | all the markup | state, actions, bindings and accessibility helpers | [Build on the composables](/docs/build/ui/customize/headless) |
| 7. Eject | you want the source itself | a copy of the part, page or email, stamped with its version | the composables underneath | [Eject a part, page or email](/docs/build/ui/customize/eject) |

`css: false` in the module options sits beside the ladder: it loads no package CSS at all. The components keep their markup, `data-*` hooks and behaviour, and your stylesheet does the rest. Use it when your design system styles everything, or when you build only on the composables.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  backend: { css: false },
})
```

## Why it works this way

A packaged page carries more than its looks: who may press which button, what a refusal says, where focus goes, what a busy button announces. Each rung moves one of those duties from the package to you, and no more. A token keeps all of them with the package; a slot hands you one region; a swapped part hands you one part everywhere; a headless page hands you the markup but keeps the state and the accessibility attributes in its bindings. Only eject hands you the source, and even then `upgrade` tells you what changed upstream.

The styled defaults are `.vue` components, and their CSS sits in one cascade layer, `@layer nuxt-backend`, with the tokens on `:root`. Any rule of yours outside that layer wins without a specificity fight, and the package CSS loads only for the capabilities your app uses.

**Why there is no unstyled component layer.** Libraries used to ship three tiers: styled components, unstyled components with the same markup, and hooks. The middle tier has been dropped across the ecosystem. Clerk deprecated its headless Clerk Elements in favour of hooks, Supabase stopped maintaining its Auth UI and moved to a copy-in registry, and Better Auth UI and shadcn-vue install through registries too (checked on 2026-10-25). An unstyled component still fixes your markup, so it rarely fits a design system better than a styled one with `css: false`, and it doubles what must stay accessible. nuxt-backend ships the two ends that hold up, styled defaults and headless composables with bindings, plus `eject` for copy-in source.

## What it is not

- **Not tied to a UI library.** The package depends on none and works next to any of them; there is no theme bridge for a particular kit. Put your library's components in slots, swapped parts or headless pages.
- **Not a fork.** Nothing below eject copies source, so an upgrade reaches every rung you did not take.
- **Not a page builder.** Packaged pages are fixed compositions of parts. A page with a different structure is your own page, built on the components or the composables.

The [Roadmap](/docs/start/roadmap) lists what waits for later releases.

## What this means for you

- Start by mounting the packaged pages, and take the lowest rung that does the job.
- Before a slot, check whether a token or a label says it; before swapping a part, check whether a slot does.
- When you take a rung from slots upward, keep that region's [accessibility](/docs/build/ui/accessibility#what-a-replacement-must-keep), and on your own page its [guard](/docs/build/auth/access/pages).
- Run `npx nuxt-backend doctor`: it names every app component or composable that shares a name with one of the package's, so you see which parts you swapped.

::card-group
  :::card{icon="i-lucide-paintbrush" title="Restyle with tokens" to="/docs/build/ui/customize/tokens"}
  `--bk-*` tokens on `:root` in `@layer nuxt-backend`, and the `data-*` state hooks.
  :::

  :::card{icon="i-lucide-type" title="Change copy and labels" to="/docs/build/ui/customize/labels"}
  `appConfig.backend`: the plan catalog copy, the brand and every label.
  :::

  :::card{icon="i-lucide-languages" title="Translate the UI" to="/docs/build/ui/customize/translation"}
  `@nuxtjs/i18n` messages for every packaged page and component.
  :::

  :::card{icon="i-lucide-puzzle" title="Customize with slots" to="/docs/build/ui/customize/slots"}
  Keep a packaged component and replace one region.
  :::

  :::card{icon="i-lucide-replace" title="Swap a part" to="/docs/build/ui/customize/parts"}
  A component named like a part replaces it everywhere; your own page replaces a packaged one.
  :::

  :::card{icon="i-lucide-code" title="Build on the composables" to="/docs/build/ui/customize/headless"}
  State, actions and bindings for your own markup, with `#backend/a11y`.
  :::

  :::card{icon="i-lucide-log-out" title="Eject a part, page or email" to="/docs/build/ui/customize/eject"}
  Copy the source into your app with a version stamp, and upgrade it with a diff.
  :::
::
