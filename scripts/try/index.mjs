#!/usr/bin/env node
/**
 * `pnpm try` — every feature of the playground (Panels, under /playground)
 * on this machine, on the providers' sandboxes, from one command:
 *
 * 1. the website's local Convex deployment (`website/.env.local`), reused,
 *    or provisioned with no account when there is none; never a cloud one;
 * 2. its env: `env push` (a generated AUTH_SECRET, and `BACKEND_ENVIRONMENT`
 *    as `development`: mail in test mode, the local origins trusted, codes
 *    echoed) and `SITE_URL` set to the origin the playground is served at;
 * 3. the sandbox keys of the root `.env.local` (a Polar sandbox token, a
 *    Resend key) forwarded to the deployment, and the catalog synced to
 *    Polar's sandbox (scripts/try/sandbox.mjs); email runs in test mode,
 *    to Resend's test addresses, which the dev inbox reads back;
 * 4. the deployment's two URLs proxied over HTTPS beside the app
 *    (`https://api.<name>.localhost`, `https://site.<name>.localhost`), so a
 *    phone can reach them and no browser sees mixed content;
 * 5. `convex dev` for the website's functions, then the personas seeded
 *    (scripts/try/seeds.mjs) with their strips, and Panels' canned ideas
 *    drawn when the deployment holds an AI gateway key; the docs and the
 *    playground on `https://<name>.localhost`.
 *
 *   pnpm try                  https://nuxt-backend.localhost
 *   pnpm try --lan            https://nuxt-backend.local, for devices on this network
 *   pnpm try --tailscale      the app on this machine's tailnet name, with trusted certificates
 *   pnpm try --name <name>    another name, to run beside another checkout
 *
 * A portless proxy that is already running keeps the mode it started in (it
 * remembers LAN mode, too): the origin the kit prints is the one portless
 * serves, and SITE_URL follows it. Stop the proxy (`portless proxy stop`)
 * to switch between `pnpm try` and `pnpm try --lan`.
 *
 * `PORTLESS=0 pnpm try` serves without the proxy, on http://localhost:3000 (or `PORT`).
 * Ctrl-C stops everything it started.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bin, childEnv, convex, convexRun, createSession, deploymentAnswers, deploymentRefusal, foreignPortsMessage, localPorts, parseTryArgs, portHolder, portless, proxyDeployment, root, scrubDeploymentEnv, sandboxCatalog, waitFor, websiteDir, websiteEnv } from './kit.mjs'
import { PERSONAS } from './personas.mjs'
import { forwardSandboxKeys, syncSandboxCatalog } from './sandbox.mjs'
import { seedPersonas } from './seeds.mjs'

/** The HTTPS ports `tailscale serve` shares the deployment's two URLs on: outside portless's own (443, 8443…). */
const TAILNET_PORTS = { api: 9443, site: 9444 }

const log = line => console.log(`\x1B[36m[try]\x1B[0m ${line}`)

/** Stop the session with a message: what was set up is taken down first. */
function fail(message) {
  throw Object.assign(new Error(message), { tryKit: true })
}

/** The local deployment, provisioned anonymously (no account, no prompt) when `website/.env.local` names none. */
async function ensureDeployment() {
  let env = websiteEnv()
  const refusal = deploymentRefusal(env)
  if (refusal) fail(refusal)
  if (!env.CONVEX_DEPLOYMENT) {
    log('No local deployment yet: provisioning one on this machine (no account needed)…')
    // Its first push fails on the env it has not been given yet; the deployment exists by then.
    await convex(['dev', '--once', '--typecheck', 'disable'], { env: childEnv({ CONVEX_AGENT_MODE: 'anonymous' }), timeout: 600_000 }).catch(() => {})
    env = websiteEnv()
    if (!env.CONVEX_DEPLOYMENT) fail('Could not provision a local deployment: run `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once` in website/ to see why.')
    // Whatever the CLI chose (a signed-in account can get a cloud one), the kit acts on a local deployment only.
    const chosen = deploymentRefusal(env)
    if (chosen) fail(chosen)
  }
  const ports = localPorts(env)
  if (!ports) fail('website/.env.local names a local deployment but not its URLs (CONVEX_URL): run `pnpm exec convex dev --once` in website/ to write them.')
  if (await portHolder(env) === 'foreign') fail(foreignPortsMessage(env))
  return { deployment: env.CONVEX_DEPLOYMENT, ports }
}

