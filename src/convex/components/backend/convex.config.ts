import { defineComponent } from 'convex/server'
import { v } from 'convex/values'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import resend from '@convex-dev/resend/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

/**
 * The all-in-one `backend` Convex component: auth tables + adapter, transactional
 * email (with the Resend component nested inside), the billing entitlement cache,
 * and gift purchases — one mount, one dashboard entry.
 *
 * Auth — we intentionally do NOT mount `@convex-dev/better-auth/convex.config`.
 * The upstream component would surface as a separate `backend/betterAuth` entry
 * in the Convex dashboard and would never receive writes — our own `schema.ts` +
 * `adapter.ts` own all auth tables (the "hybrid component" pattern documented at
 * https://docs.convex.dev/components/authoring). The `@convex-dev/better-auth`
 * runtime is consumed as plain code only (via `createApi` etc.).
 *
 * Email — the Resend component is nested as a child so transactional email
 * (auth OTP, verification, welcome, invitations, gift notifications) ships out
 * of the box; the consumer only mounts `backend` and sets `EMAIL_API_KEY`. The
 * Resend client runs in `backend`'s own functions (see `email.ts`), so it stays
 * encapsulated behind this component's API.
 *
 * Migrations — the package's own data migrations (`migrations.ts`) run on
 * the migrations component nested here, so its record of how far each got
 * stays beside the tables they migrate, apart from the app's own migrations
 * component; `nuxt-backend upgrade` starts them.
 *
 * Waitlist — the order people wait in is an aggregate (`waitlistRank`, queued
 * writes), and the mirror of launch-news contacts to the email provider runs
 * on a workpool (`waitlistMirror`) with retries and backoff, both nested here
 * so a waitlist needs nothing mounted beside `backend`.
 *
 * Growth funnel — the counts of each step, dimension and week, of each
 * cohort's active weeks and of each experiment's variants, are an aggregate
 * (`funnelCounts`) nested here, so the funnel needs nothing mounted beside
 * `backend` and nothing leaves the deployment.
 *
 * Billing — only the entitlement cache + gift records live here. The Polar
 * component operates over the app's auth + HTTP routes and can't be nested, so
 * it mounts at the app level (the scaffolded root `convex.config.ts` does
 * this — see `DEFAULT_CONVEX_CONFIG` in `src/templates.ts`).
 *
 * Components are isolated from the app's environment variables, so `backend`
 * declares the email config it needs here; the mounting app forwards the
 * deployment's values by reference via `app.use(backend, { env: {...} })`
 * (the scaffolded `convex.config.ts` does this). The component reads them
 * type-safely through
 * the generated `env` export (see `email.ts`). All optional — a deploy
 * succeeds without them and email degrades in a designed way (sends no-op,
 * codes and invitations to real addresses refused, webhooks rejected) until
 * `EMAIL_API_KEY` is set. `MONITORING_DSN` is where the component's cron checks
 * in (see `monitoring.ts`), from a deployment whose `BACKEND_ENVIRONMENT`
 * says it is neither a dev nor a preview one; unset, it checks in nowhere.
 * `BACKEND_ENVIRONMENT` also decides the email test mode.
 */
const component = defineComponent('backend', {
  env: {
    BACKEND_ENVIRONMENT: v.optional(v.union(v.literal('development'), v.literal('preview'), v.literal('sandbox'), v.literal('production'))),
    EMAIL_API_KEY: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
    EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
    MONITORING_DSN: v.optional(v.string()),
  },
})

component.use(resend)
component.use(migrations)
component.use(aggregate, { name: 'waitlistRank' })
component.use(workpool, { name: 'waitlistMirror' })
component.use(aggregate, { name: 'funnelCounts' })

export default component
