/// <reference types="vite/client" />
import type { TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/test'

const modules = import.meta.glob('./**/*.ts')

/**
 * Register the nuxt-backend component with a test Convex instance.
 *
 * This also registers the `betterAuth` child component automatically.
 *
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 *   Defaults to `"backend"`.
 *
 * @example
 * ```ts
 * import { convexTest } from 'convex-test'
 * import component from 'nuxt-backend/test'
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
  t.registerComponent(name, undefined as any, modules)
  betterAuth.register(t, `${name}.betterAuth`)
}

export default { register, modules }
