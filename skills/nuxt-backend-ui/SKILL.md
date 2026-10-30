---
name: nuxt-backend-ui
description: The packaged UI of a Nuxt app on nuxt-backend and how to customize it, in order of reach. The --bk-* tokens on :root in @layer nuxt-backend and the data-* hooks, every word as a label in appConfig.backend, translation with @nuxtjs/i18n, slots, swapping a part by its registered name, headless composables with bind and #backend/a11y, npx nuxt-backend eject, css false and pages.<key> false. Use when restyling, rewording, translating or rearranging the packaged pages and components (sign-in, pricing, settings, profile, security, admin), or replacing one with your own. Read the nuxt-backend core skill first.
---

# nuxt-backend: UI and customization

The module mounts its pages and auto-imports its components, each a `.vue` file built from
named parts. Customize them with the smallest step that reaches what you want, in this order;
each step keeps everything below it upgrading with the package. The `nuxt-backend` core skill
holds the rules every change follows. The package depends on no UI library and brings no theme
bridge: put any kit's components in slots, parts or your own markup.

## Customizing, in order of reach

1. **Tokens**: the `--bk-*` custom properties sit on `:root` inside `@layer nuxt-backend`, so
   an override on `:root` in any app stylesheet re-themes every component, with no specificity
   to match. A family root (`[data-pricing='table']`) scopes a change; state is `data-state`,
   `data-disabled`, `data-invalid`, `data-loading`. Declare `color-scheme` yourself: the
   tokens are `light-dark()` pairs. Put resets in `@layer reset`, never unlayered.
2. **Labels**: `appConfig.backend` holds the brand, the plan catalog copy and the labels:
   every word a packaged component or page renders, as `labels.<group>.<key>`. A component's
   `labels` prop overrides its group for one placement. To translate, add `@nuxtjs/i18n` and
   write `backend.<group>.<key>` messages per locale; never hard-code copy around a packaged
   component. In your own UI, `useLabels(group)` gives the same copy and `errorMessage(error)`,
   and `useBackendPagePath('pricing')` links to a packaged page in the active locale (`null`
   when the page is off).
3. **Slots**: keep a packaged component and replace one region of one placement, such as
   `<PricingTable>`'s `plan-action` or `<AuthForm>`'s `verify-code` step. Every slot is typed.
4. **Swap a part**: an app component named like a part (`app/components/PricingPlanCard.vue`)
   replaces it everywhere, packaged pages included, and its packaged CSS stops loading. Type its
   props with `#backend/parts` (`PricingPlanCardProps`): the parent's composable (`pricing`,
   `flow`, …) and the item (`plan`). Spread the composable's `bind` bags and keep the part's
   `data-*` hook. `doctor`'s `name-collisions` lists every swapped part.
5. **Pages**: `backend.pages` in `nuxt.config` moves a page (`pricing: '/plans'`) or turns it off
   (`pricing: false`). An app page at a packaged path replaces it; it declares its own
   `definePageMeta({ auth })` guard, which the path does not carry.
6. **Headless**: build your own markup on the composables the parts use (`useLoginFlow`,
   `usePricing`, …), spreading their `bind` (`flow.bind.codeInput`,
   `pricing.bind.planAction(plan)`). `#backend/a11y` exports `useActionState`,
   `useFocusReturn` and `useLiveRegion` for controls of your own.
7. **Eject**: `npx nuxt-backend eject <Part>`, `page:<key>` or `email:<name>` copies the
   source in, stamped with the version; `npx nuxt-backend upgrade --diff <name>` shows what
   changed upstream since. It never rewrites an ejected file.

`backend: { css: false }` loads no package CSS at all: the components keep their markup,
`data-*` hooks and accessibility, unstyled.

## The component contract

Every packaged component keeps one contract: a `data-<family>` hook on each element, a state for
loading, empty, failed, busy and refused, and named, announced controls. A slot, a part or a page
you write keeps that region's accessibility:

- name buttons by their words, and put a repeated one in a group named by what it acts on
  (`aria-labelledby`);
- keep focus on a busy control (`aria-disabled`, not `disabled`) and say what it waits for;
- announce loading and empty as a status and a failure as an alert.

See https://nuxt-backend.dev/docs/reference/components,
https://nuxt-backend.dev/docs/reference/components/parts and
https://nuxt-backend.dev/docs/build/ui/accessibility.

## Tasks

<!-- generated:tasks -->
- [Build the app shell](https://nuxt-backend.dev/docs/build/ui/app-shell): Wrap your signed-in pages in `<AppShell>`: a header with your brand, the workspace switcher, the notification bell and the account menu, the app-wide notices, and your page in the main landmark.
- [Show parts of a page to the right people](https://nuxt-backend.dev/docs/build/ui/gate): Show a region only to someone signed in, with a role, in a workspace, on a plan with a feature, or with room left on a quota, with `<Gate>` and its fallback slot. One component replaces the four boundaries.
- [Show app-wide notices](https://nuxt-backend.dev/docs/build/ui/notices): Place `<BackendNotices>` once in your layout for every notice the backend raises: an administrator's visit, maintenance, a past-due payment, a scheduled account deletion, low credits, a gift to claim and announcements, each replaceable through a named slot.
- [Restyle with tokens](https://nuxt-backend.dev/docs/build/ui/customize/tokens): Re-theme every packaged component with the --bk-* tokens on :root inside @layer nuxt-backend, scope a change to one family, follow light and dark, and style state through the data-* hooks.
- [Change copy and labels](https://nuxt-backend.dev/docs/build/ui/customize/labels): Set the plan catalog copy and the brand, and override any word a packaged component or page renders, from app config or per component. Reach for `useLabels()`.
- [Translate the UI](https://nuxt-backend.dev/docs/build/ui/customize/translation): Translate every packaged page and component with @nuxtjs/i18n: backend.* messages per locale, placeholders and plurals, dates and money in the active locale, and localized page paths. Russian, German, Spanish and French come with the package. Reach for `useLabels()`.
- [Customize with slots](https://nuxt-backend.dev/docs/build/ui/customize/slots): Keep a packaged component and replace only the regions you care about, with the state and actions it runs on, and set its props and listen to its events.
- [Swap a part](https://nuxt-backend.dev/docs/build/ui/customize/parts): Replace one part of the packaged UI everywhere with an app component of the same name, packaged pages included, or replace a whole page with your own at its path.
- [Build on the composables](https://nuxt-backend.dev/docs/build/ui/customize/headless): Build your own markup on the composables the packaged UI runs on: state, actions and bindings that carry the accessibility attributes and handlers, the helpers from #backend/a11y, and any UI library around them.
- [Eject a part, page or email](https://nuxt-backend.dev/docs/build/ui/customize/eject): Copy a packaged part, page or email into your app to own its source, with the version stamp that lets upgrade show what changed upstream.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the composables of this area with their doc
comments' first sentences. Labels: https://nuxt-backend.dev/docs/build/ui/customize/labels, and
translation: https://nuxt-backend.dev/docs/build/ui/customize/translation.
