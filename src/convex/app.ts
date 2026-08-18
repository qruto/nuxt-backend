import { defineApp, type AppDefinition, type ComponentDefinition, type EnvDefinition } from 'convex/server'
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
//
// ⚠️ The backend definition is imported through the package's own subpath
// (self-reference), NOT relatively: 2026-08 Convex backends crash evaluating
// definition bundles whose component imports resolve relatively from inside
// a package (opaque start_push 500). The subpath resolves identically in
// linked dev and published installs.
import backend from 'nuxt-backend/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

/**
 * Environment variables the backend reads, in two tiers.
 *
 * Required — a deploy fails until they are set (misconfiguration of the
 * security-critical pair must surface at push time, never at runtime):
 * `AUTH_SECRET` (session/JWT signing) and `SITE_URL` (the app origin — auth
 * base URL and every emailed link).
 *
 * Optional — the deploy succeeds and the feature degrades in a designed,
 * observable way until configured (`nuxt-backend doctor` reports each):
 * - `EMAIL_API_KEY` — sends no-op with a console warn; OTP sign-in throws
 *   loudly (set `NUXT_BACKEND_LOG_OTP=1` to echo codes to the dev console).
 * - `EMAIL_FROM` — falls back to the provider's onboarding sender.
 * - `EMAIL_TEST_MODE` — defaults to ON (anything but `'false'`).
 * - `EMAIL_WEBHOOK_SECRET` — delivery events are rejected until set.
 * - `BILLING_ACCESS_TOKEN` — billing queries return empty; checkout and other
 *   billing actions fail on invocation.
 * - `BILLING_WEBHOOK_SECRET` — billing events are rejected until set
 *   (`syncEntitlements` remains the on-demand fallback).
 * - `BILLING_ENVIRONMENT` — defaults to `'sandbox'`.
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
  // Auth — required.
  AUTH_SECRET: v.string(),
  SITE_URL: v.string(),
  // Email — optional; forwarded by reference to the `backend` component.
  EMAIL_API_KEY: v.optional(v.string()),
  EMAIL_FROM: v.optional(v.string()),
  EMAIL_TEST_MODE: v.optional(v.string()),
  EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  // Billing — optional.
  BILLING_ACCESS_TOKEN: v.optional(v.string()),
  BILLING_WEBHOOK_SECRET: v.optional(v.string()),
  BILLING_ENVIRONMENT: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
} satisfies EnvDefinition

/** An app definition whose env declares at least the {@link backendEnv} vars. */
type BackendApp = AppDefinition<typeof backendEnv>

/** A component definition (the default export of a `convex.config`). */
type ComponentDef = Parameters<BackendApp['use']>[0]

/**
 * A component definition with no required env vars, so `use()` accepts it
 * without an options argument (since convex 1.43 the options argument is
 * mandatory whenever required env can't be ruled out from the type).
 */
type EnvlessComponentDef = ComponentDefinition

/**
 * Every component {@link installBackend} mounts, by its dashboard name.
 *
 * Package-owned: `backend` — the all-in-one component (auth tables + adapter,
 * transactional email with the provider component nested inside, the billing
 * entitlement cache, and gift purchases).
 * Upstream `@convex-dev/*`: `aggregate`, `migrations`, `persistentTextStreaming`
 * (token streaming for `setupAi`), `polar`, `rateLimiter`, `workflow` — these
 * operate over the app's auth/HTTP surface and can't be nested inside
 * `backend`.
 */
export type BackendComponentName
  = 'backend' | 'aggregate' | 'migrations' | 'persistentTextStreaming' | 'polar' | 'rateLimiter' | 'workflow'

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
 * import { backendEnv, installBackend } from 'nuxt-backend/app'
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
  const components = options.components ?? {}
  // Components are isolated from the app's env — forward the email config by
  // reference so the deployment's values reach the component's email functions.
  app.use(components.backend ?? backend, {
    env: {
      EMAIL_API_KEY: app.env.EMAIL_API_KEY,
      EMAIL_FROM: app.env.EMAIL_FROM,
      EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
      EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
    },
  })
  // Unrolled on purpose: collecting the definitions into a record and calling
  // `app.use` through a loop crashes the definition evaluator on 2026-08
  // Convex backends (start_push dies with an opaque 500). Direct calls with
  // the definition identifiers visible to static analysis push cleanly.
  if (!skip.has('aggregate')) app.use((components.aggregate ?? aggregate) as EnvlessComponentDef)
  if (!skip.has('migrations')) app.use((components.migrations ?? migrations) as EnvlessComponentDef)
  if (!skip.has('persistentTextStreaming')) app.use((components.persistentTextStreaming ?? persistentTextStreaming) as EnvlessComponentDef)
  if (!skip.has('polar')) app.use((components.polar ?? polar) as EnvlessComponentDef)
  if (!skip.has('rateLimiter')) app.use((components.rateLimiter ?? rateLimiter) as EnvlessComponentDef)
  if (!skip.has('workflow')) app.use((components.workflow ?? workflow) as EnvlessComponentDef)
  return app
}

/**
 * One-call Convex app definition: declares the standard {@link backendEnv}
 * variables and mounts the all-in-one `backend` component (auth + email +
 * billing + gifts) plus the upstream components (`aggregate`, `migrations`,
 * `persistentTextStreaming`, `polar`, `rateLimiter`, `workflow`). The entire
 * `convex.config.ts` is two lines.
 *
 * Returns the `app`, so you keep full control: mount your own components or
 * read env refs afterwards.
 *
 * @example The entire `convex.config.ts`:
 * ```ts
 * import { defineBackendApp } from 'nuxt-backend/app'
 * export default defineBackendApp()
 * ```
 *
 * @example Trim, extend, and add your own:
 * ```ts
 * import { defineBackendApp } from 'nuxt-backend/app'
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
