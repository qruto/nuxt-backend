import { describe, expect, it } from 'vitest'
import { adminClient as betterAuthAdminClient, organizationClient as betterAuthOrganizationClient } from 'better-auth/client/plugins'
import type { BetterAuthClientPlugin } from 'better-auth/client'
import { adminClient } from '../../src/runtime/vue/admin-client'
import { organizationClient } from '../../src/runtime/vue/organization-client'

// The package's admin and organization client plugins are Better Auth's
// without the error-code tables (src/runtime/vue/admin-client.ts,
// organization-client.ts), which keeps those tables out of every page's
// entry. Everything a client does with a plugin at runtime must match
// Better Auth's own plugin of the installed version: a Better Auth update
// that changes any of it fails here, and the copy is brought up to date.

/** Every path either plugin's listeners match, and a few they must not. */
const PATHS = [
  '/admin/impersonate-user', '/admin/stop-impersonating', '/admin/list-users', '/admin/set-role', '/admin/ban-user',
  '/organization/create', '/organization/delete', '/organization/update', '/organization/set-active', '/organization/set-active-team',
  '/organization/remove-member', '/organization/leave', '/organization/accept-invitation', '/organization/update-member-role',
  '/organization/invite-member', '/organization/list', '/sign-out', '/sign-in/email-otp', '/get-session',
]

/** Which signal each listener raises for each path: what the client's proxy reads from `atomListeners`. */
function signals(plugin: BetterAuthClientPlugin) {
  return Object.fromEntries(PATHS.map(path => [path, (plugin.atomListeners ?? []).filter(listener => listener.matcher(path)).map(listener => listener.signal)]))
}

/** A plugin as a client reads it at runtime, without the parts that are type-level for a client. */
function runtimeShape(plugin: BetterAuthClientPlugin) {
  const { version: _version, $ERROR_CODES: _codes, atomListeners: _listeners, getActions: _actions, getAtoms: _atoms, ...rest } = plugin
  return rest
}

/** The roles and permissions a check is asked about, the default roles' and some no role has. */
const CHECKS = [
  ...['admin', 'user', 'owner', 'member', 'admin,user', 'member,owner', 'nobody', ''].flatMap(role => [
    { role, permissions: { user: ['ban'] } },
    { role, permissions: { user: ['impersonate', 'set-role'] } },
    { role, permissions: { session: ['list'] } },
    { role, permissions: { organization: ['update'] } },
    { role, permissions: { organization: ['delete'] } },
    { role, permissions: { member: ['create', 'delete'] } },
    { role, permissions: { invitation: ['create'] } },
    { role, permissions: { team: ['create'] } },
    { role, permissions: { ac: ['read'] } },
    { role, permissions: { unknown: ['read'] } },
  ]),
]

describe('the admin client plugin', () => {
  const ours = adminClient()
  const theirs = betterAuthAdminClient()

  it('is Better Auth\'s at runtime: id, path methods and listeners', () => {
    expect(runtimeShape(ours)).toEqual(runtimeShape(theirs))
    expect(signals(ours)).toEqual(signals(theirs))
    expect((ours as BetterAuthClientPlugin).getAtoms).toBe((theirs as BetterAuthClientPlugin).getAtoms)
  })

  it('leaves out the error-code table, which a client reads only as a type', () => {
    expect(ours.$ERROR_CODES).toBeUndefined()
    expect(theirs.$ERROR_CODES).toBeDefined()
  })

  it('checks a role\'s permissions as Better Auth\'s does', () => {
    const check = (plugin: typeof ours) => plugin.getActions().admin.checkRolePermission
    for (const input of CHECKS) expect(check(ours)(input as never), JSON.stringify(input)).toBe(check(theirs)(input as never))
  })
})

describe('the organization client plugin', () => {
  const ours = organizationClient()
  const theirs = betterAuthOrganizationClient()

  it('is Better Auth\'s at runtime: id, path methods and listeners', () => {
    expect(runtimeShape(ours)).toEqual(runtimeShape(theirs))
    expect(signals(ours)).toEqual(signals(theirs))
  })

  it('leaves out the error-code table, which a client reads only as a type', () => {
    expect(ours.$ERROR_CODES).toBeUndefined()
    expect(theirs.$ERROR_CODES).toBeDefined()
  })

  it('has Better Auth\'s atoms, each listener\'s signal among them', () => {
    const $fetch = (async () => ({ data: null, error: null })) as never
    const atoms = ours.getAtoms!($fetch)
    expect(Object.keys(atoms).sort()).toEqual(Object.keys(theirs.getAtoms!($fetch)).sort())
    for (const listener of ours.atomListeners ?? []) {
      if (listener.signal !== '$sessionSignal') expect(atoms).toHaveProperty(listener.signal)
    }
  })

  it('checks a role\'s permissions as Better Auth\'s does', () => {
    const check = (plugin: typeof ours) => plugin.getActions!(undefined as never, undefined as never, undefined).organization.checkRolePermission
    for (const input of CHECKS) expect(check(ours)(input as never), JSON.stringify(input)).toBe(check(theirs)(input as never))
  })
})
