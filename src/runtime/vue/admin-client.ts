import type { adminClient as betterAuthAdminClient, AdminClientOptions } from 'better-auth/client/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'

/** Better Auth's admin client plugin, as `adminClient()` from `better-auth/client/plugins` returns it. */
export type AdminClientPlugin = ReturnType<typeof betterAuthAdminClient<AdminClientOptions>>

type PermissionCheck = Parameters<ReturnType<AdminClientPlugin['getActions']>['admin']['checkRolePermission']>[0]

const roles = { admin: adminAc, user: userAc }

/**
 * Better Auth's admin client plugin without its error-code table.
 * `createAuthClient` takes its plugins at construction and the base module
 * imports the client on every page, so this plugin is in every page's entry.
 * What it does at runtime is small: impersonating and stopping refresh the
 * session, `list-users` is a GET, and `checkRolePermission` answers from the
 * default roles, synchronously, as Better Auth's does. Its `$ERROR_CODES`
 * table, about a third of the plugin, is type-level for a client plugin
 * (Better Auth's client never reads it at runtime), so it stays out of the
 * page. Every admin call is a request through the client's own proxy: there
 * is nothing else to load on first use.
 *
 * test/unit/role-clients.test.ts holds it to Better Auth's own plugin.
 */
export function adminClient(): AdminClientPlugin {
  const plugin: Omit<AdminClientPlugin, 'version' | '$ERROR_CODES'> = {
    id: 'admin-client',
    // Type-level only, as in Better Auth's plugin: the server plugin it pairs with.
    $InferServerPlugin: {} as AdminClientPlugin['$InferServerPlugin'],
    getActions: () => ({
      admin: {
        checkRolePermission: (data: PermissionCheck) => {
          if (!data.permissions) return false
          for (const role of (data.role || 'user').split(',')) {
            if (roles[role as keyof typeof roles]?.authorize(data.permissions).success) return true
          }
          return false
        },
      },
    }),
    pathMethods: {
      '/admin/list-users': 'GET',
      '/admin/impersonate-user': 'POST',
      '/admin/stop-impersonating': 'POST',
    },
    atomListeners: [
      {
        matcher: path => path === '/admin/impersonate-user' || path === '/admin/stop-impersonating',
        signal: '$sessionSignal',
      },
    ],
  }
  // `version` and `$ERROR_CODES` are type-level for a client plugin, as in
  // ./passkey-client: everything else is checked against Better Auth's type.
  return plugin as AdminClientPlugin
}
