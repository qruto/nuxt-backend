/**
 * What every try-kit command shares: where the website and its local
 * deployment are, the guard that keeps the kit off any deployment that is
 * not on this machine, the Convex and portless commands run against it, and
 * the origins the kit serves.
 *
 * The website's local deployment is the one `website/.env.local` names: the
 * file the Convex CLI writes when it runs in `website/` (the try kit, and the
 * component codegen in CI and in worktrees). The repository root's
 * `.env.local` belongs to `pnpm dev`, which may name a cloud deployment: the
 * kit never reads it, and never touches a cloud deployment.
 */
import { execFile, spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isLocalDeploymentId, parseEnvFile } from '../../src/deployment.ts'

/** The repository root. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The website app, whose `backend/` the local deployment runs. */
export const websiteDir = join(root, 'website')

/** A command the repository installed, by its `node_modules/.bin` name: run directly, so a stop signal reaches it. */
export function bin(name) {
  return join(root, 'node_modules/.bin', name)
}

/** The portless name the playground is served under: https://nuxt-backend.localhost. */
export const DEFAULT_NAME = 'nuxt-backend'

/** Environment names a shell may export that would point the Convex CLI somewhere else. */
const DEPLOYMENT_OVERRIDES = ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_URL', 'CONVEX_SITE_URL']

/** A dotenv file, parsed as the package parses one (src/deployment.ts); `{}` when it does not exist. */
export function readEnvFile(path) {
  return existsSync(path) ? parseEnvFile(readFileSync(path, 'utf8')) : {}
}

/** What `website/.env.local` holds. */
export function websiteEnv() {
  return readEnvFile(join(websiteDir, '.env.local'))
}

/**
 * Why the kit will not run against what an env file (`website/.env.local`
 * by default) names, or `null` when it may. It runs on a local deployment
 * only (`local:` or `anonymous:`), or on none yet, which it then
 * provisions and asks about again. A deploy key or a self-hosted URL in the
 * file would make the Convex CLI act on another deployment, so either
 * refuses too.
 */
export function deploymentRefusal(env, file = 'website/.env.local') {
  if (env.CONVEX_DEPLOY_KEY || env.CONVEX_DEPLOYMENT_TOKEN) {
    return `${file} holds a deploy key, and the Convex CLI would act on the deployment it selects. Remove it: the try kit runs on a local deployment only.`
  }
  if (env.CONVEX_SELF_HOSTED_URL) {
    return `${file} names a self-hosted deployment (CONVEX_SELF_HOSTED_URL), which does not say whether it runs on this machine. Remove it: the try kit runs on a local deployment only.`
  }
  const deployment = env.CONVEX_DEPLOYMENT
  if (deployment && !isLocalDeploymentId(deployment)) {
    return `${file} names ${deployment.split(':')[0]}:…, a deployment off this machine. The try kit runs on a local deployment only: move that file aside (\`pnpm dev\` keeps using the root .env.local) and run again to provision one.`
  }
  return null
}

/**
 * The environment the kit's child processes get: the shell's, without the
 * names that would point the Convex CLI at another deployment (a deploy key
 * exported to run one production command must never come along), so the
 * website's `.env.local` decides.
 */
export function childEnv(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !DEPLOYMENT_OVERRIDES.includes(name)))
  return { ...env, ...extra }
}

/**
 * Drop those names from this process's own environment too, for the
 * package code the kit runs in-process (env push, billing sync).
 */
export function scrubDeploymentEnv() {
  for (const name of DEPLOYMENT_OVERRIDES) delete process.env[name]
}

/**
 * `convex <args>` in the website (or `cwd`, with that app's own CLI),
 * resolving with its stdout; rejects with the end of its stderr.
 */
