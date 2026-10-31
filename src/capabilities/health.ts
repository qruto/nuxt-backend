import { CAPABILITY_STATES, type CapabilityName, type CapabilityState, type CapabilityStatus } from './types.js'

/**
 * The app's health, coarse: `ok` while every capability is live or test,
 * `degraded` once one is missing, `failing` once one fails.
 */
export type HealthStatus = 'ok' | 'degraded' | 'failing'

/**
 * The health a public endpoint may show: the summary and each capability's state,
 * and nothing else. No env name, finding or message is in it, so it says what
 * works without saying how the app is configured.
 */
export interface CapabilityHealth {
  status: HealthStatus
  capabilities: Partial<Record<CapabilityName, CapabilityState>>
}

/**
 * The health an admin sees: the coarse form plus, per capability, why it is in
 * its state, the env it lacks and its most pressing finding's id.
 */
export interface CapabilityHealthDetail extends CapabilityHealth {
  detail: Partial<Record<CapabilityName, { reason: string, missingEnv: string[], top: string | null }>>
}

/** `3 live · 3 test · 1 missing`: the states in console order, the empty ones left out. */
export function capabilitySummary(states: readonly CapabilityState[]): string {
  return CAPABILITY_STATES
    .map(state => [state, states.filter(each => each === state).length] as const)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${state}`)
    .join(' · ')
}

/** The coarse health of a set of capability states. */
export function healthStatus(states: readonly CapabilityState[]): HealthStatus {
  if (states.includes('failing')) return 'failing'
  if (states.includes('missing')) return 'degraded'
  return 'ok'
}

/**
 * The health of the app, from its capabilities' statuses: the coarse form, safe to
 * serve publicly, or with `detail` the form for admins.
 */
export function capabilityHealth(statuses: readonly CapabilityStatus[]): CapabilityHealth
export function capabilityHealth(statuses: readonly CapabilityStatus[], options: { detail: true }): CapabilityHealthDetail
export function capabilityHealth(statuses: readonly CapabilityStatus[], options: { detail?: boolean } = {}): CapabilityHealth | CapabilityHealthDetail {
  const coarse: CapabilityHealth = {
    status: healthStatus(statuses.map(capability => capability.state)),
    capabilities: Object.fromEntries(statuses.map(capability => [capability.name, capability.state])),
  }
  if (!options.detail) return coarse
  return {
    ...coarse,
    detail: Object.fromEntries(statuses.map(capability => [capability.name, { reason: capability.reason, missingEnv: [...capability.missingEnv], top: capability.top?.id ?? null }])),
  }
}
