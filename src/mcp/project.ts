/**
 * The project-state tools: what `doctor`, `status`, the env registry,
 * `billing sync --dry-run` and the function contract say, as data. Each
 * runs the same code as its command, against the dev deployment, or
 * production's with `--prod`, and none of them writes anything.
 */
import { z } from 'zod'
import { capabilityOfEnv, CAPABILITY_NAMES, type CapabilityName } from '../capabilities'
import { runBillingSync } from '../cli/billing'
import { collectStatus } from '../cli/status'
import { REQUIRED_FUNCTION_EXPORTS } from '../contract'
import { SENSITIVE_ACTIONS } from '../convex/sensitive-actions'
import { runDoctorChecks } from '../doctor'
import { BACKEND_ENV, REMOVED_DEPLOYMENT_ENV } from '../env-registry'
import { deploymentEnvNames, deploymentFunctionSpec, readEnvFiles } from '../env-push'
import { doctorReport } from '../preflight'
import { defineTool, ToolRefusal, type DevTool } from './tools'

/** One env name as the `env` tool answers it: never a value. */
export interface EnvNameReport {
  name: string
  /** The capability it belongs to. */
  capability: string | null
  /** Where it is read: the deployment, the app, or both. */
  side: 'deployment' | 'app' | 'both'
  /** A deploy fails without it. */
  required: boolean
  /** Set in the process env, `.env` or `.env.local`. */
  local: boolean
  /** Set on the deployment; null when the deployment's names could not be read, or the app alone reads it. */
  deployment: boolean | null
  /** What happens without it. */
  without: string
}

/** What the `env` tool answers. */
export interface EnvReport {
  /** The deployment read: `dev` (the one `.env.local` names) or `production`. */
  deployment: 'dev' | 'production'
  /** Whether the deployment's names could be read. */
  deploymentReadable: boolean
  names: EnvNameReport[]
  /** Names 0.2.0 removed that the deployment still holds. */
  removed: string[]
}

/** The env registry against the names set locally and on the deployment. */
export async function envReport(rootDir: string, prod: boolean): Promise<EnvReport> {
  const local = new Set(Object.keys({ ...readEnvFiles(rootDir), ...process.env }))
  const deployed = await deploymentEnvNames(rootDir, { prod })
  const onDeployment = deployed ? new Set(deployed) : null
  const names = Object.entries(BACKEND_ENV).map(([name, entry]): EnvNameReport => ({
    name,
    capability: capabilityOfEnv(name) ?? null,
    side: entry.side,
    required: 'required' in entry && entry.required === true,
    local: local.has(name),
    deployment: entry.side === 'app' || !onDeployment ? null : onDeployment.has(name),
    without: entry.without,
  }))
  return {
    deployment: prod ? 'production' : 'dev',
    deploymentReadable: onDeployment !== null,
    names,
    removed: onDeployment ? REMOVED_DEPLOYMENT_ENV.filter(name => onDeployment.has(name)) : [],
  }
}

/** One scaffold function as the `functions` tool answers it. */
export interface FunctionReport {
  /** As the client calls it: `billing:getPricing`. */
  name: string
  /** Whether the deployment has it; null when its functions could not be read. */
  deployed: boolean | null
  /**
   * What a call takes, for a write the sensitive-action table lists: how
   * recent a sign-in (seconds, or null), whether an administrator acting as
   * the account may make it, and the limits it spends. Null for a read the
   * table leaves out: any signed-in account, under the function's own check.
   */
  takes: { recentSignIn: number | null, impersonation: 'allowed' | 'refused', limit: unknown } | null
}

/** The function contract against the deployment's functions. */
export async function functionsReport(rootDir: string, prod: boolean): Promise<{ deployment: string | null, functions: FunctionReport[] }> {
  const spec = await deploymentFunctionSpec(rootDir, { prod })
  const functions = Object.entries(REQUIRED_FUNCTION_EXPORTS).flatMap(([module, names]) => names.map((fn): FunctionReport => {
    const name = `${module}:${fn}`
    const row = SENSITIVE_ACTIONS[name]
    return {
      name,
      deployed: spec ? spec.identifiers.has(name) : null,
      takes: row ? { recentSignIn: row.recentSignIn, impersonation: row.impersonation, limit: row.limit } : null,
    }
  }))
  return { deployment: spec?.url ?? null, functions }
}

const capability = z.enum(CAPABILITY_NAMES as [string, ...string[]])

export function projectTools(): DevTool[] {
  return [
    defineTool({
      name: 'doctor',
      title: 'Doctor findings',
      description: 'Every `doctor` finding with its status and its fix, for the capabilities named or all of them: what `npx nuxt-backend doctor --json` prints. Read it before changing setup, and again after, to see what the change fixed. Production\'s findings when the server runs with --prod.',
      input: z.object({ only: z.array(capability).optional().describe('Check only these capabilities') }),
      run: async ({ only }, { rootDir, prod }) => doctorReport(await runDoctorChecks(rootDir, { prod, ...(only?.length ? { only: only as CapabilityName[] } : {}) })),
    }),
    defineTool({
      name: 'status',
      title: 'Capability status',
      description: 'Each capability\'s state, `live`, `test`, `missing` or `failing`, with its providers, its unset env and its most pressing finding: what `npx nuxt-backend status --json` prints.',
      input: z.object({}),
      run: async (_args, { rootDir, prod }) => collectStatus(rootDir, { prod }),
    }),
    defineTool({
      name: 'env',
      title: 'Environment names',
      description: 'Every env name the app and its deployment read: which capability it belongs to, whether a deploy needs it, whether it is set locally (.env, .env.local) and on the deployment, and what a missing one turns off. Names only: no value is ever read or answered. Lists the removed names the deployment still holds too.',
      input: z.object({}),
      run: async (_args, { rootDir, prod }) => envReport(rootDir, prod),
    }),
    defineTool({
      name: 'catalog',
      title: 'Billing catalog plan',
      description: 'What `npx nuxt-backend billing sync --dry-run` would do with backend/billing.catalog.ts: each product, meter, benefit and discount it would create, change, leave or report as drift, and the webhook step. Creates nothing. Reads the sandbox, or production with --prod.',
      input: z.object({}),
      run: async (_args, { rootDir, prod }) => {
        const lines: string[] = []
        const { report, refusal } = await runBillingSync(rootDir, { dryRun: true, ...(prod ? { environment: 'production' } : {}) }, { print: line => lines.push(line) })
        if (!report) throw new ToolRefusal(refusal ?? (lines.join('\n') || 'billing sync --dry-run could not run.'))
        return report
      },
    }),
    defineTool({
      name: 'functions',
      title: 'Function contract',
      description: 'Every function the scaffold exports (`billing:getPricing`, `auth:listSessions`, …): whether the deployment has it, and what a call takes: a recent sign-in, no administrator acting as the account, the limits it spends. The contract `doctor`\'s function-contract finding checks.',
      input: z.object({}),
      run: async (_args, { rootDir, prod }) => functionsReport(rootDir, prod),
    }),
  ]
}
