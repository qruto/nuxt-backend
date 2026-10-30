import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { repairProjectFiles } from '../../src/cli/repair'
import { readConvexConfigDrift } from '../../src/convex-config'
import { checkoutBaseStarter, removeFixture, UPGRADE_BASE } from '../helpers/upgrade-fixture'
import { prepareExampleApp, type PreparedExampleApp } from './helpers/example-app'

// The upgrade fixture, built: the starter as it shipped at UPGRADE_BASE,
// repaired by `doctor --fix`, must typecheck and build against this
// checkout. test/unit/upgrade-fixture.test.ts asserts what the repair adds;
// this proves the result is an app, once the one edit the Upgrade page
// leaves to the reader is made (`billing.api` no longer has
// `getWebhookDeliveries`: it lives in backend/webhooks.ts, which the repair
// writes). In the e2e project because the build
// takes about ten seconds.
//
// The fixture lives under the repository's .tmp/ (gitignored), so the app
// resolves every dependency from the repository's hoisted node_modules, the
// way the starter's own e2e run does.

const repoDir = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(import.meta.url)
const binOf = (pkg: string, bin: string) => join(dirname(require.resolve(`${pkg}/package.json`)), bin)

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

/** The `tsconfig.json` `convex dev` writes into a functions directory. */
const CONVEX_TSCONFIG = {
  compilerOptions: {
    strict: true,
    moduleResolution: 'Bundler',
    skipLibCheck: true,
    allowSyntheticDefaultImports: true,
    target: 'ESNext',
    lib: ['ES2023', 'dom'],
    forceConsistentCasingInFileNames: true,
    module: 'ESNext',
    isolatedModules: true,
    noEmit: true,
  },
  include: ['./**/*'],
  exclude: ['./_generated'],
}

/** A mount's generated component type, as `convex dev` writes it: `nuxt-backend/convex.config` → `nuxt-backend/_generated/component.js`. */
function componentTypeOf(from: string): string {
  return from.replace(/\/convex\.config(?:\.js)?$/, '/_generated/component.js')
}

let dir: string
let app: PreparedExampleApp | undefined

beforeAll(async () => {
  dir = checkoutBaseStarter(join(repoDir, '.tmp'))
  await repairProjectFiles(dir)
  const billing = join(dir, 'backend/billing.ts')
  writeFileSync(billing, readFileSync(billing, 'utf8').replace(', getWebhookDeliveries,\n} = billing.api', ',\n} = billing.api'))
  app = prepareExampleApp(dir)
  // The offline codegen (`--system-udfs`) writes no `components`, which only
  // a deployment's analysis of convex.config.ts can: declare the mounts the
  // repaired file makes, the way that analysis would.
  const mounted = (await readConvexConfigDrift(dir)).mounts.filter(mount => mount.mounted)
  appendFileSync(join(app.generatedDir, 'api.d.ts'), [
    '',
    'export declare const components: {',
    ...mounted.map(({ from, name }) => `  ${name}: import("${componentTypeOf(from)}").ComponentApi<"${name}">;`),
    '};',
    '',
  ].join('\n'))
  appendFileSync(join(app.generatedDir, 'api.js'), '\nimport { componentsGeneric } from "convex/server";\nexport const components = componentsGeneric();\n')
  writeFileSync(join(dir, 'backend/tsconfig.json'), `${JSON.stringify(CONVEX_TSCONFIG, null, 2)}\n`)
}, 120_000)

afterAll(() => {
  app?.cleanup()
  if (dir) removeFixture(dir)
})

describe(`the ${UPGRADE_BASE} starter, after doctor --fix`, () => {
  it('typechecks its backend against this checkout', () => {
    let output = ''
    try {
      execFileSync(process.execPath, [binOf('typescript', 'bin/tsc'), '--noEmit', '-p', join(dir, 'backend/tsconfig.json')], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
    }
    catch (error) {
      output = String((error as { stdout?: string }).stdout ?? error)
    }
    expect(output).toBe('')
  })

  it('builds', () => {
    execFileSync(process.execPath, [binOf('nuxt', 'bin/nuxt.mjs'), 'build', dir], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] })
    expect(existsSync(join(dir, '.output/server/index.mjs'))).toBe(true)
  }, 300_000)
})
