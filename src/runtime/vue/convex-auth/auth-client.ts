import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient, type VueAuthClient } from 'better-auth/vue'
import { tryUseNuxtApp } from '#imports'
import { adminClient } from '../admin-client'
import type { AuthClient as BackendAuthClient } from '../auth-client'
import { organizationClient } from '../organization-client'
import { passkeyClient } from '../passkey-client'
import { protectionClient } from '../protection/state'
import { twoFactorClient } from '../two-factor-client'
import { useAuthActions, useAuthToken } from './bindings'
import { createConvexAuthFetch } from './transport'

// The auth client of a Convex Auth app: the same client, with the same
// plugins, as a Better Auth app's (../auth-client.ts), so every packaged
// composable and component reads it the same way. Its requests go to the
// deployment's own functions instead of an HTTP route (./transport.ts), and
// the session they open is Convex Auth's.

/** The Convex Auth bindings of the running app, read in its context. */
function bindings() {
  const nuxtApp = tryUseNuxtApp()
  if (!nuxtApp) throw new Error('[nuxt-backend] The auth client of a Convex Auth app runs inside the Nuxt app.')
  return nuxtApp.vueApp.runWithContext(() => ({ actions: useAuthActions(), token: useAuthToken(), config: nuxtApp.$config }))
}

const customFetchImpl = createConvexAuthFetch({
  get convexUrl() {
    return (bindings().config.public.convex as { url?: string }).url ?? ''
  },
  get baseURL() {
    return bindings().config.app.baseURL
  },
  get authRoute() {
    return (bindings().config.public.backend as { authRoute?: string } | undefined)?.authRoute ?? '/api/auth'
  },
  token: () => bindings().token.value,
  setSession: tokens => bindings().actions.setSession(tokens),
  signOut: () => bindings().actions.signOut(),
})

const plugins = [convexClient(), emailOTPClient(), passkeyClient(), adminClient(), organizationClient(), protectionClient(), twoFactorClient()]

/**
 * The backend's auth client in a Convex Auth app: `authClient` of
 * `../auth-client`, its requests answered by the deployment's functions.
 */
export const authClient: BackendAuthClient = createAuthClient({ plugins, fetchOptions: { customFetchImpl } }) as unknown as BackendAuthClient

export type AuthClient = VueAuthClient<{ plugins: typeof plugins }>
