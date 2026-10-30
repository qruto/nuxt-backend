// The app capabilities: one registry that `doctor --only`, `nuxt-backend status`,
// the DevTools Overview, `.env.example` and the docs' Capabilities page read.

export type { CapabilityContext, CapabilityDeployment, CapabilityName, CapabilityState, CapabilityStatus, CapabilitySwitch } from './types'
export { CAPABILITY_STATE_MEANING, CAPABILITY_STATES } from './types'
export { CAPABILITY_NAMES, CAPABILITIES } from './registry'
export { detectCapabilities, capabilityOfEnv, capabilityOfGroup, capabilityStatus } from './status'
export { healthStatus, capabilityHealth, capabilitySummary, type HealthStatus } from './health'
export { renderEnvExample } from './env-example'
