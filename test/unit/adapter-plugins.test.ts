import { describe, expect, it, vi } from 'vitest'
import { getAuthTables } from 'better-auth/db'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { authSchema } from '../../src/convex/components/backend/schema'
import '../../src/convex/components/backend/adapter'

// The component adapter derives its Better Auth table map from a private,
// hand-maintained plugin list (`options` in adapter.ts), while the runtime
// instances are built by `buildAuthOptions`. The two are only kept in
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
 * The runtime plugin surface: the instance `buildAuthOptions` builds. The
 * adapter schema must cover it.
 */
function runtimeOptions(config: Parameters<typeof buildAuthOptions>[1] = {}): BetterAuthOptions {
  return buildAuthOptions({} as never, config) as BetterAuthOptions
}

describe('adapter schema plugins ⇄ runtime plugins', () => {
  it('the adapter derives its schema from exactly the default runtime plugin set', () => {
    const adapter = pluginIds(adapterOptions())

    expect(adapter).toStrictEqual(pluginIds(runtimeOptions()))
    // The named defaults, so a change on either side reads as intent here too.
    expect(adapter).toStrictEqual(['admin', 'convex', 'email-otp', 'last-login-method', 'nuxt-backend-client-address', 'nuxt-backend-secret-rotation', 'organization', 'passkey', 'passkey-only'])
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
    // `rateLimit.storage === 'database'`. The runtime default turns Better
    // Auth's own limiter off (the package's `setupRateLimiter` guards code /
    // agent flows instead), while the adapter declares database
    // storage so the table stays mappable for consumers who opt in through
    // `authOptions.rateLimit` — at which point both sides agree exactly.
    const adapterTables = tableNames(adapterOptions())
    const runtimeTables = tableNames(runtimeOptions())

    expect(adapterOptions().rateLimit).toStrictEqual({ storage: 'database' })
    expect(adapterTables.filter(table => !runtimeTables.includes(table))).toStrictEqual(['rateLimit'])
    expect(tableNames(runtimeOptions({ authOptions: { rateLimit: { storage: 'database' } } })))
      .toStrictEqual(adapterTables)
  })

  it('declares in schema.ts exactly the fields the runtime plugins write, table by table', () => {
    // A plugin option that adds a field (lastLoginMethod's `storeInDatabase`,
    // say) must land in the component schema too, or every write fails
    // validation; a field nothing writes is dead weight. Better Auth's `id`
    // is Convex's `_id`, so it never appears on either side.
    const options = runtimeOptions({ authOptions: { rateLimit: { storage: 'database' } } })
    const schemaTables = authSchema.tables as unknown as Record<string, { validator: { fields: Record<string, unknown> } }>
    for (const table of Object.values(getAuthTables(options))) {
      const runtimeFields = Object.entries(table.fields).map(([key, field]) => field.fieldName ?? key).sort()
      const schemaFields = Object.keys(schemaTables[table.modelName]!.validator.fields).sort()
      expect(schemaFields, `schema.ts "${table.modelName}"`).toStrictEqual(runtimeFields)
    }
  })
})
