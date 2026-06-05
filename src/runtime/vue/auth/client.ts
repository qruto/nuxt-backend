import type { BetterAuthClientPlugin } from 'better-auth'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/vue'

type ConvexPlugin = ReturnType<typeof convexClient>
type EmailOTPPlugin = ReturnType<typeof emailOTPClient>
type PasskeyPlugin = ReturnType<typeof passkeyClient>
type AuthClientWithPlugins<Plugins extends (ConvexPlugin | BetterAuthClientPlugin)[]>
  = ReturnType<typeof createAuthClient<BetterAuthClientPlugin & { plugins: Plugins }>>

export type AuthClient = AuthClientWithPlugins<[ConvexPlugin, EmailOTPPlugin, PasskeyPlugin]>

export const authClient: AuthClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient()],
})
