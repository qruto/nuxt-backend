import type { BetterAuthClientPlugin } from 'better-auth'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

type ConvexPlugin = ReturnType<typeof convexClient>
type AuthClientWithPlugins<Plugins extends (ConvexPlugin | BetterAuthClientPlugin)[]>
  = ReturnType<typeof createAuthClient<BetterAuthClientPlugin & { plugins: Plugins }>>

export type AuthClient = AuthClientWithPlugins<[ConvexPlugin]>

export const authClient: AuthClient = createAuthClient({
  plugins: [convexClient()],
})
