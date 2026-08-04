import { defineComponent } from 'convex/server'
import { v } from 'convex/values'
import resend from '@convex-dev/resend/convex.config'

// The locally installed all-in-one backend component. The email provider
// component is nested inside, and the email env is declared here (the app
// forwards the deployment's values — defineBackendApp does this for you).
// Note: under pnpm, add `@convex-dev/resend` as a direct dependency so
// this import resolves.
const component = defineComponent('backend', {
  env: {
    EMAIL_API_KEY: v.string(),
    EMAIL_FROM: v.string(),
    EMAIL_TEST_MODE: v.string(),
    EMAIL_WEBHOOK_SECRET: v.string(),
  },
})

component.use(resend)

export default component
