import { defineApp, type AppDefinition, type EnvDefinition } from 'convex/server'
import { v } from 'convex/values'
// The bundled component definitions. Convex discovers its component tree by
// intercepting every import whose specifier contains `convex.config` while
// bundling the app's `convex.config.ts` — at ANY depth of the import graph,
// including right here inside the package. That is what makes the zero-import
// consumer config possible: `export default defineBackendApp()`.
//
// ⚠️ These import specifiers must stay LITERAL in `dist/convex/app.js` — the
// convex build is plain `tsc` (specifiers preserved verbatim). Never bundle or
// minify this file, or component discovery silently breaks.
import backend from './components/backend/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

/**
 * Environment variables the backend reads. All required — a deploy fails until
 * auth, email, and billing are configured, so misconfiguration surfaces at push
 * time instead of as silent no-ops in production.
 *
 * The names are service-neutral on purpose: the package hides its underlying
 * providers behind the general capability (auth, email, billing).
 *
 * `defineBackendApp` declares these for you. For a hand-written `defineApp`,
 * pass them yourself — `installBackend` reads `app.env.EMAIL_*` to forward the
 * email config, and the env proxy throws on undeclared vars:
 * `defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.
 */
export const backendEnv = {
  // Auth
  AUTH_SECRET: v.string(),
  SITE_URL: v.string(),
  // Email — forwarded by reference to the `backend` component.
  EMAIL_API_KEY: v.string(),
  EMAIL_FROM: v.string(),
  EMAIL_TEST_MODE: v.string(),
  EMAIL_WEBHOOK_SECRET: v.string(),
  // Billing
  BILLING_ACCESS_TOKEN: v.string(),
  BILLING_WEBHOOK_SECRET: v.string(),
  BILLING_ENVIRONMENT: v.union(v.literal('sandbox'), v.literal('production')),
} satisfies EnvDefinition

/** An app definition whose env declares at least the {@link backendEnv} vars. */
type BackendApp = AppDefinition<typeof backendEnv>

/** A component definition (the default export of a `convex.config`). */
type ComponentDef = Parameters<BackendApp['use']>[0]

/**
 * Every component {@link installBackend} mounts, by its dashboard name.
 *
 * Package-owned: `backend` — the all-in-one component (auth tables + adapter,
 * transactional email with the provider component nested inside, the billing
 * entitlement cache, and gift purchases).
 * Upstream `@convex-dev/*`: `aggregate`, `migrations`, `polar`, `rateLimiter`,
 * `workflow` — these operate over the app's auth/HTTP surface and can't be
 * nested inside `backend`.
 */
export type BackendComponentName
  = 'backend' | 'aggregate' | 'migrations' | 'polar' | 'rateLimiter' | 'workflow'

/**
 * Customization for {@link installBackend} / {@link defineBackendApp}. The
 * defaults mount everything — pass options only to trim or swap components.
 */
export interface InstallBackendOptions {
  /**
   * Skip mounting these upstream components. `backend` is the package's
   * all-in-one core and cannot be omitted.
   *
   * @example `defineBackendApp({ omit: ['aggregate', 'workflow'] })`
   */
  omit?: Exclude<BackendComponentName, 'backend'>[]
  /**
   * Replace a bundled component definition with your own — e.g. a locally
   * installed `backend` component (see the local-installation guide) or a fork
   * of an upstream component. Anything not listed uses the bundled definition.
   *
   * @example
   * ```ts
   * import backend from './components/backend/convex.config'
   * export default defineBackendApp({ components: { backend } })
   * ```
   */
  components?: Partial<Record<BackendComponentName, ComponentDef>>
}

/**
 * Mount the all-in-one `backend` component plus the upstream components onto
 * your app definition and forward the email env to `backend` — the whole
 * `convex.config.ts` wiring in one call. Prefer {@link defineBackendApp} unless
 * you need a hand-written `defineApp` (extra env declarations, custom
 * components).
 *
 * The component definitions are imported by this module, so your
 * `convex.config.ts` needs no component imports at all. Returns the app, so
 * you keep full control — mount your own components afterwards.
 *
 * @example A hand-written `convex.config.ts`:
 * ```ts
 * import { defineApp } from 'convex/server'
 * import { backendEnv, installBackend } from 'nuxt-backend/convex/app'
 * import { v } from 'convex/values'
 *
 * const app = defineApp({ env: { ...backendEnv, STRIPE_SECRET_KEY: v.optional(v.string()) } })
 * installBackend(app)
 * app.use(myOwnComponent)
 * export default app
 * ```
 */
export function installBackend<App extends BackendApp>(app: App, options: InstallBackendOptions = {}): App {
  const skip = new Set(options.omit ?? [])
  const defs: Record<BackendComponentName, ComponentDef> = {
    backend,
    aggregate,
    migrations,
    polar,
    rateLimiter,
    workflow,
    ...options.components,
  }
  // Components are isolated from the app's env — forward the email config by
  // reference so the deployment's values reach the component's email functions.
  app.use(defs.backend, {
    env: {
      EMAIL_API_KEY: app.env.EMAIL_API_KEY,
      EMAIL_FROM: app.env.EMAIL_FROM,
      EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
      EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
    },
  })
  for (const name of ['aggregate', 'migrations', 'polar', 'rateLimiter', 'workflow'] as const) {
    if (!skip.has(name)) app.use(defs[name])
  }
  return app
}

/**
 * One-call Convex app definition: declares the standard {@link backendEnv}
 * variables and mounts the all-in-one `backend` component (auth + email +
 * billing + gifts) plus the upstream components (`aggregate`, `migrations`,
 * `polar`, `rateLimiter`, `workflow`). The entire `convex.config.ts` is two
 * lines.
 *
 * Returns the `app`, so you keep full control: mount your own components or
 * read env refs afterwards.
 *
 * @example The entire `convex.config.ts`:
 * ```ts
 * import { defineBackendApp } from 'nuxt-backend/convex/app'
 * export default defineBackendApp()
 * ```
 *
 * @example Trim, extend, and add your own:
 * ```ts
 * import { defineBackendApp } from 'nuxt-backend/convex/app'
 * import { v } from 'convex/values'
 * import myOwnComponent from './components/mine/convex.config'
 *
 * const app = defineBackendApp({
 *   omit: ['aggregate'],
 *   env: { STRIPE_SECRET_KEY: v.optional(v.string()) },
 * })
 * app.use(myOwnComponent)
 * export default app
 * ```
 */
export function defineBackendApp<Env extends EnvDefinition = Record<never, never>>(
  options?: InstallBackendOptions & { env?: Env },
): AppDefinition<typeof backendEnv & Env> {
  const app = defineApp({ env: { ...backendEnv, ...options?.env } })
  installBackend(app as BackendApp, options)
  return app as AppDefinition<typeof backendEnv & Env>
}
