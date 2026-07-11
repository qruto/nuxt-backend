import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { adminClient, emailOTPClient, organizationClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/vue'

/**
 * The backend's Better Auth client — the client-side counterpart of the
 * server setup this package ships: passwordless sign-in (OTP + passkeys),
 * admin (roles/ban/impersonation), and organizations (workspaces). Wired into
 * `nuxt-convex-module` as its `betterAuth.authClient`, so `useAuth().client`
 * is typed with exactly these plugins.
 *
 * Point `convex.betterAuth.authClient` at your own module to replace it —
 * include these plugins (plus yours, e.g. `crossDomainClient()`) to keep the
 * bundled flows and composables working.
 */
export const authClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient(), adminClient(), organizationClient()],
})

export type AuthClient = typeof authClient
