#!/usr/bin/env node
// Copies Panels (templates/panels) into the docs site, one way.
//
//   node scripts/sync-panels.mjs          write the synced files
//   node scripts/sync-panels.mjs --check  fail on any drift (CI)
//
// The site is the public demo of the Panels template: the same pages, the
// same components and the same backend, served under /playground. The
// template is a Nuxt 4 app (`app/` + `backend/`); the site keeps the flat
// layout (pages/, components/ … at its root), so `app/<x>` lands at
// `website/<x>` and `backend/<x>` at `website/backend/<x>`, byte for byte,
// with three exceptions:
//
// - `app/layouts/default.vue` becomes `layouts/panels.vue`: the site's
//   default layout is the docs', and its nuxt.config gives every
//   /playground route the Panels layout;
// - `app/pages/index.vue` becomes `pages/playground/index.vue`, the landing;
//   the other pages keep their paths and the site's `pages:extend` hook
//   mounts them under /playground (website/shared/panels.ts);
// - `backend/routes.ts` says `base = '/playground'`, where the site mounts
//   the pages, so the links the backend writes open there.
//
// What only the template has (its config, its root component, its
// stylesheet, its tests) is never copied; what only the site has (its
// config, its docs pages, the docs demos' counter, the try kit, codegen) is
// never written nor removed. In the folders the sync owns (backend/, pages/,
// layouts/) every other file is stale and removed; components/ is shared
// with the docs, so a component Panels drops is not found there.
//
// Edit Panels in templates/panels, then run `pnpm panels:sync`.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
export const SOURCE = join(root, 'templates/panels')
export const TARGET = join(root, 'website')

/** Where the site mounts Panels' pages; the site's copy of backend/routes.ts says it. */
export const BASE = '/playground'

/** The line of backend/routes.ts that says where the pages are mounted, as the template has it. */
export const BASE_LINE = 'export const base = \'\''

/** The template's folders that are copied: `app/` to the site's root, `backend/` to its backend. */
const FOLDERS = [
  { from: 'app', to: '' },
  { from: 'backend', to: 'backend' },
]

/** Template files moved on the way (template-relative → site-relative). */
export const RENAMED = {
  'app/layouts/default.vue': 'layouts/panels.vue',
  'app/pages/index.vue': 'pages/playground/index.vue',
}

/** Template-only, never copied: the app's frame and config, its stylesheet, tests and billing ids. */
export const TEMPLATE_ONLY = [
  /^app\/app\.vue$/,
  /^app\/app\.config\.ts$/,
  /^app\/error\.vue$/,
  /^app\/assets\//,
  // The catalog's ids for the template's own Polar organization; the site
  // syncs its own (`billing sync`), and owns the file.
  /^backend\/billing\.generated\.ts$/,
  // The pages' paths, which the module writes from each app's `backend.pages`.
  /^backend\/paths\.generated\.ts$/,
  // Tests run against the template (vitest.config.ts there); the site has no
  // runner for them, and Convex would push nothing from them anyway.
  /\.test\.ts$/,
]

/**
 * Site files the sync never writes nor removes. Its config and its own
 * pages, the docs demos' counter (`::demo-counter`), the try kit's seeding
 * functions, and what is generated for the site's own deployment and config
 * (codegen, the billing ids, the pages' paths the module writes from
 * `backend.pages`). components/ is the docs' too: only the files Panels has
 * are written there.
 */
export const OWNED = [
  /^nuxt\.config\.ts$/,
  /^app\.config\.ts$/,
  /^pages\/login\.vue$/,
  /^pages\/__parts\.vue$/,
  /^pages\/\[\[lang\]\]\//,
  /^pages\/playground\/offline\.vue$/,
  /^middleware\/playground-offline\.global\.ts$/,
  /^backend\/_generated\//,
  /^backend\/tsconfig\.json$/,
  /^backend\/counter\.ts$/,
  /^backend\/personas\.ts$/,
  /^backend\/billing\.generated\.ts$/,
  /^backend\/paths\.generated\.ts$/,
]

