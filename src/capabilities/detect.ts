import { type BackendEnvironment, isLive, parseBackendEnvironment } from '../convex/environment.js'
import { TEST_CHALLENGE_SITE_KEYS } from '../convex/proof.js'
import { DEPLOYMENT_KIND_LABEL } from '../devtools/rpc-types.js'
import type { CapabilityContext, CapabilityDetection, CapabilityName, CapabilitySwitch } from './types.js'

// The probes every capability's `detect` is built from. They read the env (names,
// and two mode switches), the deployment's env names and the findings doctor
// already reported: detection runs no check of its own.

/**
 * Whether a deployment env name is set where the backend reads it. Once the
 * deployment's names are read they decide; until then, what is visible here
 * (or was provisioned there) stands in. Under production posture the env
 * visible here is not production's, so nothing else counts.
 */
export function isSet(context: CapabilityContext, name: string): boolean {
  if (context.deployed) return context.deployed.has(name)
  if (context.prod) return false
  return Boolean(context.env[name]) || context.provisioned?.has(name) === true
}

/**
 * Why `names` read as not set, in a clause: unset, set here but never pushed,
 * or, under production posture, unset on production or not readable at all.
 */
export function unsetReason(context: CapabilityContext, names: readonly string[]): string {
  if (context.prod && !context.deployed) return 'production\'s env names could not be read'
  const subject = `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'}`
  if (context.prod) return `${subject} not set on the production deployment`
  if (context.deployed && names.every(name => context.env[name])) return `${subject} set here but not on the deployment (run env push)`
  return `${subject} not set`
}

/**
 * A switch's value as the backend reads it: read off the deployment, else
 * the one visible here when the deployment has the name too (what `env
 * push` sent). `undefined` when it is not set, so the backend's default
 * holds; `null` when it is set and its value could not be read.
 */
function switchValue(context: CapabilityContext, name: CapabilitySwitch): string | null | undefined {
  if (context.switches && name in context.switches) return context.switches[name]
  if (!isSet(context, name)) return undefined
  return context.prod ? null : context.env[name] || null
}

/** `failing`, naming the capability's first failed finding; `null` when none failed. */
export function failingFinding(context: CapabilityContext, capability: CapabilityName): CapabilityDetection | null {
  const failed = context.findings.find(finding => finding.capability === capability && finding.status === 'fail')
  return failed ? { state: 'failing', reason: `${failed.title} failed` } : null
}

/**
 * A capability that runs on the deployment itself (data, jobs): live on production
 * or a self-hosted deployment, test on a dev, preview or local one (a
 * deployment that is not production), missing without one.
 */
export function onDeployment(context: CapabilityContext): CapabilityDetection {
  const { deployment } = context
  if (deployment === 'none') return { state: 'missing', reason: 'no deployment is configured' }
  const reason = `runs on the ${DEPLOYMENT_KIND_LABEL[deployment]}`
  return { state: ['production', 'self-hosted'].includes(deployment) ? 'live' : 'test', reason }
}

/**
 * Notifications: the inbox runs on the deployment; web push needs its key
 * pair. Missing without either key (the inbox works, push does not), else
 * as the deployment runs.
 */
export function notificationsMode(context: CapabilityContext): CapabilityDetection {
  const deployment = onDeployment(context)
  if (deployment.state === 'missing') return deployment
  const unset = ['PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY'].filter(name => !isSet(context, name))
  if (unset.length > 0) return { state: 'missing', reason: `${unsetReason(context, unset.slice(0, 1))}: the in-app inbox works, web push does not` }
  return deployment
}

/**
 * The deployment's kind, as its `BACKEND_ENVIRONMENT` says. `undefined` when
 * it is not set, or none of the four kinds (the backend reads either as the
 * safe mode: test mode, the sandbox); `null` when it is set and its value
 * could not be read.
 */
function environmentOf(context: CapabilityContext): BackendEnvironment | null | undefined {
  const value = switchValue(context, 'BACKEND_ENVIRONMENT')
  return value === null ? null : parseBackendEnvironment(value)
}

/**
 * The email transport, failing findings aside: missing without a key; with
 * one, the provider's test mode (everywhere but `production`) or live. A
 * `BACKEND_ENVIRONMENT` whose value could not be read keeps test mode on,
 * the backend's own default for any value but `production`, and says so.
 */
export function emailMode(context: CapabilityContext): CapabilityDetection {
  if (!isSet(context, 'EMAIL_API_KEY')) return { state: 'missing', reason: `${unsetReason(context, ['EMAIL_API_KEY'])}, so sends no-op` }
  const environment = environmentOf(context)
  if (environment === null) return { state: 'test', reason: 'BACKEND_ENVIRONMENT is set on the deployment and its value was not read: taken as test mode' }
  if (isLive(environment)) return { state: 'live', reason: 'BACKEND_ENVIRONMENT is production: delivers to every address' }
  return { state: 'test', reason: environment ? `BACKEND_ENVIRONMENT is ${environment}: only the provider's test addresses receive mail` : 'test mode: only the provider\'s test addresses receive mail' }
}

/**
 * The models, when they decide the ai capability's state: missing once doctor
 * found the backend naming models the deployment cannot reach; `null` when
 * the models are as real as the billing they spend.
 */
export function modelMode(context: CapabilityContext): CapabilityDetection | null {
  if (isSet(context, 'AI_GATEWAY_API_KEY')) return null
  const key = context.findings.find(finding => finding.id === 'deployment-ai-gateway-api-key')
  if (key?.status === 'warn' || key?.status === 'fail') return { state: 'missing', reason: `its models are refused: ${unsetReason(context, ['AI_GATEWAY_API_KEY'])}` }
  return null
}

