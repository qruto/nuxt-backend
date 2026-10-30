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

/**
 * Put the keys on the deployment: the ones it does not hold yet (`held`, its
 * env names), so a key set there by hand is never replaced. Resolves with the
 * names it set.
 */
export async function forwardSandboxKeys(held) {
  const { setDeploymentEnv } = await loadEnvPush()
  const keys = await rootSandboxKeys()
  const forwarded = []
  for (const [name, value] of Object.entries(keys)) {
    if (held.includes(name)) continue
    await setDeploymentEnv(websiteDir, name, value)
    forwarded.push(name)
  }
  return forwarded
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
