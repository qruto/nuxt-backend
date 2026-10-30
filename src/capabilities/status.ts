import { BACKEND_ENV, type BackendEnvEntry, type BackendEnvName } from '../env-registry.js'
import type { FindingGroup } from '../findings/types.js'
import { isSet } from './detect.js'
import { CAPABILITY_NAMES, CAPABILITIES } from './registry.js'
import { CAPABILITY_SWITCHES, type CapabilityContext, type CapabilityFinding, type CapabilityName, type CapabilityStatus } from './types.js'

/** Where the docs site serves a capability's docs home. */
const DOCS_ORIGIN = 'https://nuxt-backend.dev'

/** The capability each finding group belongs to. */
const CAPABILITY_OF_GROUP = new Map<FindingGroup, CapabilityName>(CAPABILITY_NAMES.flatMap(name => CAPABILITIES[name].findings.map(group => [group, name] as const)))

/** The capability a finding group belongs to. Every group has one (test/unit/capabilities.test.ts). */
export function capabilityOfGroup(group: FindingGroup): CapabilityName {
  const capability = CAPABILITY_OF_GROUP.get(group)
  if (!capability) throw new Error(`The finding group ${group} belongs to no capability: list it in a capability's findings (src/capabilities/registry.ts)`)
  return capability
}

/** The capability an env name belongs to, `undefined` for a name no capability lists. */
export function capabilityOfEnv(name: string): CapabilityName | undefined {
  return CAPABILITY_NAMES.find(capability => (CAPABILITIES[capability].env as readonly string[]).includes(name))
}

/**
 * Whether an unset name says something is missing: an authored deployment
 * name. The app's backend URL derives from the deployment, and outside
 * production the environment unset keeps its safe mode (test mode, the
 * sandbox). A name needed only
 * when flagged counts while one of its findings warns or fails: the gateway
 * key, once doctor found the backend naming a model, and not before.
 */
function counts(name: BackendEnvName, context: CapabilityContext): boolean {
  const entry: BackendEnvEntry = BACKEND_ENV[name]
  if (entry.devOnly) return false
  if (entry.whenFlagged) {
    return context.findings.some(finding => entry.findings.includes(finding.id) && (finding.status === 'warn' || finding.status === 'fail'))
  }
  return entry.side !== 'app' && (context.prod === true || !(CAPABILITY_SWITCHES as readonly string[]).includes(name))
}

/** One capability's status: its detected state, the env it lacks, and its most pressing finding. */
export function capabilityStatus(name: CapabilityName, context: CapabilityContext): CapabilityStatus {
  const capability = CAPABILITIES[name]
  const own = context.findings.filter(finding => finding.capability === name)
  const worst = own.find(finding => finding.status === 'fail') ?? own.find(finding => finding.status === 'warn')
  const top: CapabilityFinding | null = worst
    ? { id: worst.id, status: worst.status, title: worst.title, message: worst.message, fixHint: worst.fixHint, docsUrl: worst.docsUrl }
    : null
  const tally = (status: 'pass' | 'warn' | 'fail') => own.filter(finding => finding.status === status).length
  return {
    name,
    title: capability.title,
    ...capability.detect(context),
    providers: capability.providers.map(provider => provider.name),
    missingEnv: capability.env.filter(env => counts(env, context) && !isSet(context, env)),
    findings: { pass: tally('pass'), warn: tally('warn'), fail: tally('fail') },
    top,
    docsUrl: `${DOCS_ORIGIN}${capability.docs}`,
    devtools: capability.devtools,
  }
}

/** Every capability's status, in console order. */
export function detectCapabilities(context: CapabilityContext): CapabilityStatus[] {
  return CAPABILITY_NAMES.map(name => capabilityStatus(name, context))
}
