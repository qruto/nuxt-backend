/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { defineApp } from 'convex/server'
import { backendEnv } from 'nuxt-backend/app'
import backend from 'nuxt-backend/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import shardedCounter from '@convex-dev/sharded-counter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

// Explicit on purpose. Convex discovers components by intercepting every
// `convex.config` import while bundling this file, and current backends
// reject the push (start_push 500) when such an import is reached through an
// intermediate module or the components are mounted in a loop — so every
// component is imported and mounted right here, one app.use() per component.
// Mount your own components after them: the action cache, an aggregate,
// migrations or crons, when your code imports one.
//
// The env contract is the package's: AUTH_SECRET + SITE_URL are required,
// the rest optional with designed fallbacks (`npx nuxt-backend env push`
// syncs them from .env.local). Extend it with your own vars:
// defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })
const app = defineApp({ env: backendEnv })

// Components are isolated from the app env — forward the email config by
// reference so the deployment's values reach the backend component (auth,
// email, billing cache, gifts — the email provider is nested inside).
app.use(backend, {
  env: {
    BACKEND_ENVIRONMENT: app.env.BACKEND_ENVIRONMENT,
    EMAIL_API_KEY: app.env.EMAIL_API_KEY,
    EMAIL_FROM: app.env.EMAIL_FROM,
    EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
    MONITORING_DSN: app.env.MONITORING_DSN,
  },
})
app.use(persistentTextStreaming)
app.use(polar)
app.use(rateLimiter)
app.use(shardedCounter)
app.use(workflow)
app.use(workpool)

export default app
