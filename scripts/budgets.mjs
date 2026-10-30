#!/usr/bin/env node
/**
 * The size budgets, kept in budgets.json: for each budget, what the package
 * measured when it was last set and the ceiling a check enforces, 5% above.
 *
 * - `tarball`: every file the packed tarball carries. check:tarball reads it,
 *   so a stray build output or a dependency bundled by mistake fails there
 *   instead of shipping.
 * - `install`: what installing the tarball adds to an empty project — the
 *   package and every dependency it brings, peers left out (they are the
 *   app's: Nuxt, Vue, Convex). A heavy new dependency fails here.
 * - `starter`: the JavaScript every page of templates/starter loads before
 *   it runs — the client entry and the chunks it imports statically —
 *   gzipped, built against the tarball (bytes only: how many chunks Vite
 *   splits it into is its business). What the package's plugins, the auth
 *   client and anything else imported eagerly cost every app.
 *
 * `--check` measures `install` and `starter` against their ceilings (CI's
 * pack job runs it as `pnpm check:budgets`). Both install from the registry
 * with no lockfile, as a new user does, so a dependency's own release can
 * move them with no change here: with `BUDGETS_MODE=warn` (CI's pull
 * requests) going over warns instead of failing; a push to main and the
 * weekly run fail.
 *
 * Moving a budget is a reviewed diff, never a hand-edited constant: after a
 * change that grows or shrinks the package on purpose,
 *
 *   pnpm pack && pnpm budgets:update [tarball] [install] [starter]
 *
 * measures the named budgets (the tarball's alone when none is named)
 * against the tarball beside package.json and rewrites them in
 * budgets.json. Say in the change why it grew.
 *
 * Either mode takes `--starter <dir>`, a templates/starter copy already
 * built against the tarball (the pack job's smoke test leaves one), instead
 * of building one in a temporary directory. Outside CI the installs this
 * script runs skip install scripts and take only versions published a day
 * or more ago.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BUDGETS = join(root, 'budgets.json')
/** How far above the last measurement a ceiling sits. */
const HEADROOM = 1.05
/** The npm a new user's install is measured with: the pack job's pin (see its smoke test for why). */
const NPM = ['--yes', 'npm@11.17.0']
/** Every budget, in the order budgets.json lists them. */
const NAMES = ['tarball', 'install', 'starter']

/** budgets.json, parsed. */
export function readBudgets() {
  return JSON.parse(readFileSync(BUDGETS, 'utf8'))
}

/** Bytes and files under a directory, every regular file counted. */
export function measure(dir) {
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    files += 1
    bytes += statSync(join(entry.parentPath, entry.name)).size
  }
  return { bytes, files }
}

/**
 * The ceiling for a measurement: bytes rounded up to three significant
 * figures (10 kB on a 4 MB tarball, 1 kB on a 100 kB entry), files, when
 * it counts them, up to a whole file.
 */
export function ceilingFor({ bytes, files }) {
  const raw = bytes * HEADROOM
  const step = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 2)
  const ceiling = { bytes: Math.ceil(raw / step) * step }
  return files === undefined ? ceiling : { ...ceiling, files: Math.ceil(files * HEADROOM) }
}

/** One message per limit a measurement goes over; empty when it fits the ceiling. */
export function overBudget(measured, ceiling) {
  const over = []
  if (measured.bytes > ceiling.bytes) over.push(`${measured.bytes.toLocaleString('en')} bytes, ceiling ${ceiling.bytes.toLocaleString('en')}`)
  if (ceiling.files !== undefined && measured.files > ceiling.files) over.push(`${measured.files} files, ceiling ${ceiling.files}`)
  return over
}

/**
 * Bytes and files of an installed `node_modules`, the installer's own
 * bookkeeping (`.package-lock.json`, `.bin`) left out.
 */
export function measureInstalled(nodeModules) {
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue
    const size = measure(join(nodeModules, entry.name))
    bytes += size.bytes
    files += size.files
  }
  return { bytes, files }
}

/**
 * The JavaScript a built Nuxt app's every page loads before it runs: the
 * client entry and every chunk it imports statically, each gzipped, read
 * through the client manifest the build leaves in `.nuxt`.
 */
export async function measureClientEntry(app) {
  const manifestFile = join(app, '.nuxt/dist/server/client.manifest.mjs')
  if (!existsSync(manifestFile)) throw new Error(`budgets: no client manifest at ${manifestFile} — build the app first (or Nuxt moved it)`)
  const manifest = (await import(pathToFileURL(manifestFile).href)).default
  const entries = Object.keys(manifest).filter(key => manifest[key].isEntry)
  if (entries.length !== 1) throw new Error(`budgets: expected one client entry in ${manifestFile}, found ${entries.length}`)
  const chunks = new Set()
  const queue = [...entries]
  while (queue.length > 0) {
    const key = queue.pop()
    if (chunks.has(key)) continue
    chunks.add(key)
    queue.push(...manifest[key].imports ?? [])
  }
  let bytes = 0
  for (const key of chunks) bytes += gzipSync(readFileSync(join(app, '.output/public/_nuxt', manifest[key].file))).length
  return { bytes }
}

/** The one nuxt-backend-*.tgz beside package.json; exits when there is none, or more than one. */
function packedTarball() {
  const tarballs = readdirSync(root).filter(file => /^nuxt-backend-.*\.tgz$/.test(file))
  if (tarballs.length !== 1) {
    console.error(`budgets: expected one nuxt-backend-*.tgz beside package.json, found ${tarballs.length}. Run \`pnpm pack\` first, and delete stale ones.`)
    process.exit(1)
  }
  return join(root, tarballs[0])
}

