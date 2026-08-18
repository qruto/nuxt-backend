import { describe, expect, it, vi } from 'vitest'
import type { AnyComponents } from 'convex/server'
import * as clientBridge from '../../src/convex/client'

const fakeComponent = {
  adapter: {
    findOne: {} as never,
    findMany: {} as never,
    updateOne: {} as never,
  },
} as never

const fakeAppComponent = fakeComponent as unknown as AnyComponents[string]

describe('Convex component client bridge', () => {
  it('creates Better Auth options without requiring runtime env at import time', () => {
    const previousSiteUrl = process.env.SITE_URL

    try {
      delete process.env.SITE_URL

      const options = clientBridge.createBetterAuthOptions({} as never)
      expect(options.database).toBeDefined()
      expect(options.basePath).toBe('/api/auth')
    }
    finally {
      if (previousSiteUrl === undefined) {
        delete process.env.SITE_URL
      }
      else {
        process.env.SITE_URL = previousSiteUrl
      }
    }
  })

  it('exposes a ready-made auth API remount helper', async () => {
    const queryBuilder = vi.fn(definition => definition)

    const authApi = clientBridge.makeAuthApi({ backend: fakeAppComponent }, queryBuilder as never)

    // One query per api member: getAuthUser, the authConfig diagnostics, and
    // the workspace reads (updateProfile is a mutationGeneric, not built here).
    expect(queryBuilder).toHaveBeenCalledTimes(4)
    expect(queryBuilder).toHaveBeenCalledWith(expect.objectContaining({ args: {} }))
    expect(authApi).toHaveProperty('getAuthUser')
    expect(authApi).toHaveProperty('authConfig')
    expect(authApi).toHaveProperty('listWorkspaces')
    expect(authApi).toHaveProperty('listWorkspaceMembers')
    expect(authApi).toHaveProperty('updateProfile')
    // The diagnostics query reports the resolved invitation path for doctor.
    const config = await (authApi.authConfig as unknown as { handler: () => Promise<{ invitationPath: string | null }> }).handler()
    expect(config).toEqual({ invitationPath: '/accept-invitation' })
  })

  it('keeps setupAuth as the convenience composition of the client patterns', () => {
    const queryBuilder = vi.fn(definition => definition)

    const authSetup = clientBridge.setupAuth({ backend: fakeAppComponent }, queryBuilder as never)

    expect(typeof authSetup.createAuth).toBe('function')
    expect(typeof authSetup.createAuthOptions).toBe('function')
    expect(authSetup).toHaveProperty('options')
    expect(authSetup).toHaveProperty('authComponent')
    expect(authSetup).toHaveProperty('getAuthUser')
    // The agent token exchange rides along for http.ts to mount.
    expect(typeof authSetup.mcp.exchangeHandler).toBe('function')
  })
})

describe('admin + organization defaults', () => {
  const pluginIds = (options: { plugins?: Array<{ id: string }> }) =>
    (options.plugins ?? []).map(plugin => plugin.id)

  it('bundles the admin and organization plugins by default', () => {
    const options = clientBridge.createBetterAuthOptions({} as never)
    expect(pluginIds(options)).toEqual(expect.arrayContaining(['convex', 'email-otp', 'passkey', 'admin', 'organization']))
  })

  it('bundles the agent OAuth provider (mcp) with its convex-aligned signer (jwt)', () => {
    const options = clientBridge.createBetterAuthOptions({} as never)
    const ids = pluginIds(options)
    expect(ids).toContain('mcp')
    expect(ids).toContain('jwt')
    // The mcp defaults must sit after the convex plugin: better-auth after-
    // hooks are last-write-wins and both resume the oidc_login_prompt cookie.
    expect(ids.indexOf('mcp')).toBeGreaterThan(ids.indexOf('convex'))
  })

  it('offers the built-in tool scopes to agents at consent time', () => {
    const options = clientBridge.createBetterAuthOptions({} as never)
    const mcpPlugin = (options.plugins ?? []).find(plugin => plugin.id === 'mcp') as unknown as {
      options?: { oidcConfig?: { scopes?: string[], metadata?: { scopes_supported?: string[] } } }
    }
    const oidcConfig = mcpPlugin.options?.oidcConfig
    for (const scope of ['profile:write', 'billing:read', 'billing:checkout', 'workspace:read', 'act']) {
      expect(oidcConfig?.scopes).toContain(scope)
      expect(oidcConfig?.metadata?.scopes_supported).toContain(scope)
    }
  })

  it('can disable each plugin with false', () => {
    const options = clientBridge.createBetterAuthOptions({} as never, { admin: false, organization: false, mcp: false })
    const ids = pluginIds(options)
    expect(ids).not.toContain('admin')
    expect(ids).not.toContain('organization')
    expect(ids).not.toContain('mcp')
    expect(ids).not.toContain('jwt')
  })

  it('dedupes against a consumer-supplied plugin of the same id', async () => {
    const { admin } = await import('better-auth/plugins')
    const options = clientBridge.createBetterAuthOptions({} as never, {
      authOptions: { plugins: [admin({ defaultBanReason: 'spam' })] },
    })
    expect(pluginIds(options).filter(id => id === 'admin')).toHaveLength(1)
  })
})

