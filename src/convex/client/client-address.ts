import type { BetterAuthPlugin } from 'better-auth'
import { CLIENT_ADDRESS_HEADER, CLIENT_IP_HEADER, deploymentAudience, readClientAddress } from '../proof.js'

/** The id of the plugin that hands Better Auth the client's address (no tables). */
export const CLIENT_ADDRESS_PLUGIN_ID = 'nuxt-backend-client-address'

/**
 * Hand Better Auth the client's address behind the app's server. Requests
 * that come through the app's auth proxy reach the deployment from the
 * app's server, and the platform writes that server's address into
 * `x-forwarded-for`: every visitor would share one address, and with it one
 * bucket of each per-address limit. The app's server signs the address it
 * received the request from into {@link CLIENT_ADDRESS_HEADER}, under the
 * proof secret it shares with the deployment (`PROTECTION_PROOF_SECRET`).
 *
 * Before any route runs, a {@link CLIENT_IP_HEADER} a request arrived with
 * is dropped, whoever sent it, and set again only from a signed address
 * whose proof holds. Better Auth reads that header first and
 * `x-forwarded-for` after it (`advanced.ipAddress.ipAddressHeaders`), so a
 * request called on the deployment directly keeps the address the platform
 * wrote, and one without a valid signature changes nothing.
 */
export function clientAddressPlugin(secret: string | undefined): BetterAuthPlugin {
  return {
    id: CLIENT_ADDRESS_PLUGIN_ID,
    onRequest: async (request) => {
      const signed = request.headers.get(CLIENT_ADDRESS_HEADER)
      if (signed === null && !request.headers.has(CLIENT_IP_HEADER)) return
      const headers = new Headers(request.headers)
      headers.delete(CLIENT_ADDRESS_HEADER)
      headers.delete(CLIENT_IP_HEADER)
      const address = secret ? await readClientAddress(secret, signed, deploymentAudience()) : null
      if (address) headers.set(CLIENT_IP_HEADER, address)
      return { request: new Request(request, { headers }) }
    },
  } satisfies BetterAuthPlugin
}