/** An npm command in `dir`, as a new user runs it; only its errors reach the log. */
function npm(dir, args, env = process.env) {
  execFileSync('npx', [...NPM, ...args], { cwd: dir, env, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' })
}

/**
 * `npm install` in `dir`, tried twice: the registry drops a request now and
 * then. Outside CI it runs no install scripts and takes only versions a day
 * old or more, so measuring on a laptop never runs a just-published release.
 */
function npmInstall(dir, args) {
  const local = process.env.CI ? [] : ['--ignore-scripts', `--before=${new Date(Date.now() - 86_400_000).toISOString()}`]
  const install = ['install', '--no-audit', '--no-fund', ...local, ...args]
  try {
    npm(dir, install)
  }
  catch {
    console.error('budgets: npm install failed; trying once more')
    npm(dir, install)
  }
}

/** What installing the tarball into an empty project adds: the package and its dependencies, without peers or install scripts. */
function measureInstall(tarball) {
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-install-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{ "private": true }\n')
    npmInstall(dir, ['--ignore-scripts', '--legacy-peer-deps', '--no-package-lock', tarball])
    return measureInstalled(join(dir, 'node_modules'))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** templates/starter as git tracks it, installed with the tarball and built, in `dir`. */
function buildStarter(tarball, dir) {
  const tracked = execFileSync('git', ['ls-files', '-z', 'templates/starter'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const file of tracked) {
    const target = join(dir, file.slice('templates/starter/'.length))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(root, file), target)
  }
  npmInstall(dir, [tarball])
  // The placeholder the pack job builds with: the build never calls it.
  npm(dir, ['run', 'build'], { ...process.env, NUXT_PUBLIC_BACKEND_URL: 'https://example.convex.cloud' })
}

/** The starter's client entry, from `built` when given, else from a build of its own. */
async function measureStarter(tarball, built) {
  if (built) return measureClientEntry(resolve(built))
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-starter-'))
  try {
    buildStarter(tarball, dir)
    return await measureClientEntry(dir)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** A measurement as the log reads it. */
const described = (name, { bytes, files }) =>
  name === 'starter' ? `starter entry: ${bytes.toLocaleString('en')} bytes gzipped` : `${name}: ${bytes.toLocaleString('en')} bytes in ${files} files`

/** A ceiling as the log reads it. */
const limit = ({ bytes, files }) => (files === undefined ? bytes.toLocaleString('en') : `${bytes.toLocaleString('en')} / ${files}`)

/** The tarball's measurement: every file it carries, unpacked. */
function measureTarball(tarball) {
  const extracted = mkdtempSync(join(tmpdir(), 'nuxt-backend-budgets-'))
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', extracted])
    return measure(join(extracted, 'package'))
  }
  finally {
    rmSync(extracted, { recursive: true, force: true })
  }
}

/** Measure one budget against the packed tarball. */
async function measureBudget(name, tarball, starter) {
  if (name === 'tarball') return measureTarball(tarball)
  if (name === 'install') return measureInstall(tarball)
  return measureStarter(tarball, starter)
}

/**
 * Check `install` and `starter`. Over a ceiling fails, or only warns with
 * `BUDGETS_MODE=warn` (as a GitHub annotation): those two move
 * with the registry, and a pull request should not fail for a release it did
 * not make.
 */
async function check(tarball, starter) {
  const budgets = readBudgets()
  const warnOnly = process.env.BUDGETS_MODE === 'warn'
  let failed = false
  for (const name of ['install', 'starter']) {
    const size = await measureBudget(name, tarball, starter)
    const { ceiling } = budgets[name]
    const over = overBudget(size, ceiling)
    if (over.length === 0) {
      console.log(`  ✓ ${described(name, size)} (ceiling ${limit(ceiling)})`)
      continue
    }
    const message = `over the ${name} budget: ${over.join('; ')}. If the growth is intended, run \`pnpm budgets:update ${name}\` and say why in the change.`
    // GitHub's annotation syntax: a warning on the run's summary, a plain line anywhere else.
    if (warnOnly) console.log(`::warning title=Budget::${message}`)
    else console.error(`  ✗ ${message}`)
    failed ||= !warnOnly
  }
  return !failed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { check: { type: 'boolean' }, starter: { type: 'string' } } })
  const tarball = packedTarball()
  if (values.check) process.exit((await check(tarball, values.starter)) ? 0 : 1)
  const names = positionals.length > 0 ? positionals : ['tarball']
  const unknown = names.filter(name => !NAMES.includes(name))
  if (unknown.length > 0) {
    console.error(`budgets: no budget named ${unknown.join(', ')}; the budgets are ${NAMES.join(', ')}`)
    process.exit(1)
  }
  const budgets = readBudgets()
  for (const name of names) {
    const measured = await measureBudget(name, tarball, values.starter)
    budgets[name] = { measured, ceiling: ceilingFor(measured) }
    console.log(`budgets: ${described(name, measured)}, ceiling ${limit(budgets[name].ceiling)}`)
  }
  writeFileSync(BUDGETS, `${JSON.stringify(Object.fromEntries(NAMES.filter(name => budgets[name]).map(name => [name, budgets[name]])), null, 2)}\n`)
}
