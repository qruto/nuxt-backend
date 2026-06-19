import { defineComponent } from 'convex/server'
import { v } from 'convex/values'
import resend from '@convex-dev/resend/convex.config'

/**
 * Convex component that wraps Better Auth and bundles auth-coupled components.
 *
 * We intentionally do NOT mount `@convex-dev/better-auth/convex.config` here.
 * The upstream component would surface as a separate `backend/betterAuth`
 * entry in the Convex dashboard and would never receive writes — our local
 * `schema.ts` + `adapter.ts` own all auth tables (the "hybrid component"
 * pattern documented at https://docs.convex.dev/components/authoring). The
 * `@convex-dev/better-auth` runtime is consumed as plain code only (via
 * `createApi` etc.).
 *
 * The Resend component is nested as a child so transactional email (auth OTP,
 * verification, welcome) ships out of the box — the consumer only mounts
 * `backend` and sets `RESEND_API_KEY`. The Resend client runs in `backend`'s
 * own functions (see `email.ts`), so it stays encapsulated behind this
 * component's API.
 *
 * Components are isolated from the app's environment variables, so `backend`
 * declares the email config it needs here; the mounting app forwards the
 * deployment's values by reference via `app.use(backend, { env: {...} })`
 * (the scaffolded `convex.config.ts` does this). The component then reads
 * them type-safely through the generated `env` export (see `email.ts`).
 */
const component = defineComponent('backend', {
  env: {
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM: v.optional(v.string()),
    RESEND_TEST_MODE: v.optional(v.string()),
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
  },
})

component.use(resend)

export default component
