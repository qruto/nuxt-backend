import { defineComponent } from 'convex/server'
import { v } from 'convex/values'
import resend from '@convex-dev/resend/convex.config'

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
 * Billing — only the entitlement cache + gift records live here. The Polar
 * component operates over the app's auth + HTTP routes and can't be nested, so
 * it mounts at the app level (see `installBackend` in `src/convex/app.ts`).
 *
 * Components are isolated from the app's environment variables, so `backend`
 * declares the email config it needs here; the mounting app forwards the
 * deployment's values by reference via `app.use(backend, { env: {...} })`
 * (`installBackend` does this). The component reads them type-safely through
 * the generated `env` export (see `email.ts`). All required — a deploy fails
 * until they are set.
 */
const component = defineComponent('backend', {
  env: {
    EMAIL_API_KEY: v.string(),
    EMAIL_FROM: v.string(),
    EMAIL_TEST_MODE: v.string(),
    EMAIL_WEBHOOK_SECRET: v.string(),
  },
})

component.use(resend)

export default component
