---
title: Testing
description: Test your Convex functions in convex-test, with every component the scaffold mounts and callers signed in as a person or an agent.
kind: how-to
navigation:
  icon: i-lucide-flask-conical
---

`nuxt-backend/test` sets your Convex functions up in [`convex-test`](https://docs.convex.dev/testing/convex-test) the way the deployment runs them: the packaged `backend` component and every other component the scaffold mounts, and callers who carry the claims a real session or agent token carries.

## Your app under test

`defineBackendTestApp(schema, modules)` returns a function that builds a fresh instance with every component registered under the name `convex.config.ts` mounts it by: `backend`, `aggregate`, `migrations`, `persistentTextStreaming`, `polar`, `rateLimiter` and `workflow`. Call it once per test, so no test sees another's rows. `asUser(t, options)` creates an account in the component's auth tables and returns the instance signed in as it, the way a real sign-in leaves a caller: with the role `'user'` and a personal workspace it owns and has active.

```ts [backend/todos.test.ts]
import { asUser, defineBackendTestApp, seedWorkspace } from 'nuxt-backend/test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('a member adds a todo to their workspace', async () => {
  const ada = await asUser(testApp())
  await ada.mutation(api.todos.create, { text: 'Ship it' })
})

test('everyone in the workspace is listed', async () => {
  const t = testApp()
  const workspace = await seedWorkspace(t)
  const owner = await asUser(t, { workspace, workspaceRole: 'owner' })
  await asUser(t, { workspace })
  const workspaceMembers = await owner.query(api.auth.listWorkspaceMembers, {})
  expect(workspaceMembers?.members).toHaveLength(2)
})
```

::field-group
  :::field{name="email / name" type="string"}
  The account. Default: a fresh `user-<n>@example.com`, named after it.
  :::

  :::field{name="role" type="string"}
  The app-wide role from the admin plugin, such as `'admin'`. Default: `'user'`, the role the plugin gives every new account.
  :::

  :::field{name="workspace" type="boolean | string"}
  The active workspace. Default: a personal one the user owns, made the way sign-in makes it. A workspace id (from `seedWorkspace(t)` or another `asUser`) adds them to that one instead; `false` leaves them in none, as after leaving every workspace.
  :::

  :::field{name="workspaceRole" type="string"}
  Their role there. Default: `'owner'` of their own, `'member'` of another.
  :::

  :::field{name="impersonatedBy" type="string"}
  The admin's user id, for a session an admin opened as this user.
  :::

  :::field{name="agent" type="{ clientId, scopes }"}
  Call as an agent: the claims the agent token exchange mints, and no session.
  :::
::

The caller is `t.withIdentity(...)` with the claims a real token carries. A session's are the account's fields, `role` included, plus `activeOrganizationId`, `sessionId` and `impersonatedBy`; an agent's are those the agent token exchange signs, `clientId` and `scopes` among them. The issuer is `CONVEX_SITE_URL` when the test sets it, so `tokenIdentifier` reads as in production. `requireUser`, `requireMember`, the billing entity and `listSessions` resolve exactly as they do for a real caller, and a contract test in the package keeps the claims in step with the real tokens. The caller also carries `userId`, `email`, `workspaceId` and `sessionId` for your assertions. The three helpers are experimental: the claims follow the auth flows, which may still move.

The aggregate's own batch worker isn't registered, as `@convex-dev/aggregate/test` leaves it out. A test of async aggregate writes registers it: `batchWorker.register(t, 'aggregate/batchWorker')` with `batchWorker` from `@convex-dev/batch-worker/test`.

## Register the component yourself

For a harness you build by hand, `register(t)` mounts the `backend` component alone:

```ts [backend/billing.test.ts]
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