export function convex(args, { input, timeout = 120_000, env, cwd = websiteDir } = {}) {
  return new Promise((resolvePromise, reject) => {
    const cli = cwd === websiteDir ? bin('convex') : join(cwd, 'node_modules/.bin/convex')
    const child = execFile(cli, args, { cwd, env: env ?? childEnv(), timeout, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`convex ${args[0]} failed: ${String(stderr || error.message).trim().split('\n').slice(-6).join('\n')}`))
      else resolvePromise(stdout.trim())
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

/** `convex run <fn> <args>` on the local deployment, parsed from the JSON it prints. */
export async function convexRun(fn, args = {}) {
  const out = await convex(['run', fn, JSON.stringify(args)])
  return out ? JSON.parse(out) : null
}

/** The sandbox catalog ids `billing sync` wrote into the website's `billing.generated.ts`, read fresh. */
export async function sandboxCatalog() {
  const { catalog } = await import(`${pathToFileURL(join(websiteDir, 'backend/billing.generated.ts')).href}?t=${Date.now()}`)
  return catalog.sandbox
}

/** `portless <args>`, synchronously; `{ status, stdout, stderr }`. */
export function portless(args, env = childEnv()) {
  // fallow-ignore-next-line security-sink -- the repository's own portless binary, no shell, with subcommands and names the kit builds itself; verified 2026-10-19
  const result = spawnSync(bin('portless'), args, { cwd: root, env, encoding: 'utf8' })
  return { status: result.status ?? 1, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

/** The ports a local deployment listens on, from the URLs the Convex CLI wrote beside it. */
export function localPorts(env) {
  const port = url => (url ? Number(new URL(url).port) || null : null)
  const cloud = port(env.CONVEX_URL)
  const site = port(env.CONVEX_SITE_URL) ?? (cloud ? cloud + 1 : null)
  return cloud && site ? { cloud, site } : null
}

/**
 * Proxy a local deployment's two ports beside the app, under the same proxy:
 * `api.<name>` and `site.<name>`. `cleanup` takes the routes down again.
 * Resolves with their origins; throws when portless refuses one.
 */
export function proxyDeployment(app, name, ports, env, cleanup) {
  for (const [label, port] of [['api', ports.cloud], ['site', ports.site]]) {
    const alias = `${label}.${name}`
    const added = portless(['alias', alias, String(port), '--force'], env)
    if (added.status !== 0) throw Object.assign(new Error(`portless could not proxy the deployment: ${added.stderr || added.stdout}`), { tryKit: true })
    cleanup.push(() => portless(['alias', '--remove', alias], env))
  }
  return { api: siblingOrigin(app, 'api'), site: siblingOrigin(app, 'site') }
}

/** The flags `pnpm try` takes, each documented in the Try everything guide. */
export const TRY_FLAGS = ['--lan', '--tailscale', '--name']

/** The flags `pnpm try` takes. */
export function parseTryArgs(argv) {
  const options = { mode: 'localhost', name: DEFAULT_NAME }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--lan') options.mode = 'lan'
    else if (arg === '--tailscale') options.mode = 'tailscale'
    else if (arg === '--name' && argv[index + 1]) options.name = argv[++index]
    else if (arg.startsWith('--name=')) options.name = arg.slice('--name='.length)
    else throw new Error(`Unknown option ${arg}. Use ${TRY_FLAGS.slice(0, -1).join(', ')} or ${TRY_FLAGS.at(-1)} <name>.`)
  }
  if (argv.includes('--lan') && argv.includes('--tailscale')) throw new Error('Pick one of --lan and --tailscale.')
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(options.name)) throw new Error(`--name ${options.name} is no hostname label: lowercase letters, digits and hyphens.`)
  return options
}

/**
 * The origin of a sibling route under the same proxy: `api` beside
 * `https://nuxt-backend.localhost` is `https://api.nuxt-backend.localhost`
 * (the proxy's port, when it has one, kept).
 */
export function siblingOrigin(origin, label) {
  const url = new URL(origin)
  url.hostname = `${label}.${url.hostname}`
  return url.origin
}

/** Wait until `check` resolves truthy, polling; resolves with its value, or rejects after `timeoutMs`. */
export async function waitFor(check, { timeoutMs = 120_000, intervalMs = 1_000, what = 'the condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check().catch(() => null)
    if (value) return value
    if (Date.now() > deadline) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}.`)
    await new Promise(done => setTimeout(done, intervalMs))
  }
}

/**
 * The admin key of an anonymous local deployment, from the state the Convex
 * CLI keeps for it under `website/.convex/local/`; `null` when it is not
 * there (a local deployment of a signed-in account keeps it elsewhere).
 */
function localAdminKey(deployment) {
  const name = deployment.slice(deployment.indexOf(':') + 1)
  const base = join(websiteDir, '.convex/local')
  for (const dir of existsSync(base) ? readdirSync(base) : []) {
    const path = join(base, dir, 'config.json')
    if (!existsSync(path)) continue
    const config = JSON.parse(readFileSync(path, 'utf8'))
    if (config.deploymentName === name && typeof config.adminKey === 'string') return config.adminKey
  }
  return null
}

/**
 * What answers on the local deployment's port: `'ours'`, `'down'`
 * (nothing), or `'foreign'`, another local deployment that refuses this
 * one's admin key. Two checkouts each given an anonymous deployment on the
 * default ports collide that way: while the other runs, this one can't, and
 * the kit must not mistake it for its own.
 */
export async function portHolder(env, key = localAdminKey(env.CONVEX_DEPLOYMENT ?? '')) {
  const ports = localPorts(env)
  let response
  try {
    // fallow-ignore-next-line security-sink -- a loopback URL on the local deployment's own port, from website/.env.local; verified 2026-10-19
    response = await fetch(`http://127.0.0.1:${ports.cloud}/api/check_admin_key`, { headers: key ? { authorization: `Convex ${key}` } : {}, signal: AbortSignal.timeout(2_000) })
  }
  catch {
    return 'down'
  }
  if (!key) return 'ours'
  return response.ok ? 'ours' : 'foreign'
}

/** What the kit says when another local deployment holds this one's ports. */
export function foreignPortsMessage(env) {
  const ports = localPorts(env)
  return `Ports ${ports.cloud} and ${ports.site} are held by another local deployment (another checkout's \`convex dev\`?), not the one website/.env.local names. Stop that one first: two local deployments can't share their ports.`
}

/** Whether a deployment's HTTP actions answer Better Auth's `GET /api/auth/ok`: the app's functions are on it. */
export async function deploymentAnswers(siteUrl) {
  // fallow-ignore-next-line security-sink -- the local deployment's own loopback site URL, from the ports website/.env.local names; verified 2026-10-19
  const response = await fetch(new URL('/api/auth/ok', siteUrl), { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) return false
  return (await response.json())?.ok === true
}

/**
 * What the session started, and how it ends: on Ctrl-C (which reaches the
 * children from the terminal too), on SIGTERM, or when a child exits, every
 * child is stopped, then what was set up for them (the proxies) is taken down
 * again, before this process exits.
 */
export function createSession() {
  const children = []
  const cleanup = []
  let ending = null
  // Each child leads a process group of its own, so a stop reaches everything
  // under it (a package manager in between passes no signal on).
  const signalGroup = (child, name) => {
    try {
      process.kill(-child.pid, name)
    }
    catch { /* already gone */ }
  }
  const end = async (code) => {
    ending ??= (async () => {
      for (const { child } of children) signalGroup(child, 'SIGINT')
      const forced = setTimeout(() => children.forEach(({ child }) => signalGroup(child, 'SIGKILL')), 15_000)
      await Promise.all(children.map(({ exited }) => exited))
      clearTimeout(forced)
      for (const step of cleanup.reverse()) await step()
      process.exit(code)
    })()
    return ending
  }
  for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => end(130))
  return {
    cleanup,
    end,
    /** Start a child printing to the terminal, in its own process group. */
    start(command, args, options) {
      // fallow-ignore-next-line security-sink -- the repository's own installed tools (convex, portless, nuxt) and this Node binary, no shell, with arguments the kit builds itself; verified 2026-10-19
      const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], detached: true, ...options })
      const exited = new Promise(done => child.on('exit', (code, signal) => done(code ?? (signal ? 130 : 1))))
      children.push({ child, exited })
      exited.then(code => end(code))
      return child
    },
  }
}
