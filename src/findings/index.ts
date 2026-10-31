import { AI_FINDINGS } from './ai'
import { ANALYTICS_FINDINGS } from './analytics'
import { AUTH_FINDINGS } from './auth'
import { BILLING_FINDINGS } from './billing'
import { DEPLOYMENT_FINDINGS } from './deployment'
import { EMAIL_FINDINGS } from './email'
import { MONITORING_FINDINGS } from './monitoring'
import { NOTIFICATIONS_FINDINGS } from './notifications'
import { PROTECTION_FINDINGS } from './protection'
import { SCAFFOLD_FINDINGS } from './scaffold'
import { SITE_FINDINGS } from './site'
import { CAPABILITY_NAMES } from '../capabilities/registry'
import { capabilityOfGroup } from '../capabilities/status'
import type { CapabilityName } from '../capabilities/types'
import type { FindingEntry, FindingGroup, PreflightFinding } from './types'

export type { FindingEntry, FindingGroup, PreflightFinding } from './types'

// Every finding the preflight, `doctor` and the DevTools panel can report,
// one file per group, each group in one app capability (src/capabilities/registry.ts).
// Adding a finding is one line in its group's file; emitting an id that isn't
// here is a type error, so the registry, the docs pins and `doctor --json`
// always agree.

const BY_GROUP = {
  deployment: DEPLOYMENT_FINDINGS,
  auth: AUTH_FINDINGS,
  email: EMAIL_FINDINGS,
  notifications: NOTIFICATIONS_FINDINGS,
  billing: BILLING_FINDINGS,
  ai: AI_FINDINGS,
  scaffold: SCAFFOLD_FINDINGS,
  site: SITE_FINDINGS,
  protection: PROTECTION_FINDINGS,
  monitoring: MONITORING_FINDINGS,
  analytics: ANALYTICS_FINDINGS,
} as const satisfies Record<FindingGroup, Readonly<Record<string, FindingEntry>>>

/** Every finding id. */
export type FindingId = { [G in keyof typeof BY_GROUP]: keyof (typeof BY_GROUP)[G] }[keyof typeof BY_GROUP]

/** A finding as the registry knows it: its entry, its group and its capability. */
export type RegisteredFinding = FindingEntry & { group: FindingGroup, capability: CapabilityName }

/** The finding groups, by capability in console order, then as each capability lists them. */
export const FINDING_GROUPS: readonly FindingGroup[] = CAPABILITY_NAMES.flatMap(capability =>
  (Object.keys(BY_GROUP) as FindingGroup[]).filter(group => capabilityOfGroup(group) === capability))

/** Every finding by id, with its group and capability, in report order: by capability, then group. */
export const FINDINGS: Readonly<Record<FindingId, RegisteredFinding>> = Object.fromEntries(
  FINDING_GROUPS.flatMap(group =>
    Object.entries(BY_GROUP[group]).map(([id, entry]): [string, RegisteredFinding] => [id, { ...entry, group, capability: capabilityOfGroup(group) }])),
) as Record<FindingId, RegisteredFinding>

/** The JSON Schema of `doctor --json`'s output, which names it in `$schema`. */
export const DOCTOR_SCHEMA_URL = 'https://nuxt-backend.dev/schemas/doctor.json'

/** Where a finding is explained. A stable alias the docs site redirects to the current entry. */
export function findingDocsUrl(id: FindingId): string {
  return `https://nuxt-backend.dev/d/${id}`
}

/** A finding as it is reported: the registry supplies its capability, title and docs link. */
export function finding(id: FindingId, status: PreflightFinding['status'], message: string, fixHint = ''): PreflightFinding {
  const { capability, title } = FINDINGS[id]
  return { id, capability, title, status, message, fixHint, docsUrl: findingDocsUrl(id) }
}

/** `deployment-<name>`: the finding that reports whether an env name is set on the deployment. */
export function deploymentEnvId(name: string): FindingId {
  return `deployment-${name.toLowerCase().replace(/_/g, '-')}` as FindingId
}

/**
 * Production posture: the optional tier's designed degradations are fine in
 * dev, but a live product without email transport has broken sign-in. A
 * `warn` of a finding marked `prod: 'fail'` becomes a failure, unless the
 * check already read production's own value and chose `warn` on purpose
 * (`settled`: a deliberate `sandbox`).
 */
export function applyProductionPosture(findings: PreflightFinding[], settled: ReadonlySet<string> = new Set()): PreflightFinding[] {
  return findings.map(reported => FINDINGS[reported.id as FindingId]?.prod === 'fail' && reported.status === 'warn' && !settled.has(reported.id)
    ? { ...reported, status: 'fail' as const, message: `${reported.message} (production posture: failure)` }
    : reported)
}
