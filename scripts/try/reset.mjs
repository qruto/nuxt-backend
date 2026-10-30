#!/usr/bin/env node
/**
 * `pnpm try:reset` — start the try kit over: every table of the website's
 * local deployment emptied (the scopes `pnpm db:reset` knows: the app's, the
 * backend component's, the email and billing components'), and the personas
 * seeded again. Polar's sandbox keeps its customers and orders: archive them
 * in its dashboard for a clean slate.
 *
 * It works beside a running `pnpm try`, on its deployment, or on its own:
 * then it runs `convex dev` for as long as it takes. Like `pnpm try`, it acts on the local deployment `website/.env.local`
 * names and refuses any other.
 */
import { spawn } from 'node:child_process'
import { resetDeployment, resetPlan } from '../db-reset.mjs'
import { bin, childEnv, convexRun, deploymentAnswers, deploymentRefusal, foreignPortsMessage, localPorts, portHolder, sandboxCatalog, scrubDeploymentEnv, waitFor, websiteDir, websiteEnv } from './kit.mjs'
import { seedPersonas } from './seeds.mjs'

const log = line => console.log(`\x1B[36m[try:reset]\x1B[0m ${line}`)

async function main() {
  const env = websiteEnv()
  const refusal = deploymentRefusal(env)
  if (refusal) throw new Error(refusal)
  if (!env.CONVEX_DEPLOYMENT) throw new Error('website/.env.local names no local deployment yet: `pnpm try` provisions one.')
  const ports = localPorts(env)
  if (!ports) throw new Error('website/.env.local does not say where the local deployment listens (CONVEX_URL).')
  scrubDeploymentEnv()
  const holder = await portHolder(env)
  if (holder === 'foreign') throw new Error(foreignPortsMessage(env))

  const site = `http://127.0.0.1:${ports.site}`
  const stops = []
  try {
    if (holder === 'down' || !await deploymentAnswers(site).catch(() => false)) {
      log('Starting the local deployment for the reset…')
      // fallow-ignore-next-line security-sink -- the repository's own convex binary, no shell, fixed arguments; verified 2026-10-19
      const convexDev = spawn(bin('convex'), ['dev', '--typecheck', 'disable', '--tail-logs', 'disable'], { cwd: websiteDir, env: childEnv(), stdio: ['ignore', 'ignore', 'inherit'], detached: true })
      stops.push(() => new Promise((done) => {
        convexDev.once('exit', done)
        process.kill(-convexDev.pid, 'SIGINT')
      }))
      await waitFor(() => deploymentAnswers(site), { timeoutMs: 300_000, what: 'the local deployment' })
    }

    log('Emptying every table of the local deployment…')
    resetDeployment(await resetPlan(), { env: childEnv(), cwd: websiteDir, deploymentArgs: [] }, () => {})
    log('Seeding the personas again…')
    // The canned ideas are drawn again from the admin console's Demo tab: a reset spends nothing on models.
    await seedPersonas({ convexRun, catalog: await sandboxCatalog().catch(() => undefined), log })
    log('Reset complete: the personas are as `pnpm try` first seeded them.')
  }
  finally {
    for (const stop of stops.reverse()) await stop()
  }
}

main().catch((error) => {
  console.error(`\x1B[31m[try:reset]\x1B[0m ${error.message}`)
  process.exit(1)
})
