import { createAuthClient } from 'better-auth/vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [convexClient()],
})

export type AuthClient = typeof authClient