/** This machine's tailnet name, from `tailscale status --json`. */
function tailnetName() {
  const status = spawnSync('tailscale', ['status', '--json'], { encoding: 'utf8' })
  if (status.error) fail('--tailscale needs the Tailscale CLI on PATH, connected, with HTTPS certificates on for the tailnet.')
  const name = JSON.parse(status.stdout || '{}').Self?.DNSName?.replace(/\.$/, '')
  if (!name) fail('Tailscale is not connected: `tailscale status` has no name for this machine.')
  return name
}

/** The env portless runs in for a mode: LAN mode, or sharing on the tailnet. */
const MODE_ENV = { localhost: {}, lan: { PORTLESS_LAN: '1' }, tailscale: { PORTLESS_TAILSCALE: '1' } }

/**
 * Share the deployment's two ports on the tailnet over HTTPS: the
 * browser-side URLs in tailscale mode. Each share runs in the foreground as
 * a child of the session, so it ends with the kit however the kit ends; a
 * share a crashed earlier run left behind (`--bg`, or Tailscale's stored
 * config) is turned off first.
 */
function shareOnTailnet(ports, session) {
  const host = tailnetName()
  for (const [label, port] of Object.entries(TAILNET_PORTS)) {
    spawnSync('tailscale', ['serve', `--https=${port}`, 'off'], { stdio: 'ignore' })
    const target = `http://127.0.0.1:${label === 'api' ? ports.cloud : ports.site}`
    session.start('tailscale', ['serve', `--https=${port}`, target], { env: childEnv() })
    session.cleanup.push(() => spawnSync('tailscale', ['serve', `--https=${port}`, 'off'], { stdio: 'ignore' }))
  }
  return { api: `https://${host}:${TAILNET_PORTS.api}`, site: `https://${host}:${TAILNET_PORTS.site}` }
}

/**
 * Where everything is served: the app's origin (the deployment's SITE_URL),
 * and the deployment's two URLs the app's browser side connects to. The
 * proxies are registered here; the session's cleanup takes them down again.
 */
function serve(options, ports, session) {
  if (process.env.PORTLESS === '0') {
    return { app: `http://localhost:${process.env.PORT || 3000}`, api: `http://127.0.0.1:${ports.cloud}`, site: `http://127.0.0.1:${ports.site}`, env: {} }
  }
  const env = childEnv(MODE_ENV[options.mode])
  const got = portless(['get', '--no-worktree', options.name], env)
  if (got.status !== 0 || !got.stdout.startsWith('http')) fail(`portless could not name the app: ${got.stderr || got.stdout}`)
  const app = got.stdout.split('\n').pop()
  const urls = options.mode === 'tailscale' ? shareOnTailnet(ports, session) : proxyDeployment(app, options.name, ports, env, session.cleanup)
  return { app, ...urls, env }
}

/** The deployment's env for the kit: pushed (a `development` BACKEND_ENVIRONMENT: local origins trusted, mail in test mode), SITE_URL at the app, the sandbox keys on it. Resolves with the capabilities whose key reached it: billing, email and the AI gateway. */
async function provisionEnv(deployment, siteUrl) {
  const { markEnvProvisioned, runEnvPush, setDeploymentEnv } = await import(pathToFileURL(join(root, 'src/env-push.ts')).href)
  const run = await runEnvPush(websiteDir, { siteUrl })
  if (!run) fail('Could not read the deployment\'s env names (`convex env list` failed).')
  for (const { action, outcome, error } of run.results) {
    if (outcome === 'failed') fail(`env push: ${action.name} failed — ${error}`)
  }
  // The marker the website's persona functions require: only the kit sets it, on the local deployment it seeds.
  if (!run.deployedNames.includes('TRY_KIT_LOCAL')) await setDeploymentEnv(websiteDir, 'TRY_KIT_LOCAL', '1')
  // The deployment is a local one, so `env push` named it `development`: mail stays in test mode (every persona is a sandbox address) and the local origins are trusted.
  // The sandbox keys, unless the deployment holds them already.
  const forwarded = await forwardSandboxKeys(run.deployedNames)
  if (forwarded.length > 0) log(`Forwarded to the deployment: ${forwarded.join(', ')}.`)
  // What the dev server's own env check reads: the required names are on the deployment.
  markEnvProvisioned(websiteDir, deployment)
  const held = new Set([...run.deployedNames, ...forwarded])
  return { billing: held.has('BILLING_ACCESS_TOKEN'), email: held.has('EMAIL_API_KEY'), ai: held.has('AI_GATEWAY_API_KEY') }
}

