import { describe, expect, it, vi } from 'vitest'
import type { AnyComponents } from 'convex/server'
import * as clientBridge from '../../src/convex/client'

const fakeComponent = {
  adapter: {
    findOne: {} as never,
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

  it('exposes a ready-made auth API remount helper', () => {
    const queryBuilder = vi.fn(definition => definition)

    const authApi = clientBridge.makeAuthApi({ backend: fakeAppComponent }, queryBuilder as never)

    expect(queryBuilder).toHaveBeenCalledTimes(1)
    expect(queryBuilder).toHaveBeenCalledWith(expect.objectContaining({ args: {} }))
    expect(authApi).toHaveProperty('getAuthUser')
  })

  it('keeps setupAuth as the convenience composition of the client patterns', () => {
    const queryBuilder = vi.fn(definition => definition)

    const authSetup = clientBridge.setupAuth({ backend: fakeAppComponent }, queryBuilder as never)

    expect(typeof authSetup.createAuth).toBe('function')
    expect(typeof authSetup.createAuthOptions).toBe('function')
    expect(authSetup).toHaveProperty('options')
    expect(authSetup).toHaveProperty('authComponent')
    expect(authSetup).toHaveProperty('getAuthUser')
  })
})

describe('admin + organization defaults', () => {
  const pluginIds = (options: { plugins?: Array<{ id: string }> }) =>
    (options.plugins ?? []).map(plugin => plugin.id)

  it('bundles the admin and organization plugins by default', () => {
    const options = clientBridge.createBetterAuthOptions({} as never)
    expect(pluginIds(options)).toEqual(expect.arrayContaining(['convex', 'email-otp', 'passkey', 'admin', 'organization']))
  })

  it('can disable each plugin with false', () => {
    const options = clientBridge.createBetterAuthOptions({} as never, { admin: false, organization: false })
    const ids = pluginIds(options)
    expect(ids).not.toContain('admin')
    expect(ids).not.toContain('organization')
  })

  it('dedupes against a consumer-supplied plugin of the same id', async () => {
    const { admin } = await import('better-auth/plugins')
    const options = clientBridge.createBetterAuthOptions({} as never, {
      authOptions: { plugins: [admin({ defaultBanReason: 'spam' })] },
    })
    expect(pluginIds(options).filter(id => id === 'admin')).toHaveLength(1)
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
