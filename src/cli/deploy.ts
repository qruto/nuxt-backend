import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { runConvex, spawnConvex } from '../convex-cli'
import { runDoctorChecks } from '../doctor'
import { deploymentBackendEnvironment, deploymentEnvNames, deploymentFunctionSpec, nonProductionDeployKey, readEnvFiles, setDeploymentEnv } from '../env-push'
import { runBillingSync } from './billing'
import { runEmailSync } from './email'
import { progress, withContract } from './contract'
import { askOnTerminal } from './deploy/ask'
import { runBuild } from './deploy/build'
import { ensureEmailWebhook } from './deploy/email-webhook'
import { buildCommandAdvice, deployHost } from './deploy/host'
import { runDeploy, type DeployBackend } from './deploy/run'

/** The name of the deploy key `deploy` creates for the app's host. */
const HOST_KEY_NAME = 'nuxt-backend-host'

/** A deploy key in `deployment token create`'s output: the line that holds one (`<type>:<name>|<secret>`). */
export function deployKeyOf(output: string): string {
  const key = output.split('\n').map(line => line.trim()).reverse().find(line => /^[\w-]+:[\w:-]+\|\S+$/.test(line))
  if (!key) throw new Error('npx convex deployment token create printed no deploy key')
  return key
}

/** The production deployment through the project's Convex CLI: the developer's login, or the production deploy key in the shell. */
function convexBackend(rootDir: string, { json }: { json: boolean }): DeployBackend {
  const prod = { prod: true }
  return {
    envNames: () => deploymentEnvNames(rootDir, prod),
    environment: () => deploymentBackendEnvironment(rootDir, prod),
    create: async () => {
      await runConvex(rootDir, ['deployment', 'create', '--type', 'prod', '--default'], { timeout: 120_000 })
    },
    setEnv: (name, value) => setDeploymentEnv(rootDir, name, value, prod),
    // At a terminal the push prints as it goes; under --json its output stays off stdout.
    push: () => json
      ? runConvex(rootDir, ['deploy'], { timeout: 600_000 }).then(() => 0, () => 1)
      : spawnConvex(rootDir, ['deploy']),
    url: async () => (await deploymentFunctionSpec(rootDir, prod))?.url ?? null,
    createDeployKey: async () => deployKeyOf((await runConvex(rootDir, ['deployment', 'token', 'create', HOST_KEY_NAME, '--prod'])).stdout),
  }
}

/** Whether a person can be asked: a terminal, not CI, not `--json`. */
function interactive(json: boolean): boolean {
  return !json && Boolean(process.stdin.isTTY) && !process.env.CI
}

export const deploy = withContract('deploy', {
  sideEffects: ['writes production', 'writes provider accounts', 'writes project files'],
  byFlag: {
    '--dry-run': ['reads only'],
    '--build': ['writes production', 'writes a preview deployment'],
  },
  json: '`{ dryRun, environment, host, steps: [{ id, capability, title, outcome, detail }], doctor }`: `outcome` is `done`, `unchanged`, `planned`, `skipped` or `failed`, `doctor` is `{ pass, warn, fail, failing }` or null; values never appear',
  exitCodes: {
    0: 'production passes `doctor --prod`, or a dry run; a step that waits on a key only you hold is skipped, not failed',
    1: 'refused, a step failed, or `doctor --prod` fails',
  },
}, defineCommand({
  meta: { name: 'deploy', description: 'Take production from nothing to a passing doctor --prod: link or create the production deployment, push its env, push the backend, sync the billing catalog, register both webhooks, write the app\'s env into the Vercel project, then run doctor --prod. Safe to run again' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'dry-run': { type: 'boolean', description: 'Print every step it would take, and change nothing', default: false },
    'sandbox': { type: 'boolean', description: 'A demo or staging app: set BACKEND_ENVIRONMENT=sandbox instead of production, and sync to the providers\' test modes', default: false },
    'build': { type: 'boolean', description: 'Run as the host\'s build command: put the env the first push needs on production (AUTH_SECRET, SITE_URL from the host), then convex deploy builds the app against the backend', default: false },
    'json': { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const print = progress(args.json)
    if (args.build) {
      if (args.sandbox || args['dry-run']) {
        console.error('[nuxt-backend] deploy --build takes no other flag: it never sets BACKEND_ENVIRONMENT, and it writes.')
        process.exitCode = 1
        return
      }
      process.exitCode = await runBuild({ backend: convexBackend(rootDir, { json: false }), convexDeploy: deployArgs => spawnConvex(rootDir, deployArgs), env: process.env, print: line => console.error(line) })
      return
    }
    const key = nonProductionDeployKey({ ...readEnvFiles(rootDir), ...process.env })
    if (key) {
      console.error(`[nuxt-backend] deploy refused: CONVEX_DEPLOY_KEY is a ${key} deployment key, and the Convex CLI would act on that deployment instead of production. Use the production deploy key, or unset it to use your Convex login.`)
      process.exitCode = 1
      return
    }
    const host = deployHost(rootDir)
    print(`[nuxt-backend] deploy → production${args.sandbox ? ' as a sandbox' : ''}, ${host.kind === 'vercel' ? 'the linked Vercel project' : 'a host you set by hand'}${args['dry-run'] ? ' — dry run' : ''}`)
    const { exitCode, report } = await runDeploy({ dryRun: args['dry-run'], sandbox: args.sandbox }, {
      backend: convexBackend(rootDir, { json: args.json }),
      host,
      ...(interactive(args.json) ? { ask: askOnTerminal } : {}),
      env: process.env,
      billingSync: options => runBillingSync(rootDir, options, { print }),
      emailWebhook: (apiKey, url, options) => ensureEmailWebhook(apiKey, url, options),
      emailSync: ({ dryRun }) => runEmailSync(rootDir, { prod: true, dryRun }),
      doctor: () => runDoctorChecks(rootDir, { prod: true }),
      buildAdvice: host.kind === 'vercel' ? buildCommandAdvice(rootDir) : null,
      print,
    })
    if (args.json) console.log(JSON.stringify(report, null, 2))
    if (exitCode !== 0) process.exitCode = exitCode
  },
}))
