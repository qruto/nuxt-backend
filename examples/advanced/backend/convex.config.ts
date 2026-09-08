import { defineApp } from 'convex/server'
import { backendEnv } from 'nuxt-backend/app'
import { v } from 'convex/values'
import migrations from '@convex-dev/migrations/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
// CUSTOMIZATION: the LOCALLY installed backend component — its schema is
// extended (see components/backend/schema.ts) — instead of the packaged
// 'nuxt-backend/component/convex.config'.
import backend from './components/backend/convex.config'

// The same explicit app definition the scaffold generates (compare
// examples/minimal/backend/convex.config.ts): every component is imported and
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
    EMAIL_API_KEY: app.env.EMAIL_API_KEY,
    EMAIL_FROM: app.env.EMAIL_FROM,
    EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
    EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
  },
})
// CUSTOMIZATION: `aggregate` is left unmounted — nothing in this backend uses
// it. Drop a component's import + app.use() pair only when nothing in
// backend/ depends on it.
app.use(migrations)
app.use(persistentTextStreaming)
app.use(polar)
app.use(rateLimiter)
app.use(workflow)

export default app