/**
 * Billing, failing findings aside: missing without an access token, then the
 * provider's sandbox (the backend's default) or its production environment. A
 * `BACKEND_ENVIRONMENT` whose value could not be read is taken as the
 * sandbox, and says so.
 */
export function billingMode(context: CapabilityContext): CapabilityDetection {
  if (!isSet(context, 'BILLING_ACCESS_TOKEN')) return { state: 'missing', reason: unsetReason(context, ['BILLING_ACCESS_TOKEN']) }
  const environment = environmentOf(context)
  if (environment === null) return { state: 'test', reason: 'BACKEND_ENVIRONMENT is set on the deployment and its value was not read: taken as the sandbox' }
  return isLive(environment)
    ? { state: 'live', reason: 'the production billing environment' }
    : { state: 'test', reason: 'the billing sandbox' }
}

/** How the deployment takes proof of a person, once it takes one, in a clause; `null` when it takes none. */
export function protectionTakes(proof: boolean, challenge: boolean): string | null {
  if (proof && challenge) return 'proofs from the app\'s bot check, or a challenge answer'
  if (proof) return 'proofs the app\'s server signs once its bot check passed (BotID on Vercel)'
  return challenge ? 'challenge answers the deployment verifies' : null
}

/** Whether the app shows the challenge on one of the provider's test site keys (public, and the app's own outside production). */
function onTestSiteKey(context: CapabilityContext): boolean {
  const siteKey = context.prod ? undefined : context.env.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY
  return Boolean(siteKey && TEST_CHALLENGE_SITE_KEYS.includes(siteKey))
}

/**
 * Bot protection, failing findings aside, by what the deployment checks:
 * proofs the app's server signs after its own bot check
 * (`PROTECTION_PROOF_SECRET`, BotID on Vercel), challenge answers it
 * verifies (`PROTECTION_CHALLENGE_SECRET_KEY`), either, or neither.
 *
 * Outside production posture the app is the dev server, whose bot check
 * answers human, as BotID does in development, and signs a proof for every
 * request: test mode whatever is set, unless the deployment takes a
 * challenge answer alone and the app shows a real widget, which checks
 * people here too. A widget on the provider's test site key is test mode
 * wherever it runs.
 */
export function protectionMode(context: CapabilityContext): CapabilityDetection {
  const proof = isSet(context, 'PROTECTION_PROOF_SECRET')
  const challenge = isSet(context, 'PROTECTION_CHALLENGE_SECRET_KEY')
  const takes = protectionTakes(proof, challenge)
  const siteKey = context.env.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY
  if (context.deployment === 'none') return { state: 'missing', reason: 'no deployment is configured' }
  if (!context.prod && context.deployment !== 'production') {
    if (challenge && !proof && siteKey && !onTestSiteKey(context)) return { state: 'live', reason: `${takes}, from a real challenge on the dev server` }
    return { state: 'test', reason: `test mode: the dev server's bot check answers human, as BotID does in development${takes ? `; the deployment takes ${takes}` : ''}` }
  }
  if (!takes) {
    return { state: 'missing', reason: context.prod && !context.deployed ? 'production\'s env names could not be read' : 'neither PROTECTION_PROOF_SECRET nor PROTECTION_CHALLENGE_SECRET_KEY is set, so nothing checks for bots' }
  }
  if (!proof && onTestSiteKey(context)) {
    return { state: 'test', reason: 'the challenge runs on the provider\'s test keys, which answer the same for everyone' }
  }
  return { state: 'live', reason: takes }
}

/**
 * Monitoring, failing findings aside: live once a DSN reports for the
 * backend (`MONITORING_DSN` on the deployment) or for the app (the SDK
 * wired with a DSN, which the caller tells in `app.monitoring`: a DSN in
 * the env with no SDK to report through counts for nothing). Without one
 * the dev server's local error log stands in on a dev deployment; anywhere
 * else errors go unreported, and the capability is missing.
 */
export function monitoringMode(context: CapabilityContext): CapabilityDetection {
  const backend = isSet(context, 'MONITORING_DSN')
  const app = context.app?.monitoring === true
  if (backend && app) return { state: 'live', reason: 'the app and the backend report errors' }
  if (app) return { state: 'live', reason: `the app reports errors; the backend does not: ${unsetReason(context, ['MONITORING_DSN'])}` }
  if (backend) return { state: 'live', reason: context.prod ? 'the backend reports errors' : 'the backend reports errors; the app does not: no error-reporting SDK is wired with a DSN' }
  if (!context.prod && ['local', 'anonymous', 'cloud-dev'].includes(context.deployment)) {
    return { state: 'test', reason: 'no DSN is set, so errors go to the dev server\'s local error log (DevTools › Monitoring)' }
  }
  return { state: 'missing', reason: `${unsetReason(context, ['MONITORING_DSN'])}, so errors go unreported` }
}

/**
 * Hosting, failing findings aside: where the app is served from. Live on a
 * production (or self-hosted) deployment, whose live site `doctor --prod`
 * probes; test on a preview, or on production run as a demo or staging app
 * (`BACKEND_ENVIRONMENT=sandbox`); missing anywhere else, where the dev
 * server serves the app and no production deployment is in view.
 */
export function hostingMode(context: CapabilityContext): CapabilityDetection {
  const { deployment } = context
  if (deployment === 'preview') return { state: 'test', reason: 'a preview deployment serves the app' }
  if (deployment !== 'production' && deployment !== 'self-hosted') return { state: 'missing', reason: 'no production deployment yet' }
  if (environmentOf(context) === 'sandbox') return { state: 'test', reason: 'BACKEND_ENVIRONMENT is sandbox: a demo or staging app on the providers\' test modes' }
  return { state: 'live', reason: `the ${DEPLOYMENT_KIND_LABEL[deployment]} serves the app` }
}
