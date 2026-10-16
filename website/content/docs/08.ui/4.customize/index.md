---
title: Customize
description: The customization ladder — tokens, content, slots, then your own page — with one page per rung.
kind: landing
navigation:
  icon: i-lucide-palette
---

Everything the module mounts is progressively replaceable, and no rung requires ejecting: override CSS tokens, edit `appConfig.backend` content, fill a component slot, or shadow a route with your own page built on the same composables. Each rung has a page of its own, in the order to reach for them:

::card-group
  :::card{icon="i-lucide-paintbrush" title="Restyle with tokens" to="/docs/ui/customize/theming"}
  The `--bk-*` tokens re-theme every component at once; the `data-*` hooks style the markup directly.
  :::

  :::card{icon="i-lucide-type" title="Change copy and labels" to="/docs/ui/customize/labels"}
  `appConfig.backend`: the plan catalog copy, the brand and every label.
  :::

  :::card{icon="i-lucide-puzzle" title="Customize with slots" to="/docs/ui/customize/slots"}
  Keep a packaged component and replace only some regions.
  :::

  :::card{icon="i-lucide-replace" title="Replace a page" to="/docs/ui/customize/replace-pages"}
  Move a page, shadow it with your own, or rebuild it from the composables.
  :::
::
