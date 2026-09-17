/// <reference types="vite/client" />
import type { TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'
import resend from '@convex-dev/resend/test'
import schema from './components/backend/schema.js'

const modules = import.meta.glob('./components/backend/**/*.ts')

/**
 * Register the nuxt-backend all-in-one `backend` component with a test Convex
 * instance, the way the app mounts it: under its name, with its real schema
 * (indexes and document validation included), and with the email provider
 * child registered beneath it at `<name>/resend` — convex-test resolves a
 * component's own child calls to that path.
 *
 * The component owns its auth schema locally (hybrid component pattern), so
 * there is no upstream `betterAuth` child to register.
 *
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name the component is mounted under in `convex.config.ts`.
 *
 * @example
 * ```ts
 * import { convexTest } from 'convex-test'
 * import component from 'nuxt-backend/test'
 * import { components } from './_generated/api'
 * import schema from './schema'
 *
 * // `modules` is your functions directory's import.meta.glob
 * const t = convexTest(schema, modules)
 * component.register(t)
 * await t.query(components.backend.billing.getEntitlements, { ... })
 * ```
 */
export function register<Schema extends SchemaDefinition<GenericSchema, boolean>>(
  t: TestConvex<Schema>,
  name: string = 'backend',
): void {
  t.registerComponent(name, schema, modules)
  // The provider's helper is not generic over the app schema (it never reads it).
  resend.register(t as unknown as TestConvex<SchemaDefinition<GenericSchema, boolean>>, `${name}/resend`)
}

export default { register, schema, modules }
