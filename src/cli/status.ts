import { styleText } from 'node:util'
import { computeDeployment } from '../deployment'
import { DEPLOYMENT_KIND_LABEL } from '../devtools/rpc-types'
import { runDoctorChecks } from '../doctor'
import { deploymentBackendEnvironment, deploymentEnvNames, readEnvFiles, type DeploymentTarget } from '../env-push'
import { detectCapabilities, healthStatus, CAPABILITY_NAMES, capabilitySummary, type HealthStatus, type CapabilityDeployment, type CapabilityState, type CapabilityStatus, type CapabilitySwitch } from '../capabilities'
import { appMonitoringDsn, monitoringSdkInstalled } from '../monitoring'
import { readProductionPosture, type ProductionPosture } from './posture'

/** What `nuxt-backend status --json` prints. */
export interface StatusReport {
  /** The deployment checked: its kind, and its id when `.env.local` names it. */
  deployment: { kind: CapabilityDeployment, id?: string }
  /** `ok` while every capability is live or test, `degraded` once one is missing, `failing` once one fails. */
  status: HealthStatus
  /** Every capability, in console order. */
  capabilities: CapabilityStatus[]
  /** One line: how many capabilities are in each state. */
  summary: string
}

/**
 * Detect every capability of the project in `rootDir` (production's with `prod`):
 * doctor's checks, run once against the deployment's env names, read once,
 * then each capability's detection over them. No probe of its own beyond the
 * deployment's `BACKEND_ENVIRONMENT`, read off it where it sets one; under
 * `--prod` it comes from production's posture, which doctor's checks read
 * with it (and the live site with it), once.
 */
export async function collectStatus(rootDir: string, { prod }: { prod: boolean }): Promise<StatusReport> {
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>
  const deployedNames = await deploymentEnvNames(rootDir, { prod })
  const posture = prod && deployedNames ? readProductionPosture(rootDir, deployedNames, () => true) : null
  const [findings, switches] = await Promise.all([
    runDoctorChecks(rootDir, { prod, deployedNames, ...posture ? { posture } : {} }),
    posture ? posture.then(switchesOf) : readSwitches(rootDir, { prod }, deployedNames ?? []),
  ])
  const local = computeDeployment(rootDir, env)
  const deployment: StatusReport['deployment'] = prod ? { kind: 'production' } : { kind: local.kind, ...(local.id ? { id: local.id } : {}) }
  // The app reports errors once the SDK is wired: installed, with a DSN.
  // Under --prod the env here is not production's: the app's side is unknown.
  const app = { monitoring: !prod && Boolean(appMonitoringDsn(env)) && monitoringSdkInstalled(rootDir) }
  const capabilities = detectCapabilities({ env, deployed: deployedNames ? new Set(deployedNames) : null, switches, deployment: deployment.kind, findings, prod, app })
  return { deployment, status: healthStatus(capabilities.map(capability => capability.state)), capabilities, summary: capabilitySummary(capabilities.map(capability => capability.state)) }
}

/** The switch production's posture read, as detection takes it: one unset or unread is left out. */
function switchesOf(posture: ProductionPosture): Partial<Record<CapabilitySwitch, string>> {
  const { environment } = posture
  return environment === 'unset' || environment === 'unread' ? {} : { BACKEND_ENVIRONMENT: environment }
}

/**
 * The switch the deployment sets, with the value it was read as. One that
 * could not be read is left out, so detection takes its safe mode.
 */
async function readSwitches(rootDir: string, target: DeploymentTarget, names: readonly string[]): Promise<Partial<Record<CapabilitySwitch, string>>> {
  if (!names.includes('BACKEND_ENVIRONMENT')) return {}
  const environment = await deploymentBackendEnvironment(rootDir, target)
  return environment === null ? {} : { BACKEND_ENVIRONMENT: environment }
}

/** Each state's light: on, half lit, off, and the failure mark doctor prints. */
export const STATE_GLYPH: Record<CapabilityState, string> = { live: '●', test: '◐', missing: '○', failing: '✗' }

/**
 * Whether stdout shows colour: a terminal that has colours, as the terminal
 * itself reports it (which honours `NO_COLOR` and `FORCE_COLOR`). Piped or
 * redirected output stays plain.
 */
export function terminalShowsColor(stream: { isTTY?: boolean, hasColors?: () => boolean } = process.stdout): boolean {
  return stream.isTTY === true && stream.hasColors?.() === true
}

/** Each state's colour, on a terminal that shows colour: the console's three signals and grey. */
const STATE_COLOR = { live: 'green', test: 'yellow', missing: 'gray', failing: 'red' } as const satisfies Record<CapabilityState, string>

const FINDING_GLYPH = { pass: '✓', warn: '⚠', fail: '✗' } as const

/** The name column: as wide as the longest capability name. */
const NAME_WIDTH = Math.max(...CAPABILITY_NAMES.map(name => name.length))

/**
 * The console `status` prints: a line per capability with its light, state,
 * providers and why, then the env it lacks and its most pressing finding,
 * and a summary that names the doctor run for the capabilities needing attention.
 */
export function formatStatus(report: StatusReport, { color = false, prod = false }: { color?: boolean, prod?: boolean } = {}): string[] {
  const light = (state: CapabilityState) => color ? styleText(STATE_COLOR[state], STATE_GLYPH[state], { validateStream: false }) : STATE_GLYPH[state]
  const { deployment } = report
  const lines = [`nuxt-backend status · ${deployment.id ? `${deployment.id} (${DEPLOYMENT_KIND_LABEL[deployment.kind]})` : DEPLOYMENT_KIND_LABEL[deployment.kind]}`, '']
  for (const capability of report.capabilities) {
    lines.push(`${light(capability.state)} ${capability.name.padEnd(NAME_WIDTH)} ${capability.state.padEnd(10)} ${capability.providers.join(', ')}: ${capability.reason}`)
    if (capability.missingEnv.length > 0) lines.push(`    unset: ${capability.missingEnv.join(', ')}`)
    if (capability.top) lines.push(`    ${FINDING_GLYPH[capability.top.status]} ${capability.top.title}: ${capability.top.message}`)
  }
  const attention = report.capabilities.filter(capability => capability.top).map(capability => capability.name)
  lines.push('', attention.length > 0
    ? `${report.summary} — fixes: npx nuxt-backend doctor --only ${attention.join(',')}${prod ? ' --prod' : ''}`
    : report.summary)
  return lines
}
