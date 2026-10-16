---
title: "Pages and components"
description: "The pages the module mounts out of the box, the components they wrap, and the customization ladder from CSS tokens to your own page."
kind: landing
playground: /playground/vanilla/pricing
source: src/runtime/vue/components
navigation:
  title: Overview
  icon: i-lucide-compass
---

Install the module and seven pages exist with no files to write: `/login`, `/pricing`, `/settings`, `/profile`, `/security`, `/accept-invitation` and `/oauth/consent`. Each one is a thin wrapper around a single auto-imported component, such as `<AuthForm>` or `<PricingTable>`, styled by the module's neutral stylesheet. This section covers which pages mount and how the `pages` module option moves them, then how to change what they look like and say, up to replacing a page outright.

## How it fits together

When a page no longer fits, you climb the customization ladder one rung at a time. Every rung keeps the packaged behavior, so you replace only what you outgrow and there is nothing to eject.

1. **[CSS tokens](/docs/ui/customize/theming)**: override the shared `--bk-*` custom properties to re-theme every component at once, or style the `data-*` hooks on each element directly.
2. **[`app.config` content](/docs/ui/customize/labels)**: set the plan catalog, brand and labels in `appConfig.backend`. It is typed and reactive, and names and prices still resolve live from billing.
3. **[Slots](/docs/ui/customize/slots)**: keep the packaged component and replace only the regions you care about. Every slot receives the composable state the component runs on.
4. **[Route shadowing](/docs/ui/customize/replace-pages)**: put an app page at the same path. The module detects it, skips its own page and logs the override.
5. **[Composables](/docs/ui/customize/replace-pages#build-from-composables)**: drop the component and build a fully custom page on the same composables the packaged one uses.

Props, emits and slots for every component the module registers are listed in [Composables › Auto-registered components](/docs/reference/nuxt/composables#auto-registered-components).

## In this section

::card-group
  :::card{icon="i-lucide-layout-template" title="Default Pages" to="/docs/ui/pages"}
  Which routes the module mounts, who can open them, the component behind each, and how search engines treat them.
  :::

  :::card{icon="i-lucide-palette" title="Customization" to="/docs/ui/customize"}
  Each rung of the ladder in depth: the token table and `data-*` families, the `appConfig.backend` shape, slots, props and route shadowing.
  :::
::

## See them running

The playground's Vanilla pages show the packaged components with the untouched defaults. The [SaaS demo pages](/playground/saas/pricing) show the same components under the site's own palette, re-themed with one token bridge.
