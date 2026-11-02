import { useAuthQuery } from 'better-auth/client'
import type { organizationClient as betterAuthOrganizationClient, OrganizationClientOptions } from 'better-auth/client/plugins'
import { adminAc, memberAc, ownerAc } from 'better-auth/plugins/organization/access'
import { atom } from 'nanostores'

/** Better Auth's organization client plugin, as `organizationClient()` from `better-auth/client/plugins` returns it. */
export type OrganizationClientPlugin = ReturnType<typeof betterAuthOrganizationClient<OrganizationClientOptions>>

type PermissionCheck = Parameters<ReturnType<OrganizationClientPlugin['getActions']>['organization']['checkRolePermission']>[0]

const roles = { admin: adminAc, member: memberAc, owner: ownerAc }

/**
 * Better Auth's organization client plugin without its error-code table,
 * for the reason ./admin-client gives: the plugin is in every page's entry,
 * and its `$ERROR_CODES` table (more than half of it) is type-level for a
 * client plugin. The rest is Better Auth's: the workspace atoms
 * (`activeOrganization`, `listOrganizations`, `activeMember`,
 * `activeMemberRole`), the signals that refresh them and the session, and
 * `checkRolePermission` against the default roles.
 *
 * test/unit/role-clients.test.ts holds it to Better Auth's own plugin.
 */
export function organizationClient(): OrganizationClientPlugin {
  const $listOrg = atom(false)
  const $activeOrgSignal = atom(false)
  const $activeMemberSignal = atom(false)
  const $activeMemberRoleSignal = atom(false)
  const plugin: Omit<OrganizationClientPlugin, 'version' | '$ERROR_CODES'> = {
    id: 'organization',
    // Type-level only, as in Better Auth's plugin: the server plugin it pairs with.
    $InferServerPlugin: {} as OrganizationClientPlugin['$InferServerPlugin'],
    getActions: () => ({
      // Type-level only, as in Better Auth's actions.
      $Infer: {} as ReturnType<OrganizationClientPlugin['getActions']>['$Infer'],
      organization: {
        checkRolePermission: (data: PermissionCheck) => {
          if (!data.permissions) return false
          for (const role of data.role.split(',')) {
            if (roles[role as keyof typeof roles]?.authorize(data.permissions).success) return true
          }
          return false
        },
      },
    }),
    getAtoms: $fetch => ({
      $listOrg,
      $activeOrgSignal,
      $activeMemberSignal,
      $activeMemberRoleSignal,
      activeOrganization: useAuthQuery([$activeOrgSignal], '/organization/get-full-organization', $fetch, () => ({ method: 'GET' })),
      listOrganizations: useAuthQuery($listOrg, '/organization/list', $fetch, { method: 'GET' }),
      activeMember: useAuthQuery([$activeOrgSignal, $activeMemberSignal], '/organization/get-active-member', $fetch, { method: 'GET' }),
      activeMemberRole: useAuthQuery([$activeOrgSignal, $activeMemberRoleSignal], '/organization/get-active-member-role', $fetch, { method: 'GET' }),
    }) as ReturnType<OrganizationClientPlugin['getAtoms']>,
    pathMethods: {
      '/organization/get-full-organization': 'GET',
      '/organization/list-user-teams': 'GET',
    },
    atomListeners: [
      {
        matcher: path => path === '/organization/create' || path === '/organization/delete' || path === '/organization/update',
        signal: '$listOrg',
      },
      {
        matcher: path => path === '/sign-out' || path.startsWith('/organization'),
        signal: '$activeOrgSignal',
      },
      {
        matcher: path => path.startsWith('/organization/set-active') || path === '/organization/create' || path === '/organization/delete'
          || path === '/organization/remove-member' || path === '/organization/leave' || path === '/organization/accept-invitation',
        signal: '$sessionSignal',
      },
      {
        matcher: path => path.includes('/organization/update-member-role') || path.startsWith('/organization/set-active'),
        signal: '$activeMemberSignal',
      },
      {
        matcher: path => path.includes('/organization/update-member-role') || path.startsWith('/organization/set-active'),
        signal: '$activeMemberRoleSignal',
      },
    ],
  }
  // `version` and `$ERROR_CODES` are type-level for a client plugin, as in
  // ./passkey-client: everything else is checked against Better Auth's type.
  return plugin as OrganizationClientPlugin
}
