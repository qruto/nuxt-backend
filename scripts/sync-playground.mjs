#!/usr/bin/env node
// Keeps examples/playground in step with the website's playground.
//
//   node scripts/sync-playground.mjs          write the synced files
//   node scripts/sync-playground.mjs --check  fail on any drift (CI)
//
// The example is the nuxt-backend.dev playground as a standalone app. It
// mirrors the website's flat layout (pages/, components/, backend/ … at the
// root, no app/ folder), so every synced file keeps its relative imports and
// is copied byte for byte. The set is not listed by hand: it starts from the
// playground's entry files and follows relative imports and component tags,
// so a component or helper the playground starts using is picked up on the
// next sync. Two things are not byte-identical:
//
// - app.css: Tailwind's `@theme static { … }` blocks become `:root { … }`.
//   They only declare custom properties, and the example has no Tailwind.
// - OWNED files: what differs between a docs site and a standalone app
//   (config, manifest, the offline page, a stand-in for the one Nuxt UI
//   component the layout uses). They are written by hand and never touched
//   here.
//
// Edit the playground in website/, then run `pnpm playground:sync`.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
export const SOURCE = join(root, 'website')
export const TARGET = join(root, 'examples/playground')

/** Where the walk starts, relative to website/. Directories are taken whole. */
const ENTRIES = [
  'pages/playground',
  'pages/login.vue',
  'layouts/playground.vue',
  'middleware/playground-offline.global.ts',
  'server/api',
  'backend',
  // The codegen the website commits: the playground pages import the
  // generated API at runtime, so the app builds only with it in place.
  // `convex dev` rewrites these for your deployment.
  'backend/_generated/api.d.ts',
  'backend/_generated/api.js',
  'backend/_generated/dataModel.d.ts',
  'backend/_generated/server.d.ts',
  'backend/_generated/server.js',
  'app.css',
  // The layout's logo (light and dark) and the tab icon.
  'public/logo-light.svg',
  'public/logo-dark.svg',
  'public/favicon.svg',
]

/** Never copied: the site's offline page talks about the site. */
const EXCLUDED = [
  /^pages\/playground\/offline\.vue$/,
]

/** Hand-written in the example; the sync neither writes nor removes them. */
export const OWNED = [
  '.env.example',
  '.gitignore',
  '.pnpmfile.mjs',
  '.stackblitz/start.mjs',
  '.stackblitzrc',
  'README.md',
  'app.config.ts',
  'app.vue',
  'assets/reset.css',
  'components/UColorModeImage.vue',
  'convex.json',
  'nuxt.config.ts',
  'package.json',
  'pages/playground/offline.vue',
  'tsconfig.json',
]

/**
 * Folders a directory walk skips: tooling output, and codegen (its tracked
 * files are listed in ENTRIES; `_generated/ai` is the Convex CLI's own).
 */
const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.data', '.convex', '_generated'])

const toPosix = path => path.split('\\').join('/')
const isFile = path => existsSync(path) && statSync(path).isFile()
const isDir = path => existsSync(path) && statSync(path).isDirectory()

function walkDir(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walkDir(path, base) : [toPosix(relative(base, path))]
  })
}

const IMPORT = /\b(?:from|import)(?:\s*\(\s*|\s+)['"]((?:\.{1,2}|~~?)\/[^'"]+)['"]/g
const TAG = /<([A-Z][A-Za-z0-9]+)[\s/>]/g

/** A relative or `~`/`~~` import of `file`, as a website-relative path. */
function resolveImport(file, request) {
  const base = request.startsWith('~')
    ? request.replace(/^~~?\//, '')
    : posix.normalize(posix.join(posix.dirname(file), request))
  if (base.startsWith('../')) throw new Error(`${file}: '${request}' leaves website/`)
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, `${base}/index.ts`]) {
    if (isFile(join(SOURCE, candidate))) return candidate
  }
  throw new Error(`${file}: cannot resolve '${request}'`)
}