function banner(served, { billing, email, ai }) {
  const width = Math.max(...PERSONAS.map(persona => persona.label.length))
  log('Ready. The app runs on this machine, on the providers\' sandboxes:')
  log(`  playground   ${served.app}/playground`)
  log(`  docs         ${served.app}/docs/start`)
  log(`  try guide    ${served.app}/docs/start/playground/try-everything`)
  log(`  billing      ${billing ? 'Polar\'s sandbox: pay with the test card 4242 4242 4242 4242' : 'missing: add BILLING_ACCESS_TOKEN (a Polar sandbox token) to the root .env.local'}`)
  log(`  email        ${email ? 'Resend test mode: sign-in codes show on the sign-in page, read back from Resend (an admin\'s print here)' : 'missing: add EMAIL_API_KEY (a Resend key) to the root .env.local; codes print in this terminal'}`)
  log(`  ai           ${ai ? 'the AI gateway: real models draw the strips, within Panels\' daily spend limit' : 'missing: add AI_GATEWAY_API_KEY (a gateway key) to the root .env.local; nothing can be drawn'}`)
  log('Sign in as:')
  // A passkey-only account signs in with a passkey alone, which none of them has here.
  for (const persona of PERSONAS.filter(each => !each.passkeyOnly)) log(`  ${persona.label.padEnd(width)}  ${persona.email}`)
  log('Press N on any page to leave a review note; `pnpm try:notes` exports them.')
}

async function main() {
  let options
  try {
    options = parseTryArgs(process.argv.slice(2))
  }
  catch (error) {
    console.error(`\x1B[31m[try]\x1B[0m ${error.message}`)
    process.exit(1)
  }
  // The website's .env.local decides the deployment, for this process too:
  // a key or a deployment exported in the shell never comes along.
  scrubDeploymentEnv()

  const session = createSession()
  try {
    await run(options, session)
  }
  catch (error) {
    console.error(`\x1B[31m[try]\x1B[0m ${error.tryKit ? error.message : error.stack ?? error}`)
    await session.end(1)
  }
}

async function run(options, session) {
  const { deployment, ports } = await ensureDeployment()
  const served = serve(options, ports, session)
  log(`Local deployment ${deployment}, served at ${served.app}`)
  const keyed = await provisionEnv(deployment, served.app)

  session.start(bin('convex'), ['dev', '--typecheck', 'disable'], { cwd: websiteDir, env: childEnv() })
  await waitFor(() => deploymentAnswers(`http://127.0.0.1:${ports.site}`), { timeoutMs: 300_000, what: 'the deployment to take the website\'s functions' })
  // After its functions are in: billing sync loads the products with one of them.
  if (keyed.billing) await syncSandboxCatalog(log)

  const nuxtEnv = childEnv({ ...served.env, NUXT_PUBLIC_BACKEND_URL: served.api, NUXT_PUBLIC_CONVEX_SITE_URL: served.site })
  // The wrapper imports the package's TypeScript sources (kit.mjs), so it preloads the same resolver this script runs with.
  const wrapper = [process.execPath, '--import', join(root, 'scripts/lib/ts-resolve.mjs'), join(root, 'scripts/try/nuxt.mjs'), served.app]
  if (process.env.PORTLESS === '0') session.start(wrapper[0], wrapper.slice(1), { cwd: root, env: nuxtEnv })
  else session.start(bin('portless'), [options.name, ...wrapper], { cwd: root, env: nuxtEnv })

  try {
    await seedPersonas({ convexRun, catalog: keyed.billing ? await sandboxCatalog() : undefined, ai: keyed.ai, log })
    banner(served, keyed)
  }
  catch (error) {
    log(`Seeding the personas failed: ${error.message}`)
  }
}

await main()
