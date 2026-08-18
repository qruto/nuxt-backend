import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import backend from 'nuxt-backend/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

// Component imports and use() calls live directly in this root file: current
// Convex backends (2026-08) crash on component imports reached through
// intermediate modules, so the one-call defineBackendApp() form is inlined
// until that is fixed upstream. Same tree, same env contract — AUTH_SECRET +
// SITE_URL required, the rest optional with designed fallbacks.
const app = defineApp({
  env: {
    AUTH_SECRET: v.string(),
    SITE_URL: v.string(),
    EMAIL_API_KEY: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
    EMAIL_TEST_MODE: v.optional(v.string()),
    EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
    BILLING_ACCESS_TOKEN: v.optional(v.string()),
    BILLING_WEBHOOK_SECRET: v.optional(v.string()),
    BILLING_ENVIRONMENT: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
  },
})
// Components are isolated from the app env — forward the email config by
// reference so the deployment's values reach the nested email component.
app.use(backend, {
  env: {
    EMAIL_API_KEY: app.env.EMAIL_API_KEY,
    EMAIL_FROM: app.env.EMAIL_FROM,
    EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
    EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
  },
})
app.use(aggregate)
app.use(migrations)
app.use(persistentTextStreaming)
app.use(polar)
app.use(rateLimiter)
app.use(workflow)
export default app
