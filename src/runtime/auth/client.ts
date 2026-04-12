import { createAuthClient } from 'better-auth/vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = createAuthClient({
  plugins: [convexClient()],
})