describe('workspace + profile api', () => {
  type Handler = (ctx: unknown, args?: Record<string, unknown>) => Promise<unknown>
  const build = () => {
    const queryBuilder = vi.fn(definition => definition)
    // The queries come back as raw definitions (the fake builder is identity);
    // updateProfile is a real mutationGeneric, whose raw handler is `_handler`.
    return clientBridge.makeAuthApi({ backend: fakeAppComponent }, queryBuilder as never) as unknown as {
      listWorkspaces: { handler: Handler }
      listWorkspaceMembers: { handler: Handler }
      updateProfile: { _handler: Handler }
    }
  }
  const adapter = (fakeComponent as { adapter: { findOne: unknown, findMany: unknown, updateOne: unknown } }).adapter

  const identityCtx = (data: {
    subject?: string
    claims?: Record<string, unknown>
    findOne?: (args: { model: string, where: Array<{ field: string, value: unknown }> }) => unknown
    findMany?: (args: { model: string }) => { page: unknown[] }
    updateOne?: (args: unknown) => unknown
  }) => ({
    auth: {
      getUserIdentity: async () => (data.subject ? { subject: data.subject, ...data.claims } : null),
    },
    runQuery: vi.fn(async (ref: unknown, args: never) => {
      if (ref === adapter.findOne) return data.findOne?.(args) ?? null
      if (ref === adapter.findMany) return data.findMany?.(args) ?? { page: [], isDone: true, continueCursor: '' }
      throw new Error('unexpected query ref')
    }),
    runMutation: vi.fn(async (ref: unknown, args: never) => {
      if (ref === adapter.updateOne) return data.updateOne?.(args) ?? null
      throw new Error('unexpected mutation ref')
    }),
  })

  it('lists the caller workspaces with role and active flags, null when signed out', async () => {
    const api = build()
    const ctx = identityCtx({
      subject: 'user-1',
      claims: { activeOrganizationId: 'org-2' },
      findMany: () => ({ page: [
        { organizationId: 'org-1', role: 'owner', createdAt: 1 },
        { organizationId: 'org-2', role: 'member', createdAt: 2 },
      ] }),
      findOne: ({ where }) => ({ _id: where[0]!.value, name: `W ${where[0]!.value}`, slug: `w-${where[0]!.value}` }),
    })
    await expect(api.listWorkspaces.handler(ctx)).resolves.toEqual([
      { id: 'org-1', name: 'W org-1', slug: 'w-org-1', logo: null, role: 'owner', active: false, joinedAt: 1 },
      { id: 'org-2', name: 'W org-2', slug: 'w-org-2', logo: null, role: 'member', active: true, joinedAt: 2 },
    ])

    await expect(api.listWorkspaces.handler(identityCtx({}))).resolves.toBeNull()
  })

  it('gates member listing on a fresh membership read, not claims', async () => {
    const api = build()
    // Claims say org-1 is active, but the member table no longer agrees —
    // the stale-JWT caller must not see the roster.
    const removed = identityCtx({
      subject: 'user-1',
      claims: { activeOrganizationId: 'org-1' },
      findOne: () => null,
    })
    await expect(api.listWorkspaceMembers.handler(removed, {})).resolves.toBeNull()

    const member = identityCtx({
      subject: 'user-1',
      claims: { activeOrganizationId: 'org-1' },
      findOne: ({ model, where }) => (model === 'member'
        ? { organizationId: 'org-1' }
        : { name: `User ${where[0]!.value}`, email: `${where[0]!.value}@example.com` }),
      findMany: () => ({ page: [{ userId: 'user-1', role: 'owner', createdAt: 5 }] }),
    })
    await expect(api.listWorkspaceMembers.handler(member, {})).resolves.toEqual({
      organizationId: 'org-1',
      members: [{ userId: 'user-1', name: 'User user-1', email: 'user-1@example.com', role: 'owner', joinedAt: 5 }],
    })
  })

  it('updates only the profile name, trimmed and identity-gated', async () => {
    const api = build()
    const updateOne = vi.fn()
    const ctx = identityCtx({ subject: 'user-1', updateOne })
    await api.updateProfile._handler(ctx, { name: '  Ada  ' })
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        model: 'user',
        where: [{ field: '_id', value: 'user-1' }],
        update: expect.objectContaining({ name: 'Ada' }),
      }),
    }))

    await expect(api.updateProfile._handler(identityCtx({}), { name: 'Ada' })).rejects.toThrow('Sign in')
    await expect(api.updateProfile._handler(ctx, { name: '   ' })).rejects.toThrow('1-256')
  })
})

