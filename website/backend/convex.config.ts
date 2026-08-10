import { defineBackendApp } from 'nuxt-backend/app'

// One call mounts every bundled component (auth, email with nested Resend,
// billing cache, aggregate, migrations, Polar, rate limiter, workflows),
// declares their env vars and forwards the email config. Customize via
// defineBackendApp({ omit, components, env }), or call app.use(...) on the
// returned app for your own components.
export default defineBackendApp()
