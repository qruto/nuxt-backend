---
title: Configuration
description: "Where each setting lives, as to change X, edit Y: the module options, the environment, the app config, the labels, the backend files and the catalog."
kind: reference
navigation:
  icon: i-lucide-settings-2
---

Every setting has a default, and the env is read on its own, so the smallest config is the module alone. To change one thing, find it in the table below: it names the file to edit and the page that lists every setting that file holds.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

| To change | Edit | Reference |
|---|---|---|
| The deployment's URL, the auth route, where pages mount or whether they do, the redirect after sign-in, the DevTools tab, whether the package CSS loads | `backend` in `nuxt.config.ts` | [Module options](/docs/reference/configuration/module-options) |
| Secrets, the app's origin, provider keys, the kind of deployment (`BACKEND_ENVIRONMENT`) | `.env.local`, then `npx nuxt-backend env push` | [Environment variables](/docs/reference/configuration/environment-variables) |
| The plan cards, the brand, any word on a page | `backend` in `app.config.ts` | [App config](/docs/reference/configuration/app-config) |
| One word, or a translation | `labels` in `app.config.ts`, or `@nuxtjs/i18n` messages | [Labels](/docs/reference/configuration/labels) |
| Auth, billing, email, AI, access tiers and routes | The files in `backend/` | [Project files](/docs/reference/configuration/project-files) |
| Plans, packs, meters and features | `backend/billing.catalog.ts`, then `billing sync` | [Catalog files](/docs/reference/configuration/catalogs) |

In `0.2.0` the module takes six options, `css` among them, and the env holds about fifteen names. The options `siteUrl`, `autoEnv`, `scaffold` and `mcp` go, and so do the eight variables that each said what kind of deployment this is: `BACKEND_ENVIRONMENT` replaces them (ENV). A capability turns on when its env or its catalog exists, so no setting switches one on or off. Each path is declared once, in `nuxt.config`: the module carries the ones the backend links to into `paths.generated.ts` in the functions directory ([The paths file](/docs/reference/configuration/module-options#the-paths-file)).

The auth route is configured in [Auth setup](/docs/build/auth/setup#auth-route-and-options), which lists the three places it has to match.
