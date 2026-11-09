/**
 * The providers' sandbox keys for the try kit. The kit runs the playground on
 * a local deployment, with every provider in its test mode: billing in Polar's
 * sandbox, email to Resend's test addresses, models through the AI gateway.
 * The keys live in the repository's root `.env.local` (the file `pnpm dev`
 * reads); this forwards them to the deployment, each value on `convex env
 * set`'s stdin, and syncs the billing catalog to Polar's sandbox. Without a
 * key, the capability reads `missing` and its pages show their empty states.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root, websiteDir } from './kit.mjs'

/** The keys forwarded, and the capability each one turns on. */
export const SANDBOX_KEYS = {
  BILLING_ACCESS_TOKEN: 'billing',
  EMAIL_API_KEY: 'email',
  EMAIL_FROM: 'email',
  AI_GATEWAY_API_KEY: 'ai',
}

const loadEnvPush = () => import(pathToFileURL(join(root, 'src/env-push.ts')).href)

/** The sandbox keys the root `.env.local` holds, by name. */
export async function rootSandboxKeys() {
  const { readEnvFiles } = await loadEnvPush()
  const local = readEnvFiles(root)
  return Object.fromEntries(Object.keys(SANDBOX_KEYS).filter(name => local[name]).map(name => [name, local[name]]))
}

/** The deployment's value of an env name (`convex env get`), or `null` when it cannot be read. */
async function deploymentValue(name) {
  const { runConvex } = await import(pathToFileURL(join(root, 'src/convex-cli.ts')).href)
  try {
    return (await runConvex(websiteDir, ['env', 'get', name])).stdout.trim()
  }
  catch {
    return null
  }
}

/**
 * Put the keys on the deployment: the ones it does not hold yet (`held`, its
 * env names), so a key set there by hand is never replaced. A key it holds
 * with another value than the root's (a renewed token, say) is named, never
 * replaced. Resolves with the names it set (`forwarded`) and the ones that
 * differ (`differing`); no value is ever returned or printed. `options`
 * stands in for the root's keys and the deployment's reads and writes (tests).
 *
 * @param {readonly string[]} held
 * @param {{ keys?: Record<string, string>, set?: (dir: string, name: string, value: string) => Promise<void>, get?: (name: string) => Promise<string | null> }} [options]
 * @returns {Promise<{ forwarded: string[], differing: string[] }>}
 */
export async function forwardSandboxKeys(held, { keys, set, get = deploymentValue } = {}) {
  const rootKeys = keys ?? await rootSandboxKeys()
  const write = set ?? (await loadEnvPush()).setDeploymentEnv
  const forwarded = []
  const differing = []
  for (const [name, value] of Object.entries(rootKeys)) {
    if (!held.includes(name)) {
      await write(websiteDir, name, value)
      forwarded.push(name)
      continue
    }
    const kept = await get(name)
    if (kept !== null && kept !== value.trim()) differing.push(name)
  }
  return { forwarded, differing }
}

/**
 * What the kit says of a key the deployment keeps with another value than
 * the root `.env.local`'s, and the command that sets the root's there: the
 * value goes from the file to `convex env set`'s stdin, never on a screen.
 */
export function differingKeyLine(name) {
  return `The deployment keeps its own ${name}, which differs from the root .env.local's; the kit never replaces a key the deployment holds. To use the root's, from the repository root: grep '^${name}=' .env.local | cut -d= -f2- | (cd website && npx convex env set ${name})`
}

/**
 * Create the website's catalog in Polar's sandbox (`nuxt-backend billing
 * sync`): its ids land in `billing.generated.ts`, and the deployment loads
 * the products. A local deployment gets no webhooks from Polar, so the sync
 * leaves the webhook alone and says why. Resolves with whether it ran.
 */
export async function syncSandboxCatalog(log) {
  const keys = await rootSandboxKeys()
  if (!keys.BILLING_ACCESS_TOKEN) {
    log('Billing is missing: no BILLING_ACCESS_TOKEN (a Polar sandbox token) in the root .env.local. Add one and run again.')
    return false
  }
  const { runBillingSync } = await import(pathToFileURL(join(root, 'src/cli/billing.ts')).href)
  // The sync reads the token from the process env or the website's own env files.
  process.env.BILLING_ACCESS_TOKEN = keys.BILLING_ACCESS_TOKEN
  const { exitCode } = await runBillingSync(websiteDir, { environment: 'sandbox' }, { print: line => log(line) })
  if (exitCode !== 0) log('The catalog could not be synced to Polar\'s sandbox (see above): billing pages show empty states.')
  return exitCode === 0
}
