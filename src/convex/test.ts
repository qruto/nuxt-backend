/// <reference types="vite/client" />
import type { TestConvex } from 'convex-test'
import { defineSchema, type GenericSchema, type SchemaDefinition } from 'convex/server'

const backend = import.meta.glob('./components/backend/**/*.ts')

/**
 * Register the nuxt-backend all-in-one `backend` component with a test Convex
 * instance.
 *
 * The component owns its auth schema locally (hybrid component pattern), so no
 * upstream `betterAuth` child component is registered. Note convex-test does
 * not model nested components, so the email provider child inside `backend` is
 * not exercised here.
 *
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 *
 * @example
 * ```ts
 * import { convexTest } from 'convex-test'
 * import component from 'nuxt-backend/convex/test'
 * import schema from './schema'
 *
 * const t = convexTest(schema, modules)
 * component.register(t)
 * ```
 */
export function register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>) {
  t.registerComponent('backend', defineSchema({}), backend)
}

export default { register, modules: { backend } }
