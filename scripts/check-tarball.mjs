// The publishable-package gate, defined once. `ci`'s pack job and `release`'s
// build job both run this against the tarball they just produced, so a release
// artifact can never skip a check a pull request was failed for.
//
// Resolves the tarball itself rather than letting the shell expand
// `nuxt-backend-*.tgz`: `*.tgz` is gitignored, so a stale local pack leaves a
// second file and the glob would silently hand two arguments to publint.
import { execFileSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { AGENT_SKILLS } from '../src/guidance/skills.ts'
import { measure, overBudget, readBudgets } from './budgets.mjs'
import { step } from './lib/step.mjs'

const root = process.cwd()
const tarballs = readdirSync(root).filter(f => /^nuxt-backend-.*\.tgz$/.test(f))

if (tarballs.length === 0) {
  console.error('check:tarball: no nuxt-backend-*.tgz here — run `pnpm pack` first.')
  process.exit(1)
}
if (tarballs.length > 1) {
  console.error(`check:tarball: ${tarballs.length} tarballs present (${tarballs.join(', ')}).`)
  console.error('Delete the stale ones — the checks below must run against exactly one artifact.')
  process.exit(1)
}

const tarball = join(root, tarballs[0])
console.log(`check:tarball: ${tarballs[0]}\n`)

const run = (label, file, args) => step(label, file, args, { cwd: root })

// Manifest and exports shape. `--strict` turns publint's suggestions into
// errors too: the package ships two surfaces (Nuxt module, Convex component)
// through one exports map, and a lax entry in either is a consumer's bug.
run('Package shape (publint)', 'pnpm', ['exec', 'publint', 'run', '--strict', tarball])

// Type resolution across every export subpath.
run('Type resolution (arethetypeswrong)', 'pnpm', [
  'exec',
  'attw',
  tarball,
  '--profile',
  'esm-only',
])

// ── Contents ─────────────────────────────────────────────────────────────────
//
// What the tarball must and must not carry. `pnpm pack` runs prepack (the full
// build), and `dev:prepare` before it symlinks dist/runtime at src/runtime — so
// a build that silently did not happen would ship TypeScript sources instead
// of declarations. The Convex half is different on purpose: `src/convex` ships
// (the `./test` export is a Vite-only source file, like every official
// component's) and `dist/convex` carries sourcemaps that resolve into it.
console.log('── Tarball contents ───────────────────────────')
const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const problems = []
const has = file => files.includes(`package/${file}`)

for (const required of [
  // The Nuxt module: entry, types, the meta the registry and DevTools read.
  'dist/module.js',
  'dist/types.d.ts',
  'dist/module.json',
  // The CLI (`nuxt-backend` bin).
  'dist/cli.mjs',
  // The ESLint preset (`nuxt-backend/eslint`).
  'dist/eslint.mjs',
  'dist/eslint.d.mts',
  // The English messages the module registers with an app's @nuxtjs/i18n.
  'dist/runtime/locales/en.json',
  // The DevTools panel, prebuilt (see below for its assets).
  'dist/devtools-client/index.html',
  // The DevTools tab icon, served from the panel: a missing file is a broken image in every app's DevTools.
  'dist/devtools-client/icon.svg',
  // The Convex component: what `app.use(backend)` imports, and the
  // ComponentApi a consumer's codegen types `components.backend.*` against.
  'dist/convex/components/backend/convex.config.js',
  'dist/convex/components/backend/convex.config.d.ts',
  'dist/convex/components/backend/_generated/component.d.ts',
  // The convex-test helper and everything its `import.meta.glob` reaches —
  // convex-test derives the module root from the `_generated/` entry.
  'src/convex/test.ts',
  'src/convex/components/backend/schema.ts',
  'src/convex/components/backend/_generated/api.ts',
  'src/convex/components/backend/_generated/component.ts',
  'src/convex/components/backend/_generated/server.ts',
  // The agent guidance, read from node_modules so it matches the installed
  // version: the AGENTS.md section `init` writes points at the core skill's
  // SKILL.md, and `init` copies every skill below into an app. Each task
  // skill's SKILL.md is required below, from the registry.
  'skills/nuxt-backend/SKILL.md',
  'skills/nuxt-backend/references/api.md',
  'skills/nuxt-backend/references/surface.json',
  'skills/nuxt-backend/references/renames.json',
  'skills/nuxt-backend-upgrade/references/upgrade.md',
  // Every skill src/guidance/skills.ts names: the core and each task skill,
  // with the API file of each one that owns names.
  ...AGENT_SKILLS.map(skill => skill.name).flatMap(name => [
    `skills/${name}/SKILL.md`,
    ...existsSync(join(root, 'skills', name, 'references/api.md')) ? [`skills/${name}/references/api.md`] : [],
  ]),
  'README.md',
  'LICENSE',
]) {
  if (!has(required)) problems.push(`missing: ${required}`)
}

// Without the built DevTools client the module would proxy every consumer's
// panel to localhost:3631. Matched without the hashed directory segment,
// which is not part of the contract.
const devtools = files.filter(f => f.includes('/dist/devtools-client/') && f.includes('/_nuxt/'))
if (devtools.length === 0) {
  problems.push('dist/devtools-client carries no built assets — the DevTools panel would proxy to localhost:3631 for every consumer')
}

// Sources: only the Convex half, and never its tests.
const sources = files.filter(f => /\.[mc]?ts$/.test(f) && !/\.d\.(?:vue\.)?[mc]?ts$/.test(f))
for (const file of sources) {
  if (!file.startsWith('package/src/convex/')) {
    problems.push(`TypeScript source outside src/convex: ${file} — dist/runtime is probably still the dev:prepare symlink into src/`)
  }
}
for (const file of files) {
  if (/\.test(?:-d)?\.[mc]?[jt]sx?$/.test(file)) problems.push(`ships a test: ${file}`)
  // The packaged UI ships as source SFCs and stylesheets (components and pages), so a consumer can eject
  // them; everything else under src/runtime is built into dist/runtime.
  if (file.startsWith('package/src/runtime/') && !/^package\/src\/runtime\/vue\/(?:components\/.+\.(?:vue|css)|pages\/[^/]+\.vue)$/.test(file)) {
    problems.push(`src/runtime must not ship beyond the packaged .vue/.css components and pages (the module runtime is built into dist/runtime): ${file}`)
  }
  if (file.endsWith('.map') && !file.startsWith('package/dist/convex/')) problems.push(`sourcemap outside dist/convex: ${file}`)
  if (/\/\.env(?:\.|$)/.test(file) || file.endsWith('.log') || file.endsWith('.tgz')) problems.push(`must never ship: ${file}`)
}

const extracted = mkdtempSync(join(tmpdir(), 'nuxt-backend-tarball-'))
try {
  execFileSync('tar', ['-xzf', tarball, '-C', extracted], { stdio: 'inherit' })
  const pkgRoot = join(extracted, 'package')
  const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

  // The bin must be executable as-is; unbuild writes the shebang for `bin`
  // entries, and nothing else asserts it survived the build.
  const cliHead = readFileSync(join(pkgRoot, 'dist/cli.mjs'), 'utf8').split('\n')[0]
  if (cliHead !== '#!/usr/bin/env node') problems.push(`dist/cli.mjs does not start with a node shebang (got: ${JSON.stringify(cliHead)})`)

  // The ESLint preset's declarations reference ESLint's own types. When the
  // bundler cannot see `eslint` as a peer it inlines them (~100 kB), and the
  // preset's `Linter.Config[]` stops matching the consumer's ESLint.
  const eslintTypes = readFileSync(join(pkgRoot, 'dist/eslint.d.mts'), 'utf8')
  if (!/from ['"]eslint['"]/.test(eslintTypes)) problems.push('dist/eslint.d.mts inlines the ESLint types instead of importing them from `eslint`')

  // Each skill's links between its own files (SKILL.md to its references,
  // the references to each other) must land inside the tarball: an agent
  // follows them from node_modules, where nothing else is there.
  for (const file of files.filter(f => f.startsWith('package/skills/') && f.endsWith('.md'))) {
    for (const [, href] of readFileSync(join(extracted, file), 'utf8').matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(href)) continue
      if (!files.includes(join(dirname(file), href).split('\\').join('/'))) problems.push(`${file.slice('package/'.length)} links ${href}, which the tarball does not carry`)
    }
  }

  // The registry listing's website and the DevTools docs link come from here.
  const moduleMeta = JSON.parse(readFileSync(join(pkgRoot, 'dist/module.json'), 'utf8'))
  if (!moduleMeta.docs) problems.push('dist/module.json has no `docs` — the nuxt/modules listing would fall back to the GitHub URL')
  if (moduleMeta.version !== manifest.version) problems.push(`dist/module.json says ${moduleMeta.version}, package.json ${manifest.version}`)

  // Node and Convex's bundler load the Convex half as it ships, with no
  // extension guessing: every relative import names a file that exists, as
  // written. The backend's health route reaches beyond `dist/convex` into
  // the layer and env registries the Convex build emits beside it
  // (scripts/build-convex-component.mjs), so those are held to it too.
  for (const file of files.filter(f => /^package\/dist\/(?:(?:convex|capabilities|devtools|findings)\/.+|env-registry)\.js$/.test(f))) {
    const code = readFileSync(join(extracted, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, specifier] of code.matchAll(/(?:\bfrom|\bimport\s*\(|\bimport)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!files.includes(join(dirname(file), specifier).split('\\').join('/'))) problems.push(`${file.slice('package/'.length)} imports ${specifier}, which the tarball does not carry as written (Node loads no other)`)
    }
  }

  // mkdist doubles the extension of a specifier that already ends in `.js`
  // (a runtime file importing `../../../convex/errors.js` declared
  // `errors.js.js`), and the types behind it read as `any`. attw only follows
  // the export map, so a runtime declaration reached through an auto-import
  // gets its own check.
  const runtimeDeclarations = files.filter(f => f.startsWith('package/dist/runtime/') && f.endsWith('.d.ts'))
  for (const file of runtimeDeclarations) {
    if (/\.js\.js['"]/.test(readFileSync(join(extracted, file), 'utf8'))) problems.push(`${file.slice('package/'.length)} imports a doubled \`.js.js\` path`)
  }

  // A consumer's package manager runs these. This package has none to run,
  // and one shipped by mistake (a pnpm-only `preinstall`, once) breaks
  // `npm install` for every npm user.
  for (const script of ['preinstall', 'install', 'postinstall']) {
    if (manifest.scripts?.[script]) problems.push(`package.json ships a \`${script}\` script — consumers would run it: ${manifest.scripts[script]}`)
  }

  // UnoCSS writes an icon's rule only when it can load the icon set while the
  // panel builds. Without it the panel still builds, with every icon blank —
  // nuxt-convex-module 0.10.0 shipped that way. The Overview tab's icon stands
  // for all of them.
  const panelAssets = join(pkgRoot, 'dist/devtools-client/_nuxt')
  const panelCss = readdirSync(panelAssets).filter(f => f.endsWith('.css')).map(f => readFileSync(join(panelAssets, f), 'utf8')).join('')
  if (!/\.carbon-dashboard\b/.test(panelCss)) problems.push('the DevTools panel stylesheet has no icon rules — @iconify-json/carbon did not load when it was built')

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`  ✓ ${files.length} entries · sources only under src/convex · maps only under dist/convex · no tests, no lifecycle scripts · devtools-client built (${devtools.length} assets, icons included)\n`)

  // ── Size ─────────────────────────────────────────────────────────────────────
  //
  // Everything a consumer installs is counted, against the `tarball` budget in
  // budgets.json (5% above its last measurement), so a stray build output or a
  // dependency bundled by mistake fails here instead of shipping. A change that
  // grows the package on purpose moves the budget: `pnpm budgets:update`.
  console.log('── Size ───────────────────────────────────────')
  const { ceiling } = readBudgets().tarball
  const size = measure(pkgRoot)
  const over = overBudget(size, ceiling)
  if (over.length > 0) {
    console.error(`  ✗ over the tarball budget: ${over.join('; ')}. If the growth is intended, run \`pnpm budgets:update\` and say why in the change.`)
    process.exit(1)
  }
  console.log(`  ✓ ${size.bytes.toLocaleString('en')} bytes in ${size.files} files (ceiling ${ceiling.bytes.toLocaleString('en')} / ${ceiling.files})\n`)

  // ── Phantom dependencies ───────────────────────────────────────────────────
  //
  // Every bare specifier reachable from an export must be something a consumer
  // is guaranteed to have: a dependency, a peer, a Node builtin, or what the
  // host provides (Nuxt's aliases, vue through the peer, nitropack through
  // Nuxt). The repository cannot notice a missing one: the hoisted linker
  // resolves anything in the workspace, and npm hoists the same way in the
  // smoke install. Only a strict (isolated) install fails, at the consumer.
  //
  // It walks the shipped code rather than probing an install: no network, the
  // same answer every time, and it sees a specifier behind a dynamic import
  // that a probe would only reach by running that code path.
  console.log('── Phantom dependencies ───────────────────────')

  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])
  // What the host guarantees without a declaration here.
  const provided = new Set([
    'nitropack', // Nuxt's server engine; module runtime code imports its runtime helpers
    'nuxt', // the module runs inside a Nuxt app (kit auto-imports, `nuxt/app`)
  ])
  // What only the Vite-only `./test` helper may reach.
  const testOnly = new Set(['convex-test', 'vite'])
  const builtins = new Set(builtinModules)
  // Optional peers are declared, so the check below would let them through —
  // but a consumer who skipped one gets ERR_MODULE_NOT_FOUND from any code
  // path that reaches it. Only the subpath that exists for it may.
  const optionalPeers = new Set(Object.entries(manifest.peerDependenciesMeta ?? {}).filter(([, meta]) => meta?.optional).map(([name]) => name))
  const optionalPeerHomes = {
    './eslint': ['eslint', '@convex-dev/eslint-plugin'],
    './test': ['convex-test'],
  }
  // Runtime directories that exist for an optional peer: the module
  // registers the files in them only once the peer resolves (the
  // error-reporting SDK, wired once it is installed and a DSN is set, by
  // src/nuxt/monitoring.ts), so nothing else reaches them.
  const optionalPeerDirs = {
    'dist/runtime/monitoring/sdk/': ['@sentry/nuxt'],
  }
  const homedInDir = (label, name) => Object.entries(optionalPeerDirs).some(([dir, peers]) => label.startsWith(dir) && peers.includes(name))
  // Optional peers the shipped code reaches only through `import()` inside a
  // `try`, from any entry: the AI SDK, loaded on the first model call
  // (src/convex/integrations/ai/models.ts), whose absence turns
  // into a refusal that says to install it, never ERR_MODULE_NOT_FOUND; and
  // the Convex AI Gateway's provider, whose absence hands a model id to the
  // next route. A static import of one is still a phantom. Each maps to how a
  // static import of it reads: `from 'ai'` or `import 'ai'`, a subpath too,
  // but not `import('ai')`.
  const dynamicOnlyPeers = new Map([
    ['ai', /(?:\bfrom|\bimport)\s*['"]ai(?:\/[^'"]*)?['"]/],
    ['@convex-dev/ai-sdk-provider', /(?:\bfrom|\bimport)\s*['"]@convex-dev\/ai-sdk-provider(?:\/[^'"]*)?['"]/],
    // BotID, loaded on the first request that needs it by the gate and the client plugin. The module
    // aliases `botid/*` to src/runtime/protection/botid-absent when the app has not installed it, and
    // wires no bot check then, so the absence never reaches a consumer as ERR_MODULE_NOT_FOUND.
    ['botid', /(?:\bfrom|\bimport)\s*['"]botid(?:\/[^'"]*)?['"]/],
    // Convex's Agent and RAG components, loaded on the first `ai.chat` or `ai.knowledge` call
    // (src/convex/integrations/ai/chat.ts, knowledge.ts), whose absence turns into a refusal that
    // says to install the component; the test kit loads their helpers the same way.
    ['@convex-dev/agent', /(?:\bfrom|\bimport)\s*['"]@convex-dev\/agent(?:\/[^'"]*)?['"]/],
    ['@convex-dev/rag', /(?:\bfrom|\bimport)\s*['"]@convex-dev\/rag(?:\/[^'"]*)?['"]/],
  ])

  // `from '…'`, `import '…'`, `import('…')`, `export … from '…'`.
  const SPECIFIER = /(?:\bexport\s*\*\s*from|\bfrom|\bimport\s*\(|\bimport)\s*['"]([^'"]+)['"]/g
  // Block comments are stripped first: doc comments carry usage examples that
  // name packages no code imports.
  const CODE_ONLY = /\/\*[\s\S]*?\*\//g
  const TYPE_IMPORT = /\b(?:import|export)\s+type\b[^;]*?\sfrom\s*['"][^'"]+['"]/g

  /** The package a specifier names, or null for a relative path, a builtin, a `#` alias — or a string that is no specifier at all (a template, a message). */
  const packageName = (specifier) => {
    if (!/^[\w@#./:-]+$/.test(specifier)) return null
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null
    const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier
    const parts = bare.split('/')
    const name = bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    return builtins.has(name) ? null : name
  }

  /** Where a relative specifier might land: as written, with an extension, or as a directory index. */
  const candidates = (file, specifier) => {
    const target = resolve(dirname(file), specifier)
    const bare = target.replace(/\.(js|mjs|ts)$/, '')
    return [target, `${bare}.js`, `${bare}.mjs`, `${bare}.ts`, join(target, 'index.js'), join(target, 'index.mjs'), join(target, 'index.ts')]
  }

  /** The file a self-referencing specifier points at (`nuxt-backend/billing` → its export), or null. */
  const ownSubpath = (specifier) => {
    if (specifier !== manifest.name && !specifier.startsWith(`${manifest.name}/`)) return null
    const key = specifier === manifest.name ? '.' : `.${specifier.slice(manifest.name.length)}`
    const entry = (manifest.exports ?? {})[key]
    if (!entry) return null
    return typeof entry === 'string' ? entry : entry.default ?? entry.import ?? null
  }

  const readOrNull = (file) => {
    try {
      return readFileSync(file, 'utf8')
    }
    catch {
      return null
    }
  }

  /** The specifiers `file` imports, doc comments stripped. */
  const specifiersOf = (file) => {
    const code = readOrNull(file)
    return code === null ? [] : [...code.replace(CODE_ONLY, '').matchAll(SPECIFIER)].map(([, specifier]) => specifier)
  }

  /**
   * Where one specifier leads: the files to walk next (a relative import, or
   * a self-reference through the exports map) and the bare package it names,
   * if any.
   */
  const follow = (file, specifier) => {
    const own = ownSubpath(specifier)
    if (own) return { next: [join(pkgRoot, own)] }
    const name = packageName(specifier)
    if (name) return { next: [], name }
    return { next: specifier.startsWith('.') ? candidates(file, specifier) : [] }
  }

  /** Whether `file` reaches `name` only through `import()`: a dynamic-only peer it never imports statically. */
  const reachedDynamically = (file, name) => {
    const staticImport = dynamicOnlyPeers.get(name)
    // A type-only import is erased from the JavaScript, so it is no static import.
    const code = (readOrNull(file)?.replace(CODE_ONLY, '') ?? '').replace(TYPE_IMPORT, '')
    return staticImport !== undefined && !staticImport.test(code)
  }

  /** Every bare package name reachable from `entry` through relative and self imports, with one file that imports it. */
  const reachable = (entry) => {
    const seen = new Set()
    const bare = new Map()
    const queue = [entry]
    while (queue.length > 0) {
      const file = queue.pop()
      if (seen.has(file)) continue
      seen.add(file)
      for (const specifier of specifiersOf(file)) {
        const { next, name } = follow(file, specifier)
        queue.push(...next)
        if (name && !bare.has(name) && !reachedDynamically(file, name)) bare.set(name, file.slice(pkgRoot.length + 1))
      }
    }
    return bare
  }

  const phantoms = []
  const check = (label, entry, allowTestOnly = false) => {
    for (const [name, importer] of reachable(entry)) {
      if (optionalPeers.has(name) && !(optionalPeerHomes[label] ?? []).includes(name) && !homedInDir(label, name)) {
        phantoms.push(`${label} reaches the optional peer "${name}" (via ${importer}) — a consumer without it gets ERR_MODULE_NOT_FOUND`)
        continue
      }
      if (declared.has(name) || provided.has(name)) continue
      if (allowTestOnly && testOnly.has(name)) continue
      phantoms.push(`${label} reaches "${name}" (via ${importer}), which is neither a dependency nor a peer`)
    }
  }

  let subpaths = 0
  for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
    if (subpath === './package.json') continue
    const target = typeof entry === 'string' ? entry : entry.default ?? entry.import
    if (!target) continue // types-only entries (the ComponentApi)
    subpaths += 1
    check(subpath, join(pkgRoot, target), subpath === './test')
  }

  // The module registers its runtime by path (plugins, components,
  // composables, pages, server handlers), so nothing imports those files and
  // the walk above never reaches them. Every one of them is a root of its own.
  const runtimeFiles = files
    .filter(f => f.startsWith('package/dist/runtime/') && /\.m?js$/.test(f))
    .map(f => f.slice('package/'.length))
  for (const file of runtimeFiles) check(file, join(pkgRoot, file))

  if (phantoms.length > 0) {
    for (const p of [...new Set(phantoms)]) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`  ✓ ${subpaths} subpaths + ${runtimeFiles.length} runtime files · every reachable package is declared (or host-provided: ${[...provided].join(', ')})\n`)
}
finally {
  rmSync(extracted, { recursive: true, force: true })
}

console.log('check:tarball: all good')
