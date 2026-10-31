---
title: "Pages and components"
description: "The UI every capability ships with: packaged pages, the app shell, one gate and one notices region, styled defaults on tokens, headless composables with bindings, copy-in source, and an accessibility contract to WCAG 2.2 AA."
kind: landing
playground: /playground/pricing
navigation:
  title: Overview
  icon: i-lucide-compass
---

Every capability of the backend comes with its UI. Install the module and your app has sign-in, pricing, settings, profile, security and an admin console, with nothing to write. The same parts are components you place in your own pages, and composables you can build any markup on. Nuxt gives you pages, layouts and components; the package adds the pages and components a client app needs, styled defaults you restyle with tokens, headless state with accessibility bindings, and source you can eject.

## What you get

- **[Packaged pages](/docs/build/ui/pages)**, each at a path its `pages` key sets, moved with a string or turned off with `false`, with the route rules a private page needs.
- **[The app shell](/docs/build/ui/app-shell)**: `<AppShell>` puts your brand, the workspace switcher, the notification bell and the account menu around your pages.
- **[One gate](/docs/build/ui/gate)**: `<Gate>` shows a region only to someone signed in, with a role, in a workspace, with a plan's feature or with room on a quota.
- **[One notices region](/docs/build/ui/notices)**: `<BackendNotices>` shows an administrator's visit, maintenance, a past-due payment, low credits, a gift to claim and the rest, most important first.
- **Styled defaults**: `.vue` components themed by `--bk-*` tokens on `:root` inside `@layer nuxt-backend`, with state as `data-*` attributes. The CSS loads only for the capabilities you use, and `css: false` loads none.
- **Headless composables**: state, actions and bindings that carry the accessibility attributes, plus the helpers in `#backend/a11y`.
- **Every word a label**, changed in app config or translated with `@nuxtjs/i18n`, the emails included.
- **[An accessibility contract](/docs/build/ui/accessibility)** to WCAG 2.2 AA that every component keeps and the package's tests hold it to.

## How it works

A packaged page is a thin wrapper around one component, inside one shared frame: the `<main>` landmark, the title and `h1` from its labels, the notices region, and a status region for the connection. The component is built from named parts and reads the same composables you would (`useLoginFlow`, `usePricing`, `useWorkspace` and the rest). Every element carries a `data-*` attribute that the stylesheet and your CSS select.

What a component shows follows what the server allows. A member who manages no billing sees no checkout button, a signed-out visitor gets a sign-in link, and a page guard answers with a 403 that renders `<AccessDenied>`. The pricing page renders on the server from the live catalog, so its prices cannot drift from what checkout charges.

The components lean on the platform: a native `<dialog>` for the confirm-it's-you prompt, the native popover for the shell's menus, radios in a fieldset for the monthly and yearly switch, and `Intl` for every date and amount in the reader's locale. The package depends on no UI library and works next to any of them.

## Change what you outgrow

Take the lowest rung that does the job. Each keeps everything above it with the package:

| Rung | You change | Page |
|---|---|---|
| 1. Mount | nothing | [Packaged pages](/docs/build/ui/pages) |
| 2. Tokens | colours, radii and surfaces, everywhere at once | [Restyle with tokens](/docs/build/ui/customize/tokens) |
| 3. Labels | any word, in any language | [Change copy and labels](/docs/build/ui/customize/labels), [Translate the UI](/docs/build/ui/customize/translation) |
| 4. Slots | one region of one placement | [Customize with slots](/docs/build/ui/customize/slots) |
| 5. Swap a part | one part everywhere, or a whole page | [Swap a part](/docs/build/ui/customize/parts) |
| 6. Headless | all the markup, on the composables' bindings | [Build on the composables](/docs/build/ui/customize/headless) |
| 7. Eject | the source of a part, page or email | [Eject a part, page or email](/docs/build/ui/customize/eject) |

[The customization ladder](/docs/build/ui/customize) explains how to choose, and why there is no unstyled component layer.

## In development and in production

- **In development** the pages run against your dev deployment and the providers' test modes: sign in with a code from the terminal, and buy a plan in the billing sandbox with a test card ([Develop on real sandboxes](/docs/develop/sandboxes)).
- **In production** there is nothing to switch on. Private pages stay out of search indexes, sitemaps and caches at their paths ([Caches](/docs/build/ui/pages#caches)).
- **Contrast.** The default colours pass WCAG 2.2 AA in the light and the dark scheme; colours of your own must too ([Accessibility](/docs/build/ui/accessibility#what-this-means-for-you)).

The demo mounts the module's pages next to Panels: [pricing](/playground/pricing), [settings](/playground/settings), [profile](/playground/profile), [security](/playground/security) and [gifts](/playground/gifts).

## The inventory

What the package ships for this part of the app today, generated from the code: each name links to its reference entry.

::what-you-get{area="ui"}
::

## In this section

::card-group
  :::card{icon="i-lucide-layout-template" title="Packaged pages" to="/docs/build/ui/pages"}
  Every page, its key and guard, the frame, and how to move one or turn it off.
  :::

  :::card{icon="i-lucide-panel-top" title="Build the app shell" to="/docs/build/ui/app-shell"}
  `<AppShell>`: your brand, the workspace switcher, the bell and the account menu.
  :::

  :::card{icon="i-lucide-door-open" title="Show parts of a page to the right people" to="/docs/build/ui/gate"}
  `<Gate>` for a sign-in, a role, a workspace, a plan's feature or a quota.
  :::

  :::card{icon="i-lucide-megaphone" title="Show app-wide notices" to="/docs/build/ui/notices"}
  `<BackendNotices>`: every notice the backend raises, in one region.
  :::

  :::card{icon="i-lucide-accessibility" title="Accessibility" to="/docs/build/ui/accessibility"}
  What the components guarantee under WCAG 2.2 AA, and what a replacement keeps.
  :::

  :::card{icon="i-lucide-palette" title="Customize" to="/docs/build/ui/customize"}
  The ladder from tokens to ejected source, one page per rung.
  :::
::