describe('workspace session hook', () => {
  type SessionBeforeHook = (
    session: Record<string, unknown>,
    hookCtx: unknown,
  ) => Promise<{ data: Record<string, unknown> } | undefined>

  const sessionBefore = (options: ReturnType<typeof clientBridge.createBetterAuthOptions>): SessionBeforeHook => {
    const hook = (options.databaseHooks as { session?: { create?: { before?: unknown } } } | undefined)?.session?.create?.before
    expect(typeof hook).toBe('function')
    return hook as SessionBeforeHook
  }

  const hookCtx = (adapter: { findOne: unknown, create: unknown }) => ({ context: { adapter } })

  it('activates the existing membership on session create', async () => {
    const adapter = {
      findOne: vi.fn(async () => ({ organizationId: 'org-9' })),
      create: vi.fn(),
    }
    const result = await sessionBefore(clientBridge.createBetterAuthOptions({} as never))(
      { userId: 'user-1' }, hookCtx(adapter),
    )
    expect(result?.data.activeOrganizationId).toBe('org-9')
    expect(adapter.create).not.toHaveBeenCalled()
  })

  it('creates a personal workspace (org + owner membership) on first sign-in', async () => {
    const created: Array<{ model: string, data: Record<string, unknown> }> = []
    const adapter = {
      findOne: vi.fn(async ({ model }: { model: string }) => (model === 'user' ? { name: 'Ada' } : null)),
      create: vi.fn(async (args: { model: string, data: Record<string, unknown> }) => {
        created.push(args)
        return { id: `${args.model}-1`, ...args.data }
      }),
    }
    const result = await sessionBefore(clientBridge.createBetterAuthOptions({} as never))(
      { userId: 'user-1' }, hookCtx(adapter),
    )
    expect(created.map(entry => entry.model)).toStrictEqual(['organization', 'member'])
    expect(created[0]!.data).toMatchObject({ name: 'Ada\'s workspace', slug: 'personal-user-1' })
    expect(created[1]!.data).toMatchObject({ organizationId: 'organization-1', userId: 'user-1', role: 'owner' })
    expect(result?.data.activeOrganizationId).toBe('organization-1')
  })

  it('skips workspace creation when personal is disabled', async () => {
    const adapter = { findOne: vi.fn(async () => null), create: vi.fn() }
    const result = await sessionBefore(clientBridge.createBetterAuthOptions({} as never, { organization: { personal: false } }))(
      { userId: 'user-1' }, hookCtx(adapter),
    )
    expect(result).toBeUndefined()
    expect(adapter.create).not.toHaveBeenCalled()
  })

  it('is absent when the organization plugin is disabled', () => {
    const options = clientBridge.createBetterAuthOptions({} as never, { organization: false })
    const hook = (options.databaseHooks as { session?: { create?: { before?: unknown } } } | undefined)?.session?.create?.before
    expect(hook).toBeUndefined()
  })
})
