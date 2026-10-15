---
title: Configuration
description: "Where each setting lives: the module options in nuxt.config.ts, the environment variables, and the app config content layer."
kind: reference
navigation:
  icon: i-lucide-settings-2
---

All options have sensible defaults, and environment variables are picked up automatically. The minimal config is just the module:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

Three places configure an app, each with one page:

::card-group
  :::card{icon="i-lucide-settings" title="Module options" to="/docs/reference/configuration/module-options"}
  The `backend` key in `nuxt.config.ts`: every option, its default, and the runtime config the module publishes.
  :::

  :::card{icon="i-lucide-key-round" title="Environment variables" to="/docs/reference/configuration/environment-variables"}
  What `.env.local` holds, the variables the deployment declares, and how `env push` sets them.
  :::

  :::card{icon="i-lucide-palette" title="App config" to="/docs/ui/customize"}
  `appConfig.backend`: the plan catalog, labels and brand the packaged pages read.
  :::
::

The auth route is configured in [Auth setup](/docs/auth/setup#auth-route-and-options), where the
three places it has to match are listed together.
