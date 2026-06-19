import { defineApp, type AppDefinition, type EnvDefinition } from 'convex/server'
import { v } from 'convex/values'

/**
 * Environment variables the bundled components read. All optional, so a deploy
 * validates while unconfigured features stay graceful no-ops (billing returns
 * `null`, email logs instead of sending, …).
 *
 * Pass these straight to `defineApp({ env: backendEnv })`. Spread in your own to
 * extend: `defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.
 */
export const backendEnv = {
  // Auth (Better Auth)
  BETTER_AUTH_SECRET: v.optional(v.string()),
  SITE_URL: v.optional(v.string()),
  // Email (Resend) — forwarded by reference to the nested `backend` component.
  RESEND_API_KEY: v.optional(v.string()),
  RESEND_FROM: v.optional(v.string()),
  RESEND_TEST_MODE: v.optional(v.string()),
  RESEND_WEBHOOK_SECRET: v.optional(v.string()),
  // Billing (Polar)
  POLAR_ORGANIZATION_TOKEN: v.optional(v.string()),
  POLAR_WEBHOOK_SECRET: v.optional(v.string()),
  POLAR_SERVER: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
} satisfies EnvDefinition

/** An app definition whose env declares at least the {@link backendEnv} vars. */
type BackendApp = AppDefinition<typeof backendEnv>

/** A component definition (the default export of a `convex.config`). */
type ComponentDef = Parameters<BackendApp['use']>[0]

/**
 * The bundled component definitions, imported in your `convex.config.ts` and
 * handed to {@link installBackend}.
 *
 * Convex builds its component tree from the `import … from '…/convex.config'`
 * statements in your **app's** `convex.config.ts`, so those imports must live
 * there — but the wiring (env declaration, the email env-forwarding to the
 * nested Resend component, and the `app.use(...)` calls) is all done for you.
 */
export interface BackendComponents {
  /** `nuxt-backend/convex/component/convex.config` (Better Auth + nested Resend). */
  backend: ComponentDef
  /** `@convex-dev/aggregate/convex.config`. */
  aggregate: ComponentDef
  /** `@convex-dev/migrations/convex.config`. */
  migrations: ComponentDef
  /** `@convex-dev/polar/convex.config`. */
  polar: ComponentDef
  /** `@convex-dev/rate-limiter/convex.config`. */
  rateLimiter: ComponentDef
  /** `@convex-dev/workflow/convex.config`. */
  workflow: ComponentDef
}

/**
 * Mount every bundled component onto your app definition and forward the email
 * env to the nested Resend component — the whole `convex.config.ts` wiring in one
 * call.
 *
 * You import the component definitions in your `convex.config.ts` (Convex
 * resolves its component tree from those imports) and pass them in; everything
 * else is handled. Returns the app, so you keep full control — mount your own
 * components or read env refs afterwards.
 *
 * @example The entire `convex.config.ts`:
 * ```ts
 * import { defineApp } from 'convex/server'
 * import { backendEnv, installBackend } from 'nuxt-backend/convex/app'
 * import backend from 'nuxt-backend/convex/component/convex.config'
 * import aggregate from '@convex-dev/aggregate/convex.config'
 * import migrations from '@convex-dev/migrations/convex.config'
 * import polar from '@convex-dev/polar/convex.config'
 * import rateLimiter from '@convex-dev/rate-limiter/convex.config'
 * import workflow from '@convex-dev/workflow/convex.config'
 *
 * const app = defineApp({ env: backendEnv })
 * installBackend(app, { backend, aggregate, migrations, polar, rateLimiter, workflow })
 * export default app
 * ```
 *
 * @example Full control — extra env and your own components:
 * ```ts
 * const app = defineApp({ env: { ...backendEnv, STRIPE_SECRET_KEY: v.optional(v.string()) } })
 * installBackend(app, { backend, aggregate, migrations, polar, rateLimiter, workflow })
 * app.use(myOwnComponent)
 * export default app
 * ```
 */
export function installBackend<App extends BackendApp>(app: App, components: BackendComponents): App {
  app.use(components.backend, {
    env: {
      RESEND_API_KEY: app.env.RESEND_API_KEY,
      RESEND_FROM: app.env.RESEND_FROM,
      RESEND_TEST_MODE: app.env.RESEND_TEST_MODE,
      RESEND_WEBHOOK_SECRET: app.env.RESEND_WEBHOOK_SECRET,
    },
  })
  app.use(components.aggregate)
  app.use(components.migrations)
  app.use(components.polar)
  app.use(components.rateLimiter)
  app.use(components.workflow)
  return app
}

/**
 * One-call Convex app definition: declares the standard {@link backendEnv}
 * variables and mounts every bundled component. The cleanest `convex.config.ts`
 * — import the component definitions (Convex resolves its component tree from
 * those imports) and hand them over.
 *
 * Returns the `app`, so you keep full control: mount your own components or read
 * env refs afterwards.
 *
 * @example The entire `convex.config.ts`:
 * ```ts
 * import { defineBackendApp } from 'nuxt-backend/convex/app'
 * import backend from 'nuxt-backend/convex/component/convex.config'
 * import aggregate from '@convex-dev/aggregate/convex.config'
 * import migrations from '@convex-dev/migrations/convex.config'
 * import polar from '@convex-dev/polar/convex.config'
 * import rateLimiter from '@convex-dev/rate-limiter/convex.config'
 * import workflow from '@convex-dev/workflow/convex.config'
 *
 * export default defineBackendApp({ backend, aggregate, migrations, polar, rateLimiter, workflow })
 * ```
 *
 * @example Full control — extra env and your own components:
 * ```ts
 * const app = defineBackendApp(components, { env: { STRIPE_SECRET_KEY: v.optional(v.string()) } })
 * app.use(myOwnComponent)
 * export default app
 * ```
 */
export function defineBackendApp<Env extends EnvDefinition = Record<never, never>>(
  components: BackendComponents,
  options?: { env?: Env },
): AppDefinition<typeof backendEnv & Env> {
  const app = defineApp({ env: { ...backendEnv, ...options?.env } })
  installBackend(app as BackendApp, components)
  return app as AppDefinition<typeof backendEnv & Env>
}
