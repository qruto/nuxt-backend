// Type-check a consumer app against the BUILT package.
//
// This package's product is its types, and nothing else checks that the emitted
// `.d.ts` files actually compile in an app. `vue-tsc` in the `static` job checks
// the sources. `attw` checks that the declarations resolve. Neither answers the
// question a user has: with this tarball installed, does
// `useBilling()` in a page — and `setupBilling(components.backend, …)` in the
// app's Convex functions — type-check?
//
// It runs against the directory the pack job already installed the tarball into,
// so what gets checked is the real published package, not the workspace.
//
//   node scripts/check-consumer-types.mjs <app-dir>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { step } from './lib/step.mjs'

const appDir = process.argv[2]
if (!appDir) {
  console.error('usage: node scripts/check-consumer-types.mjs <app-dir>')
  process.exit(1)
}

// The checkers are the exact versions this repository resolved, read out of its
// own node_modules rather than from the manifest's ranges. Handing npm
// `vue-tsc: ^3.3.11` would install whatever is newest, so this job could check
// the published declarations with a different compiler than the `static` job
// used on the sources — and the two could then disagree about the same types.
const installed = (name) => {
  const path = new URL(`../node_modules/${name}/package.json`, import.meta.url)
  return JSON.parse(readFileSync(path, 'utf8')).version
}
const checkers = ['vue-tsc', 'typescript', '@types/node'].map(
  name => `${name}@${installed(name)}`,
)
console.log(`check:consumer-types: ${checkers.join(' ')}`)

// Nuxt's documented per-context setup, written out rather than extended: an
// app's tsconfig references the four generated contexts and holds no files of
// its own. https://nuxt.com/docs/4.x/guide/directory-structure/tsconfig
//
// The Convex functions directory needs no exclude here: none of the four
// contexts include it, and it is checked on its own below.
writeFileSync(
  join(appDir, 'tsconfig.json'),
  `${JSON.stringify({
    files: [],
    references: [
      { path: './.nuxt/tsconfig.app.json' },
      { path: './.nuxt/tsconfig.server.json' },
      { path: './.nuxt/tsconfig.shared.json' },
      { path: './.nuxt/tsconfig.node.json' },
    ],
  }, null, 2)}\n`,
)

const run = (label, file, args) => step(label, file, args, { cwd: appDir })

console.log(`check:consumer-types: ${appDir}\n`)

// npm, not pnpm: this directory was installed by the consumer's npm and has no
// pnpm workspace above it.
run('Install checkers', 'npm', ['install', '--no-audit', '--no-fund', '--no-save', ...checkers])

// Generates the four `.nuxt/tsconfig.*.json` the references above point at,
// plus the `#convex/*` aliases the module registers.
run('Prepare', 'npx', ['--no-install', 'nuxt', 'prepare'])

// `--build`, not `--noEmit`. The tsconfig above is solution-style — `files: []`
// plus four project references — and `vue-tsc --noEmit` on one of those checks
// nothing at all: it reports success having compiled zero files, so this would
// pass whatever the declarations do. Checked by planting a real type error in
// the consumer app: `--noEmit` exits 0, `--build` exits 2.
run('Type check the consumer', 'npx', ['--no-install', 'vue-tsc', '--build'])

// The other half of the package: the app's Convex functions (`backend/` — the
// scaffold's integrations, the `components.backend.*` references its codegen
// wrote, the component's own declarations under dist/convex). Convex checks
// this directory with the tsconfig it writes for a new project; the same file
// is written here when the app has none, and checked with the same compiler.
const functionsDir = join(appDir, 'backend')
if (existsSync(join(functionsDir, '_generated/api.d.ts'))) {
  const tsconfig = join(functionsDir, 'tsconfig.json')
  if (!existsSync(tsconfig)) {
    writeFileSync(tsconfig, `${JSON.stringify({
      compilerOptions: {
        allowJs: true,
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
    }, null, 2)}\n`)
  }
  run('Type check the Convex functions', 'npx', ['--no-install', 'tsc', '-p', functionsDir])
}
else {
  console.log('check:consumer-types: no backend/_generated in the app — the Convex functions were not codegen\'d, skipping their type check\n')
}

console.log('check:consumer-types: the published declarations compile in a real app')
