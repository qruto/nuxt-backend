import type { AuthConfig } from 'convex/server'
import { convexAuthProvider } from '@convex-dev/auth/server'

// Convex Auth signs its access tokens with the deployment's own key.
export default {
  providers: [convexAuthProvider()],
} satisfies AuthConfig
