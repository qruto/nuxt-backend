import { defineApp } from 'convex/server'
import { backendEnv } from 'nuxt-backend/app'
import { v } from 'convex/values'
import backend from 'nuxt-backend/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import shardedCounter from '@convex-dev/sharded-counter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

// The same explicit app definition the scaffold generates (compare
// templates/starter/backend/convex.config.ts): every component is imported and
// mounted right here, one app.use() per component — current Convex backends
// reject the push when a convex.config import is reached through an
// intermediate module or the components are mounted in a loop. This app's
// changes from the scaffold are marked CUSTOMIZATION.
const app = defineApp({
  env: {
    ...backendEnv,
    // CUSTOMIZATION: an extra app-specific env var, validated on deploy like
    // the package's required set.
    APP_WEBHOOK_TAG: v.optional(v.string()),
  },
})

// Components are isolated from the app env — forward the email config by
// reference so the deployment's values reach the backend component.
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
