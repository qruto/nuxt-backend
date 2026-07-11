import { defineBackendApp } from 'nuxt-backend/convex/app'
import backend from 'nuxt-backend/convex/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

// One call mounts every bundled component (Better Auth + nested Resend email,
// aggregate, migrations, Polar, rate limiter, workflows), declares their env
// vars and forwards the email config to the nested Resend component. Pass extra
// env via defineBackendApp(components, { env }), or call app.use(...) on the
// returned app for your own components.
export default defineBackendApp({ backend, aggregate, migrations, polar, rateLimiter, workflow })
