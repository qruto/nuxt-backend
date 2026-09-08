import { describe, expect, it, vi } from 'vitest'
import { getAuthTables } from 'better-auth/db'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { jwt } from 'better-auth/plugins'
import { createBetterAuthOptions } from '../../src/convex/client'
import { authSchema } from '../../src/convex/components/backend/schema'
import '../../src/convex/components/backend/adapter'

// The component adapter derives its Better Auth table map from a private,
// hand-maintained plugin list (`options` in adapter.ts), while the runtime
// instances are built by `createBetterAuthOptions`. The two are only kept in
// sync by convention — this test makes the convention executable by capturing
// the adapter's options getter at the `createApi` seam (the real
// implementation still runs) and comparing plugin ids and derived tables.

const captured = vi.hoisted(() => ({
  adapterOptions: undefined as (() => BetterAuthOptions) | undefined,
}))

vi.mock('@convex-dev/better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@convex-dev/better-auth')>()
  const createApi: typeof actual.createApi = (schema, getOptions) => {
    captured.adapterOptions = getOptions as () => BetterAuthOptions
    return actual.createApi(schema, getOptions)
  }
  return { ...actual, createApi }
})

function pluginIds(options: Pick<BetterAuthOptions, 'plugins'>): string[] {
  return [...new Set((options.plugins ?? []).map(plugin => plugin.id))].sort()
}

/** Table names (as stored) the Better Auth schema of these options needs. */
function tableNames(options: BetterAuthOptions): string[] {
  return [...new Set(Object.values(getAuthTables(options)).map(table => table.modelName))].sort()
}

function adapterOptions(): BetterAuthOptions {
  expect(captured.adapterOptions, 'adapter.ts must build its api through createApi').toBeTypeOf('function')
  return captured.adapterOptions!()
}

/**
 * The runtime plugin surface is split across two instances (see `setupAuth`):
 * the main instance from `createBetterAuthOptions`, and a sign-only instance
 * that carries the jwt plugin (it cannot sit on the main instance — Better
 * Auth dedupes plugins by id and a top-level jwt would displace the convex
 * plugin's internal one). The adapter schema must cover both.
 */
function runtimeOptions(config: Parameters<typeof createBetterAuthOptions>[1] = {}): BetterAuthOptions {
  const main = createBetterAuthOptions({} as never, config) as BetterAuthOptions
  return { ...main, plugins: [...(main.plugins ?? []), jwt()] }
}

describe('adapter schema plugins ⇄ runtime plugins', () => {
  it('the adapter derives its schema from exactly the default runtime plugin set', () => {
    const adapter = pluginIds(adapterOptions())

    expect(adapter).toStrictEqual(pluginIds(runtimeOptions()))
    // The named defaults, so a change on either side reads as intent here too.
    expect(adapter).toStrictEqual(['admin', 'convex', 'email-otp', 'jwt', 'mcp', 'organization', 'passkey'])
  })

  it('every opt-out configuration stays within the adapter plugin set', () => {
    const adapter = new Set(pluginIds(adapterOptions()))

    for (const config of [
      { admin: false as const },
      { organization: false as const },
      { mcp: false as const },
      { admin: false as const, organization: false as const, mcp: false as const },
    ]) {
      for (const id of pluginIds(runtimeOptions(config))) {
        expect(adapter, `plugin "${id}" enabled by ${JSON.stringify(config)} has no adapter schema`).toContain(id)
      }
    }
  })

  it('the tables the adapter maps cover the runtime instances, and the component schema owns them all', () => {
    const adapterTables = tableNames(adapterOptions())
    const runtimeTables = tableNames(runtimeOptions())

    for (const table of runtimeTables) {
      expect(adapterTables, `runtime table "${table}" has no adapter mapping`).toContain(table)
    }
    for (const table of adapterTables) {
      expect(Object.keys(authSchema.tables), `table "${table}" is missing from the component schema`).toContain(table)
    }
  })

  it('the only table beyond the default runtime set is the opt-in database rate-limit store', () => {
    // Better Auth adds `rateLimit` to its schema only when
    // `rateLimit.storage === 'database'`. The runtime default leaves Better
    // Auth's own limiter on memory storage (the package's `setupRateLimiter`
    // guards OTP / agent flows instead), while the adapter declares database
    // storage so the table stays mappable for consumers who opt in through
    // `authOptions.rateLimit` — at which point both sides agree exactly.
    const adapterTables = tableNames(adapterOptions())
    const runtimeTables = tableNames(runtimeOptions())

    expect(adapterOptions().rateLimit).toStrictEqual({ storage: 'database' })
    expect(adapterTables.filter(table => !runtimeTables.includes(table))).toStrictEqual(['rateLimit'])
    expect(tableNames(runtimeOptions({ authOptions: { rateLimit: { storage: 'database' } } })))
      .toStrictEqual(adapterTables)
  })
})
