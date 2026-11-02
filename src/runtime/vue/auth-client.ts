import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient, type VueAuthClient } from 'better-auth/vue'
import { adminClient, type AdminClientPlugin } from './admin-client'
import { organizationClient, type OrganizationClientPlugin } from './organization-client'
import { passkeyClient } from './passkey-client'
import { protectionClient } from './protection/state'

/**
 * The plugins below, as the client's type reads them. Named rather than
 * inferred, so the declaration file says this line instead of every plugin's
 * type spelled out (about 150 kB of the package). The two generic plugins
 * are named with the options a call without any infers.
 */
type BackendAuthPlugin = ReturnType<typeof convexClient> | ReturnType<typeof emailOTPClient> | ReturnType<typeof passkeyClient>
  | AdminClientPlugin | OrganizationClientPlugin | ReturnType<typeof protectionClient>

const plugins = [convexClient(), emailOTPClient(), passkeyClient(), adminClient(), organizationClient(), protectionClient()]

/**
 * `BackendAuthPlugin` while it names exactly the plugins in the list, else
 * `never`, which the construction below refuses: a plugin added to the list
 * and not named, or named and no longer in the list, is a type error there.
 * test/types/auth-client.test-d.ts holds the named client to the inferred one.
 */
type Named = [(typeof plugins)[number]] extends [BackendAuthPlugin] ? [BackendAuthPlugin] extends [(typeof plugins)[number]] ? BackendAuthPlugin : never : never

/**
 * The backend's Better Auth client — the client-side counterpart of the
 * server setup this package ships: passwordless sign-in (OTP + passkeys),
 * admin (roles/ban/impersonation), and organizations (workspaces). Wired into
 * `nuxt-convex-module` as its `betterAuth.authClient`, so the package's auth session
 * is typed with exactly these plugins.
 *
 * Every plugin is registered here, at construction, and the base module
 * imports this client on every page. The passkey plugin is the package's
 * own (`./passkey-client`): Better Auth's, with the WebAuthn ceremony loaded
 * apart from the page, once it is idle. So are the admin and organization
 * plugins (`./admin-client`, `./organization-client`): Better Auth's,
 * without the error-code tables a client never reads at runtime. The
 * protection plugin answers the bot check's challenge on the requests that
 * send a code, when the app shows one.
 *
 * Point `convex.betterAuth.authClient` at your own module to replace it —
 * include these plugins (plus yours, e.g. `crossDomainClient()`) to keep the
 * bundled flows and composables working. The package's own plugins are not
 * public exports; without the protection plugin, a challenge is yours to
 * answer, as the `x-captcha-response` header. For the others, use Better
 * Auth's there — `passkeyClient()` from `@better-auth/passkey/client`,
 * `adminClient()` and `organizationClient()` from
 * `better-auth/client/plugins` — which work the same and load more with
 * every page (the passkey ceremony alone is about 12 kB).
 */
export const authClient: VueAuthClient<{ plugins: BackendAuthPlugin[] }> = createAuthClient({ plugins: plugins satisfies Named[] })

export type AuthClient = typeof authClient
