import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { adminClient, emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/vue'

/**
 * The Better Auth client for a deployment without workspaces
 * (`backend.workspaces: false` alongside `setupAuth(…, { organization: false })`).
 * Same plugins as `./auth-client` minus `organizationClient()`, whose atoms
 * would otherwise ask `/organization/*` on every session change and log three
 * 404s per page against routes the server never mounted.
 */
export const authClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient(), adminClient()],
})

export type AuthClient = typeof authClient
