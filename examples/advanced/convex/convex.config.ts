import { defineApp } from 'convex/server'
import { backendEnv, installBackend } from 'nuxt-backend/convex/app'
import { v } from 'convex/values'
import backend from './components/backend/convex.config'

// CUSTOMIZATION: instead of the one-line `defineBackendApp()`, this app writes
// its own `defineApp` to (1) declare an extra env var, (2) swap in the LOCALLY
// installed backend component (its schema is customized — see
// components/backend/schema.ts), and (3) omit an upstream component it doesn't
// use. Mount your own components on `app` afterwards.
const app = defineApp({
  env: {
    ...backendEnv,
    // Extra app-specific env, validated on deploy like the required set.
    APP_WEBHOOK_TAG: v.optional(v.string()),
  },
})

installBackend(app, {
  components: { backend },
  omit: ['aggregate'],
})

export default app
