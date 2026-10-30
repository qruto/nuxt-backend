import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The upgrade fixture. templates/starter as an earlier release shipped it,
// a committed snapshot that scripts/upgrade-fixture.mjs writes from git
// history (no network, no history needed at test time): the unit test
// asserts what `doctor --fix` adds to it, the e2e test also typechecks and
// builds the result.

/**
 * The snapshot the fixture upgrades from, by its label under
 * test/fixtures/upgrade/: C9b's starter, the last scaffold before
 * maintenance (F3). At each release, write the last published starter
 * there (`node scripts/upgrade-fixture.mjs <tag> <label>`), point this at
 * it, and empty {@link ADDED_SINCE_BASE}.
 */
export const UPGRADE_BASE = 'c9b'

/**
 * What the scaffold gained after {@link UPGRADE_BASE}, which the repair must
 * add to the old starter: backend files, `convex.config.ts` mounts (by
 * component name) and forwarded env names, and `registerBackendRoutes` route
 * groups in `http.ts`.
 * Two changes are not additions. DEFER dropped the agent token exchange (`mcp`)
 * from `auth.ts` and `http.ts`, and ENV dropped the forwarded `EMAIL_TEST_MODE`
 * from `convex.config.ts`: the repair does not rewrite an app's code (it names a
 * stale forward in the `convex-config` finding instead), so the snapshot's
 * three files were edited by hand to match. SIMPLIFY slimmed the scaffold: its
 * empty aggregates.ts, migrations.ts, search.ts and crons.ts went, with the
 * action cache, aggregate and migrations mounts, and functions.ts, billing.ts,
 * email.ts, auth.ts and ai.ts moved off the subpaths and bags it removed, so
 * the snapshot lost those files and mounts and took today's five by hand.
 * Every later PR that changes the scaffold adds its own here.
 */
export const ADDED_SINCE_BASE = {
  /** F4a: audit.ts, the activity trail's setupAudit and its reads. F7: admin.ts, the admin console's setupAdmin and its reads. FLAGS: flags.ts, setupFlags with the app's flags and its reads. NOTIFY: notifications.ts, setupNotifications and the reads and writes of the in-app inbox (audit.ts passes it to setupAudit). F8: account.ts, setupAccount with the export and the providers' part of an erasure. OPS1: webhooks.ts, setupWebhooks with the delivery log and its replay. SETUP: paths.generated.ts, the paths nuxt.config declares, which the module writes. PREFS: brand.generated.ts, the brand app.config declares. */
  files: ['audit.ts', 'notifications.ts', 'account.ts', 'admin.ts', 'webhooks.ts', 'flags.ts', 'paths.generated.ts', 'brand.generated.ts'],
  /** F14: the sharded counter and workpool components. */
  mounts: ['shardedCounter', 'workpool'],
  routes: [] as string[],
  /** MON: the monitoring DSN, forwarded to the backend component for its cron's check-ins. ENV: the deployment's kind, which email's test mode and the cron's environment read. */
  forwards: ['BACKEND_ENVIRONMENT', 'MONITORING_DSN'],
}

/** Write a fixture's files into a new directory under `parent` and return it. */
function checkout(parent: string, fixture: string): string {
  const { files } = JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/upgrade/${fixture}`, import.meta.url)), 'utf-8')) as { files: Record<string, string> }
  mkdirSync(parent, { recursive: true })
  const dir = mkdtempSync(join(parent, 'upgrade-'))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), contents)
  }
  return dir
}

/** Write the {@link UPGRADE_BASE} starter into a new directory under `parent` and return it. */
export function checkoutBaseStarter(parent: string): string {
  return checkout(parent, `${UPGRADE_BASE}/starter.json`)
}

/** Remove a fixture directory. */
export function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
