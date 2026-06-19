import { Migrations } from '@convex-dev/migrations'
import type { GenericDataModel, GenericSchema, SchemaDefinition } from 'convex/server'

/** The component reference accepted by Migrations (`components.migrations`). */
type MigrationsComponent = ConstructorParameters<typeof Migrations>[0]

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- `void` is the upstream Migrations "no schema" case
export interface SetupMigrationsOptions<Schema extends SchemaDefinition<GenericSchema, boolean> | void> {
  /**
   * Your database schema. Recommended — it provides table types to
   * `migrations.define({ table, migrateOne })` and enables custom index ranges.
   */
  schema?: Schema
  /** Documents processed per transaction batch (default 100). */
  defaultBatchSize?: number
  /** Prefix added to function names when running migrations from the CLI. */
  migrationsLocationPrefix?: string
}

/**
 * Configure the {@link https://www.convex.dev/components/migrations | Migrations}
 * component for safe, online, batched schema migrations.
 *
 * Returns the `migrations` instance (use `migrations.define({ table, migrateOne })`)
 * and a generic `run` runner to invoke any migration from the CLI/dashboard.
 *
 * Pass your `schema` so `define()` gets table types. If you need to supply the
 * `internalMutation` builder instead, construct `Migrations` directly.
 *
 * @example
 * ```ts
 * import { setupMigrations } from 'nuxt-backend/convex/migrations'
 * import { components } from './_generated/api'
 * import schema from './schema'
 *
 * export const { migrations, run } = setupMigrations(components.migrations, { schema })
 *
 * export const backfillCompleted = migrations.define({
 *   table: 'todos',
 *   migrateOne: (_ctx, todo) => (todo.completed === undefined ? { completed: false } : undefined),
 * })
 * ```
 */
export function setupMigrations<
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- `void` is the upstream Migrations "no schema" case
  Schema extends SchemaDefinition<GenericSchema, boolean> | void = void,
>(
  component: MigrationsComponent,
  options?: SetupMigrationsOptions<Schema>,
) {
  const migrations = new Migrations<GenericDataModel, Schema>(component, options)
  return { migrations, run: migrations.runner() }
}
