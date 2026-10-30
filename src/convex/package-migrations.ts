/**
 * The package's own data migrations: what a release needs done to data an
 * earlier one wrote in the `backend` component's tables. Each is defined in
 * `components/backend/migrations.ts` and runs through the migrations
 * component nested there, which records how far each one got, so
 * `nuxt-backend upgrade` starts only the ones a deployment has not finished,
 * in this order, one after another.
 *
 * A migration changes a document only while it still needs the change, so
 * running it again, or on data written after its release, changes nothing:
 * it costs one pass over its table. A release that needs none adds nothing
 * here, as most do — new fields are optional, customers are keyed lazily on
 * their next checkout or read, and the maintenance cron prunes what is no
 * longer kept. A release that does adds one entry here and its definition
 * there (test/convex-component/package-migrations.test.ts holds the two to
 * each other).
 */
export const PACKAGE_MIGRATIONS = [
  {
    name: 'personalWorkspaces',
    table: 'user',
    since: '0.2.0',
    does: 'gives each signed-in user without a workspace the personal one their sign-in would have made',
  },
  {
    name: 'activeWorkspaces',
    table: 'session',
    since: '0.2.0',
    does: 'activates a workspace on each live session that has none, so a signed-in user need not sign in again',
  },
] as const

/** A package migration's name, the export that defines it. */
export type PackageMigrationName = typeof PACKAGE_MIGRATIONS[number]['name']

/** Where a deployment is with a package migration. */
export type PackageMigrationState = 'pending' | 'running' | 'done' | 'failed'

/** A package migration and where a deployment is with it, as `migrations:status` reports it. */
export interface PackageMigrationStatus {
  name: PackageMigrationName
  since: string
  does: string
  state: PackageMigrationState
  /** Documents its passes have read so far. */
  processed: number
  /** Why it stopped, when it failed or was canceled. */
  error?: string
}