/** The site's folders the sync owns: a file there that is neither synced nor owned is stale. */
const MANAGED = ['backend', 'pages', 'layouts']

/** Folders a walk skips: tooling output and codegen. */
const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.data', '.convex', '_generated'])

const toPosix = path => path.split('\\').join('/')
const isOwned = file => OWNED.some(pattern => pattern.test(file))

function walkDir(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walkDir(path, base) : [toPosix(relative(base, path))]
  })
}

/** A template file's place on the site (site-relative), or `null` when it is not copied. */
export function targetOf(file) {
  if (TEMPLATE_ONLY.some(pattern => pattern.test(file))) return null
  if (file in RENAMED) return RENAMED[file]
  const folder = FOLDERS.find(({ from }) => file.startsWith(`${from}/`))
  if (!folder) return null
  const rest = file.slice(folder.from.length + 1)
  return folder.to ? `${folder.to}/${rest}` : rest
}

/** The site's backend/routes.ts: the template's, mounted under {@link BASE}. */
export function mountRoutes(text) {
  const lines = text.split('\n')
  const at = lines.indexOf(BASE_LINE)
  if (at === -1 || lines.lastIndexOf(BASE_LINE) !== at) throw new Error(`templates/panels/backend/routes.ts must say \`${BASE_LINE}\` on one line of its own`)
  lines[at] = `export const base = '${BASE}'`
  return lines.join('\n')
}

/** Every synced site path → the content it must have. */
export function expected() {
  const files = FOLDERS.flatMap(({ from }) => walkDir(join(SOURCE, from)).map(file => `${from}/${file}`)).sort()
  const want = new Map()
  for (const file of files) {
    const target = targetOf(file)
    if (!target) continue
    if (isOwned(target)) throw new Error(`templates/panels/${file} would overwrite website/${target}, which the site owns`)
    if (want.has(target)) throw new Error(`two template files land on website/${target}`)
    const text = readFileSync(join(SOURCE, file), 'utf8')
    want.set(target, file === 'backend/routes.ts' ? mountRoutes(text) : text)
  }
  return want
}

/**
 * A file's text, or `undefined` when it does not exist. One read instead of an
 * exists-then-read pair, so nothing can change between the two.
 */
function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  }
  catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

/** Differences between the site and the template: missing, changed, and stale files. */
export function drift() {
  const want = expected()
  const missing = []
  const changed = []
  for (const [file, content] of want) {
    const current = readIfExists(join(TARGET, file))
    if (current === undefined) missing.push(file)
    else if (current !== content) changed.push(file)
  }
  const stale = MANAGED
    .flatMap(folder => walkDir(join(TARGET, folder)).map(file => `${folder}/${file}`))
    .filter(file => !want.has(file) && !isOwned(file))
    .sort()
  return { missing, changed, stale }
}

function write() {
  const want = expected()
  let written = 0
  for (const [file, content] of want) {
    const target = join(TARGET, file)
    if (readIfExists(target) === content) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    written++
  }
  const { stale } = drift()
  for (const file of stale) rmSync(join(TARGET, file))
  console.log(`[panels] ${want.size} synced files: ${written} written, ${stale.length} removed`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const { missing, changed, stale } = drift()
    const problems = [
      ...missing.map(file => `missing  ${file}`),
      ...changed.map(file => `changed  ${file}`),
      ...stale.map(file => `stale    ${file} (not in templates/panels and not the site's own)`),
    ]
    if (problems.length) {
      console.error(`website/ drifted from templates/panels:\n  ${problems.join('\n  ')}\nRun \`pnpm panels:sync\`.`)
      process.exit(1)
    }
    console.log('[panels] website/ in step with templates/panels')
  }
  else {
    write()
  }
}
