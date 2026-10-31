#!/usr/bin/env node
/**
 * Wipes the website's Convex data: the dev deployment by default, production
 * when a pull request needs it (the playground deploy rule in CONTRIBUTING.md).
 *
 * The tables come from the schemas themselves — the app's, the backend
 * component's, and the ones the Resend and Polar components ship — so a new
 * table is covered the day it is declared. Each is emptied with an empty
 * `convex import --replace`, Convex's own way to clear a table. What an import
 * cannot reach runs through the app's functions: the message aggregates
 * (`_clearAll:run`) and the stored uploads (`files:cleanupOrphanUploads`).
 * The visitors' counters live in the sharded counter component, whose one
 * table is emptied the same way.
 *
 * Usage:
 *   pnpm db:reset                          every scope, on the dev deployment
 *   pnpm db:reset backend polar            only these scopes
 *   pnpm db:reset --prod --yes backend     production — `--yes` is required
 *
 * Scopes:
 *   app      the website's own tables, its uploads, the message aggregates
 *            and the visitors' counters
 *   backend  the backend component: accounts, sessions, workspaces, agent
 *            OAuth, the billing cache, gifts, AI requests, webhook log, inbox
 *   email    the email provider's component (sent emails and their events)
 *   polar    the billing provider's component (customers, products and
 *            subscriptions); refill products with `billing:syncProducts`
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { devDeployment, root } from './lib/dev-deployment.mjs'

export const SCOPES = {
  app: {
    schema: 'website/backend/schema.ts',
    // The visitors' counters, kept by the sharded counter component.
    also: [{ component: 'shardedCounter', schema: 'node_modules/@convex-dev/sharded-counter/dist/component/schema.js' }],
  },
  backend: { component: 'backend', schema: 'src/convex/components/backend/schema.ts' },
  email: { component: 'backend/resend', schema: 'node_modules/@convex-dev/resend/dist/component/schema.js' },
  polar: { component: 'polar', schema: 'node_modules/@convex-dev/polar/dist/component/schema.js' },
}

/** The tables a schema module declares, read from the module itself. */
async function tablesOf(path) {
  const schema = (await import(pathToFileURL(resolve(root, path)).href)).default
  return Object.keys(schema.tables)
}

/** What a reset of these scopes empties: each scope's tables, by component. */
export async function resetPlan(scopes = Object.keys(SCOPES)) {
  const plan = []
  for (const scope of scopes) {
    const { component, schema, also = [] } = SCOPES[scope]
    plan.push({ scope, component, tables: await tablesOf(schema), main: true })
    for (const extra of also) plan.push({ scope, component: extra.component, tables: await tablesOf(extra.schema) })
  }
  return plan
}

/**
 * Empty what `plan` names on a deployment: `target` is the environment and
 * the working directory the Convex CLI runs with, and the flags that pick
 * the deployment. Throws at the first step that fails, naming it.
 */
export function resetDeployment(plan, target, log = line => console.log(line)) {
  /** Run one `convex` command against the target; a failure names its step and stops the reset. */
  const step = (label, command, commandArgs) => {
    try {
      execFileSync('pnpm', ['exec', 'convex', command, ...commandArgs, ...target.deploymentArgs], {
        env: target.env,
        cwd: target.cwd ?? root,
        stdio: 'pipe',
      })
    }
    catch (error) {
      throw new Error(`✗ ${label}: ${error.stderr?.toString().trim() || error.message}`, { cause: error })
    }
    log(`✓ ${label}`)
  }
  const scratch = mkdtempSync(join(tmpdir(), 'db-reset-'))
  const empty = join(scratch, 'empty.jsonl')
  writeFileSync(empty, '')
  try {
    for (const { scope, component, tables, main } of plan) {
      const componentArgs = component ? ['--component', component] : []
      for (const table of tables) {
        step(`${component ?? 'app'}/${table}`, 'import', [...componentArgs, '--table', table, '--replace', '-y', empty])
      }
      if (scope === 'app' && main) {
        step('app/message aggregates', 'run', ['_clearAll:run', '{}'])
        // With the files table empty every stored upload is an orphan; a cutoff
        // of now lets the sweep take all of them.
        step('app/stored uploads', 'run', ['files:cleanupOrphanUploads', JSON.stringify({
          paginationOpts: { numItems: 100, cursor: null },
          cutoff: Date.now(),
        })])
      }
    }
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const prod = args.includes('--prod')
  const confirmed = args.includes('--yes')
  const named = args.filter(arg => !arg.startsWith('--'))
  const unknown = named.filter(name => !(name in SCOPES))
  if (unknown.length > 0) {
    console.error(`Unknown scope: ${unknown.join(', ')}. Scopes: ${Object.keys(SCOPES).join(', ')}.`)
    process.exit(1)
  }
  const scopes = named.length > 0 ? named : Object.keys(SCOPES)
  const plan = await resetPlan(scopes)

  if (prod && !confirmed) {
    console.error('This would empty these tables on PRODUCTION:\n')
    for (const { scope, component, tables } of plan) console.error(`  ${scope} (${component ?? 'app'}): ${tables.join(', ')}`)
    console.error('\nRun it again with --yes to go ahead.')
    process.exit(1)
  }

  // Dev: the deployment .env.local names, with any deploy key dropped. Prod: the
  // project's production deployment through `--prod`, as the shell is signed in.
  const target = prod
    ? { env: process.env, deploymentArgs: ['--prod'] }
    : (({ env, urlArgs }) => ({ env, deploymentArgs: urlArgs }))(devDeployment())

  console.log(`Resetting ${prod ? 'PRODUCTION' : 'the dev deployment'}: ${scopes.join(', ')}\n`)
  try {
    resetDeployment(plan, target)
  }
  catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log('\nReset complete.')
  if (scopes.includes('polar')) {
    console.log(`Refill the plan catalog: npx convex run billing:syncProducts '{}'${prod ? ' --prod' : ''}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
