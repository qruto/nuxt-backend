/// <reference types="vite/client" />
import type { TestConvex } from 'convex-test'
import { defineSchema, type GenericSchema, type SchemaDefinition } from 'convex/server'

const modules = import.meta.glob('./component/**/*.ts')

/**
 * Register the nuxt-backend component with a test Convex instance.
 *
 * The component owns its own auth schema locally (hybrid component pattern),
 * so no upstream `betterAuth` child component is registered.
 *
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 *   Defaults to `"backend"`.
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
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = 'backend',
) {
  t.registerComponent(name, defineSchema({}), modules)
}

export default { register, modules }
