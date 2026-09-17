/// <reference types="vite/client" />
import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema } from 'convex/server'
import component from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'

// The consumer path of `nuxt-backend/test`: an app mounts the component under
// a name (`app.use(backend)` in convex.config.ts) and calls it through
// `components.backend.*` from its own `_generated/api`. The other files in
// this directory mount the component as the ROOT app, which never exercises
// `register()` — this one does, so the helper's schema, mount name and nested
// email child are proven the way a consumer's test sees them.
//
// `componentsGeneric()` is exactly what an app's generated `api.js` exports;
// the type is the component's own generated `ComponentApi`, as the app's
// `api.d.ts` imports it from `nuxt-backend/component/_generated/component`.
const appSchema = defineSchema({})
// convex-test locates an app's functions root from a `_generated/` entry in
// its module glob; this app has no functions, so the one entry is a stub.
const appModules = { './_generated/api.js': () => Promise.resolve({}) }
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, billing: ComponentApi<'billing'> }

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  // An app with no functions of its own; only the component is called.
  t = convexTest(appSchema, appModules)
  component.register(t)
})

describe('nuxt-backend/test registers the component as an app would mount it', () => {
  test('exposes the official helper shape', () => {
    expect(component.schema).toBeDefined()
    expect(typeof component.register).toBe('function')
    // Every function module and the schema, keyed by their glob path.
    for (const name of ['adapter', 'email', 'billing', 'gifts', 'webhooks', 'ai', 'schema']) {
      expect(Object.keys(component.modules).some(path => path.includes(`/${name}.ts`))).toBe(true)
    }
    // The generated files must be in the glob: convex-test derives the
    // module root from the `_generated/` path.
    expect(Object.keys(component.modules).some(path => path.includes('_generated/'))).toBe(true)
  })

  test('billing functions resolve their indexes through the boundary', async () => {
    // `getByUser` reads through `withIndex('userId')` — the call that threw
    // "not declared in the schema" while the helper registered an empty one.
    await expect(t.query(components.backend.billing.getByUser, { userId: 'user_1' })).resolves.toBeNull()
    await t.mutation(components.backend.billing.upsert, {
      userId: 'user_1',
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
      benefits: [],
      meters: [],
    })
    await expect(t.query(components.backend.billing.getByUser, { userId: 'user_1' })).resolves.toMatchObject({
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
    })
  })

  test('gifts round-trip on the indexed recipient email', async () => {
    const id = await t.mutation(components.backend.gifts.create, {
      recipientEmail: 'Friend@Example.com',
      purchaserUserId: 'user_1',
      productIds: ['prod_credits500'],
      billingCustomerId: 'cus_1',
    })
    expect(typeof id).toBe('string')
    const gifts = await t.query(components.backend.gifts.listByEmail, { email: 'friend@example.com', status: 'pending' })
    expect(gifts).toHaveLength(1)
    expect(gifts[0]).toMatchObject({ recipientEmail: 'friend@example.com', status: 'pending' })
  })

  test('the nested email child is registered at <name>/resend', async () => {
    // `status` forwards to the provider child, whose own validator rejects
    // the made-up id against ITS `emails` table — proof the call crossed into
    // `backend/resend`. Without the child registered the same call fails
    // earlier, with "Component \"backend/resend\" is not registered".
    await expect(t.query(components.backend.email.status, { emailId: 'missing' })).rejects.toThrow(/table "emails"/)

    const bare = convexTest(appSchema, appModules)
    bare.registerComponent('backend', component.schema, component.modules)
    await expect(bare.query(components.backend.email.status, { emailId: 'missing' })).rejects.toThrow(/not registered/)
  })

  test('mounts under any name the app chooses', async () => {
    const custom = convexTest(appSchema, appModules)
    component.register(custom, 'billing')
    await expect(custom.query(components.billing.billing.getByUser, { userId: 'u' })).resolves.toBeNull()
  })
})
