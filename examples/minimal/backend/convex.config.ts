import { defineBackendApp } from 'nuxt-backend/app'

// One call mounts the all-in-one backend component (auth, email, billing
// cache, gifts) plus aggregate, migrations, Polar, rate limiter and
// workflows, declares the deployment env vars (AUTH_SECRET + SITE_URL
// required, the rest optional) and forwards the email config.
// Customize via defineBackendApp({ omit, components, env }), or call
// app.use(...) on the returned app for your own components.
export default defineBackendApp()
