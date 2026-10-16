import { AGENTS_FINDINGS } from './agents'
import { AI_FINDINGS } from './ai'
import { AUTH_FINDINGS } from './auth'
import { BILLING_FINDINGS } from './billing'
import { DEPLOYMENT_FINDINGS } from './deployment'
import { EMAIL_FINDINGS } from './email'
import { SCAFFOLD_FINDINGS } from './scaffold'
import type { FindingEntry, FindingService, PreflightFinding } from './types'

export type { FindingEntry, FindingService, PreflightFinding } from './types'

// Every finding the preflight, `doctor` and the DevTools panel can report,
// one file per service. Adding a finding is one line in its service's file;
// emitting an id that isn't here is a type error, so the registry, the docs
// pins and `doctor --json` always agree.

const BY_SERVICE = {
  deployment: DEPLOYMENT_FINDINGS,
  auth: AUTH_FINDINGS,
  email: EMAIL_FINDINGS,
  billing: BILLING_FINDINGS,
  agents: AGENTS_FINDINGS,
  ai: AI_FINDINGS,
  scaffold: SCAFFOLD_FINDINGS,
} as const satisfies Record<FindingService, Readonly<Record<string, FindingEntry>>>

/** Every finding id. */
export type FindingId = { [S in keyof typeof BY_SERVICE]: keyof (typeof BY_SERVICE)[S] }[keyof typeof BY_SERVICE]

/** The services `doctor --only` accepts, in report order. */
export const FINDING_SERVICES = Object.keys(BY_SERVICE) as FindingService[]

/** Every finding by id, with its service. */
export const FINDINGS: Readonly<Record<FindingId, FindingEntry & { service: FindingService }>> = Object.fromEntries(
  Object.entries(BY_SERVICE).flatMap(([service, entries]) =>
    Object.entries(entries).map(([id, entry]) => [id, { ...entry, service: service as FindingService }])),
) as Record<FindingId, FindingEntry & { service: FindingService }>

/** The JSON Schema of `doctor --json`'s output, which names it in `$schema`. */
export const DOCTOR_SCHEMA_URL = 'https://nuxt-backend.dev/schemas/doctor.json'

/** Where a finding is explained. A stable alias the docs site redirects to the current entry. */
export function findingDocsUrl(id: FindingId): string {
  return `https://nuxt-backend.dev/d/${id}`
}

/** A finding as it is reported: the registry supplies its service, title and docs link. */
export function finding(id: FindingId, status: PreflightFinding['status'], message: string, fixHint = ''): PreflightFinding {
  const { service, title } = FINDINGS[id]
  return { id, service, title, status, message, fixHint, docsUrl: findingDocsUrl(id) }
}

/** `deployment-<name>`: the finding that reports whether an env name is set on the deployment. */
export function deploymentEnvId(name: string): FindingId {
  return `deployment-${name.toLowerCase().replace(/_/g, '-')}` as FindingId
}

/**
 * Production posture: the optional tier's designed degradations are fine in
 * dev, but a live product without email transport has broken sign-in. A
 * `warn` of a finding marked `prod: 'fail'` becomes a failure.
 */
export function applyProductionPosture(findings: PreflightFinding[]): PreflightFinding[] {
  return findings.map(reported => FINDINGS[reported.id as FindingId]?.prod === 'fail' && reported.status === 'warn'
    ? { ...reported, status: 'fail' as const, message: `${reported.message} (production posture: failure)` }
    : reported)
}
