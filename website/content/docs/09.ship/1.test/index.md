---
title: Testing
description: Register the packaged backend component in convex-test.
navigation:
  icon: i-lucide-flask-conical
---

Use `nuxt-backend/test` to register the packaged `backend` component when testing your Convex functions with [`convex-test`](https://docs.convex.dev/testing/convex-test).

```ts [backend/functions.test.ts]
import { convexTest } from 'convex-test'
import backendTest from 'nuxt-backend/test'
import { components } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const t = convexTest(schema, modules)
backendTest.register(t)

// Your own functions, and the component's, through the boundary:
await t.query(components.backend.billing.getByUser, { userId: 'user_1' })
```

`register(t)` mounts the all-in-one `backend` component into the test harness the way `app.use(backend)` does — under its name, with its real schema (so every index and document validator applies), and with the email provider child registered beneath it at `backend/resend` — so functions that read auth tables, send email, or call `components.backend.adapter.*` / `components.backend.email.*` / `components.backend.billing.*` / `components.backend.gifts.*` / `components.backend.webhooks.*` / `components.backend.ai.*` resolve correctly under test.

```ts
function register(
  t: TestConvex<SchemaDefinition>,
  name?: string, // the mount name from convex.config.ts, default 'backend'
): void
// default export: { register, schema, modules }
```

The helper is the same shape every `@convex-dev/*` component ships, so `convex-test` needs nothing extra: `convex-test` is an optional peer of this package — install it as a dev dependency alongside `vitest` (the helper uses `import.meta.glob`, so it runs under Vitest only).

::note
The provider child's own grandchildren (its send workpools and API rate limiter) are not registered: they only run from the batch job a send schedules. Emails sent under test stay `waiting`, which is the state `cancel` and delivery-status assertions need.
::

## Testing app code

The Nuxt side needs no helper from this package: composables and components are ordinary Vue code over the base module's Convex client. The package's own tests do it with [`@nuxt/test-utils`](https://nuxt.com/docs/getting-started/testing) (see its [`vitest.config.ts`](https://github.com/qruto/nuxt-backend/blob/main/vitest.config.ts)) — a Vitest project from `defineVitestProject` with `environment: 'nuxt'` and `happy-dom` as the DOM — and `mountSuspended` for anything that calls a composable. Two facts shape those tests:

- Every read is `undefined` until its query answers — `useBilling().products`, `useCredits().balance`, and the rest — so a component has to render that state anyway, and it is the state a test without a deployment sees.
- `useAuth()` wraps `useBetterAuth` from `nuxt-convex-module/better-auth/client`. The package's own page tests ([`test/nuxt/`](https://github.com/qruto/nuxt-backend/tree/main/test/nuxt)) `vi.mock` that module and drive a `user` ref, which is the smallest way to render signed-in and signed-out states with no deployment behind them.
