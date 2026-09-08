import { defineApp } from 'convex/server'
import { backendEnv } from 'nuxt-backend/app'
import backend from 'nuxt-backend/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

// Explicit on purpose. Convex discovers components by intercepting every
// `convex.config` import while bundling this file, and current backends
// reject the push (start_push 500) when such an import is reached through an
// intermediate module or the components are mounted in a loop — so every
// component is imported and mounted right here, one app.use() per component.
// Mount your own components after them.
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
