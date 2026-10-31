---
title: Test your app
description: "Which test fits which change: backend functions in convex-test, pages over a mock backend, the real app end to end with Playwright, all of it in CI, and a load test before launch."
kind: how-to
capability: tools
related:
  - /docs/develop/testing/functions
  - /docs/develop/testing/pages
  - /docs/develop/testing/e2e
navigation:
  title: Testing
  icon: i-lucide-flask-conical
---

Test each change at the lowest level that can catch its bug. Most tests run with no deployment and no provider, in milliseconds. A few drive the real app on the providers' test modes.

- **What powers it natively:** Vitest, Convex's `convex-test`, `@nuxt/test-utils`, Playwright, and the providers' test modes: Resend's test addresses and Polar's sandbox.
- **What the package adds:** `nuxt-backend/test` signs callers in for `convex-test`, `nuxt-backend/test-utils` puts a mock backend under your pages, and `npx nuxt-backend inbox --json` hands an end-to-end test its sign-in code.

## Pick the level

| You changed | Test it with | Needs | Page |
|---|---|---|---|
| A query, a mutation or an action | `convex-test`, signed in as a person in a workspace | Nothing | [Test backend functions](/docs/develop/testing/functions) |
| A page or a component | A mock backend and session in Vitest | Nothing | [Test pages over a mock backend](/docs/develop/testing/pages) |
| An email's wording or language | `renderEmail` | Nothing | [Test your emails](/docs/develop/testing/pages#test-your-emails) |
| A flow across pages, sign-in or a purchase | Playwright, on a dev deployment | A Resend key in test mode, a Polar sandbox token | [Run end-to-end tests](/docs/develop/testing/e2e) |
| Anything, before it merges | All of the above on every pull request | Two CI secrets, for end to end | [Check every change in CI](/docs/develop/testing/ci) |
| The busiest paths, before launch | k6, on a deployment made for the test | A Convex project for the test | [Load-test before launch](/docs/develop/testing/load) |
| Code style in `backend/` | Convex's lint rules | Nothing | [Lint backend functions](/docs/develop/testing/linting) |

## One Vitest config for both

Function tests run in Convex's edge runtime, and page tests in a Nuxt environment. Give each its own project in one config, so `npx vitest run` runs both:

```ts [vitest.config.ts]
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { backendTestAliases } from 'nuxt-backend/test-utils'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend',
          include: ['backend/**/*.test.ts'],
          environment: 'edge-runtime',
        },
      },
      await defineVitestProject({
        resolve: { alias: backendTestAliases() },
        test: {
          name: 'app',
          include: ['test/app/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
        },
      }),
    ],
  },
})
```

Each page lists what to install for its half. Playwright keeps its own config and runs with `npx playwright test`.

## Why most tests need no provider

A test that calls Polar or Resend is slow, needs a key and can fail for reasons outside your code. So the function and page tests replace the deployment: `convex-test` runs your functions in memory, and the mock answers your pages. The end-to-end suite is the one place a run crosses a provider, and the providers' test modes keep it from sending real mail or taking real money.

The test helpers are experimental ([Stability](/docs/ship/releases/stability#the-experimental-tier)): they follow the auth and billing flows, which may still move.

## Related

- [Test backend functions](/docs/develop/testing/functions): `convex-test` with the package's components.
- [Test pages over a mock backend](/docs/develop/testing/pages): every state a page can be in.
- [Run end-to-end tests](/docs/develop/testing/e2e): Playwright, codes from the dev inbox, the test card.
- [Develop on real sandboxes](/docs/develop/sandboxes): the providers' test modes the end-to-end suite uses.
