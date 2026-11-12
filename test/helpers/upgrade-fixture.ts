import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The upgrade fixture. templates/starter as the last release shipped it, a
// committed snapshot that scripts/upgrade-fixture.mjs writes from git history
// (no network, no history needed at test time): the unit test asserts what
// `doctor --fix` adds to it, the e2e test also typechecks and builds the
// result. The repair machinery itself (test/unit/cli-upgrade.test.ts) runs on
// a drifted copy of it instead, {@link checkoutDriftedStarter}, so it has
// something to repair whatever the snapshot lacks.

/**
 * The snapshot the fixture upgrades from, by its label under
 * test/fixtures/upgrade/: the starter 0.5.0 shipped. At each release, write
 * the starter it shipped there (`node scripts/upgrade-fixture.mjs <tag>
 * <version>`), point this at it, empty {@link ADDED_SINCE_BASE} and delete
 * the old snapshot.
 */
export const UPGRADE_BASE = '0.5.0'

/**
 * What the scaffold gained after {@link UPGRADE_BASE}, which the repair must
 * add to the old starter: backend files, `convex.config.ts` mounts (by
 * component name) and forwarded env names, and `registerBackendRoutes` route
 * groups in `http.ts`. A change that is not an addition (a file, mount or
 * forward the scaffold drops) is edited into the snapshot by hand instead:
 * the repair does not rewrite an app's code. Every PR that changes the
 * scaffold adds its own here.
 */
export const ADDED_SINCE_BASE = {
  files: [] as string[],
  mounts: [] as string[],
  routes: [] as string[],
  forwards: [] as string[],
}

/**
 * What {@link checkoutDriftedStarter} takes out of the {@link UPGRADE_BASE}
 * starter, so the repair has one of each kind to put back: a backend file,
 * a mount (its import and its `app.use`) and a forwarded env name of
 * `convex.config.ts`. Not a list to keep up: a scaffold change touches it
 * only when it drops one of these three, and then the checkout throws and
 * names it.
 */
export const DRIFT = { file: 'flags.ts', mount: 'workpool', forward: 'MONITORING_DSN' } as const

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

/**
 * Write the {@link UPGRADE_BASE} starter into a new directory under `parent`,
 * {@link DRIFT} taken out, and return it: an older starter with known drift,
 * for the tests of the repair machinery (diffs, dry runs, links, a functions
 * directory outside the app).
 */
export function checkoutDriftedStarter(parent: string): string {
  const dir = checkoutBaseStarter(parent)
  rmSync(join(dir, 'backend', DRIFT.file))
  const config = join(dir, 'backend/convex.config.ts')
  let source = readFileSync(config, 'utf-8')
  for (const line of [
    `import ${DRIFT.mount} from '@convex-dev/${DRIFT.mount}/convex.config'\n`,
    `app.use(${DRIFT.mount})\n`,
    `    ${DRIFT.forward}: app.env.${DRIFT.forward},\n`,
  ]) {
    if (!source.includes(line)) throw new Error(`The ${UPGRADE_BASE} starter's convex.config.ts has no ${JSON.stringify(line)}: pick another DRIFT in test/helpers/upgrade-fixture.ts.`)
    source = source.replace(line, '')
  }
  writeFileSync(config, source)
  return dir
}

/**
 * What {@link customizeStarter} gives a starter: a brand and a label in
 * app.config, and a packaged page moved in nuxt.config, so the brand, labels
 * and paths files have something of the app's own to carry.
 */
export const CUSTOM = { brand: 'Panels', label: 'Your strip is ready', login: '/sign-in' } as const

/** Give the starter in `dir` the app config of {@link CUSTOM}: an app.config and a nuxt.config of its own. */
export function customizeStarter(dir: string): void {
  mkdirSync(join(dir, 'app'), { recursive: true })
  writeFileSync(join(dir, 'app/app.config.ts'), `export default defineAppConfig({ backend: { brand: { name: '${CUSTOM.brand}' }, labels: { notifications: { strip_ready: { title: '${CUSTOM.label}' } } } } })\n`)
  const config = join(dir, 'nuxt.config.ts')
  const source = readFileSync(config, 'utf-8')
  const modules = '  modules: [\'nuxt-backend\'],\n'
  if (!source.includes(modules)) throw new Error(`The ${UPGRADE_BASE} starter's nuxt.config.ts has no ${JSON.stringify(modules)}: update customizeStarter in test/helpers/upgrade-fixture.ts.`)
  writeFileSync(config, source.replace(modules, `${modules}  backend: { pages: { login: '${CUSTOM.login}' } },\n`))
}

/** Remove a fixture directory. */
export function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