/** The files a source file reaches: its relative imports, and its components. */
function references(file) {
  // Sources only: codegen is copied as it is, never walked.
  if (!/\.(?:vue|ts)$/.test(file) || file.includes('/_generated/')) return []
  const text = readFileSync(join(SOURCE, file), 'utf8')
  const imports = [...text.matchAll(IMPORT)]
    .map(([, request]) => request)
    // Codegen is listed in ENTRIES, not reached through imports.
    .filter(request => !/(?:^|\/)_generated(?:\/|$)/.test(request))
    .map(request => resolveImport(file, request))
  const components = file.endsWith('.vue')
    ? [...text.matchAll(TAG)].map(([, tag]) => `components/${tag}.vue`).filter(component => isFile(join(SOURCE, component)))
    : []
  return [...imports, ...components]
}

/** Every website file the playground reaches, website-relative. */
export function collect() {
  const queue = ENTRIES.flatMap(entry => (isDir(join(SOURCE, entry))
    ? walkDir(join(SOURCE, entry)).map(file => `${entry}/${file}`)
    : [entry]))
  const files = new Set()
  while (queue.length) {
    const file = queue.shift()
    if (files.has(file) || EXCLUDED.some(pattern => pattern.test(file))) continue
    if (!isFile(join(SOURCE, file))) throw new Error(`website/${file} does not exist`)
    files.add(file)
    queue.push(...references(file))
  }
  return [...files].sort()
}

const APP_CSS_HEADER = `/* Generated from website/app.css by scripts/sync-playground.mjs. Edit that
   file, then run \`pnpm playground:sync\`. Tailwind's \`@theme static\` blocks
   are \`:root\` here: they only declare custom properties, and this app has no
   Tailwind. */

`

/** The content a synced file must have in the example. */
function transform(file, source) {
  if (file !== 'app.css') return source
  const blocks = source.split('@theme static {').length - 1
  if (blocks === 0) throw new Error('website/app.css has no `@theme static` block — update the transform')
  return APP_CSS_HEADER + source.split('@theme static {').join(':root {')
}

/** Every synced target path → its expected content. */
export function expected() {
  const files = collect()
  const owned = files.filter(file => OWNED.includes(file))
  if (owned.length) throw new Error(`synced and owned at once: ${owned.join(', ')}`)
  return new Map(files.map(file => [file, transform(file, readFileSync(join(SOURCE, file)).toString('utf8'))]))
}

/** Differences between the example and the website: missing, changed, and stale files. */
export function drift() {
  const want = expected()
  const missing = []
  const changed = []
  for (const [file, content] of want) {
    const target = join(TARGET, file)
    if (!existsSync(target)) missing.push(file)
    else if (readFileSync(target, 'utf8') !== content) changed.push(file)
  }
  // The walk skips codegen folders; the files of backend/_generated count.
  const codegen = join(TARGET, 'backend/_generated')
  const generated = isDir(codegen)
    ? readdirSync(codegen, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => `backend/_generated/${entry.name}`)
    : []
  const stale = [...walkDir(TARGET), ...generated].filter(file => !want.has(file) && !OWNED.includes(file))
  return { missing, changed, stale }
}

function write() {
  const want = expected()
  let written = 0
  for (const [file, content] of want) {
    const target = join(TARGET, file)
    if (existsSync(target) && readFileSync(target, 'utf8') === content) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    written++
  }
  const { stale } = drift()
  for (const file of stale) rmSync(join(TARGET, file))
  console.log(`[playground] ${want.size} synced files: ${written} written, ${stale.length} removed`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const { missing, changed, stale } = drift()
    const problems = [
      ...missing.map(file => `missing  ${file}`),
      ...changed.map(file => `changed  ${file}`),
      ...stale.map(file => `stale    ${file} (not in the website's playground and not owned)`),
    ]
    if (problems.length) {
      console.error(`examples/playground drifted from website/:\n  ${problems.join('\n  ')}\nRun \`pnpm playground:sync\`.`)
      process.exit(1)
    }
    console.log('[playground] in step with website/')
  }
  else {
    write()
  }
}
