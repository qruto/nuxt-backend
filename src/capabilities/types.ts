import type { DevtoolsDeploymentKind, DevtoolsPanelId } from '../devtools/rpc-types.js'
import type { BackendEnvName } from '../env-registry.js'
import type { FindingGroup, PreflightFinding } from '../findings/types.js'

/**
 * The app capabilities: the package's services composed into parts with neutral
 * names, each one what an app gets (auth, data, billing…) rather than the
 * service underneath. `doctor --only`, `nuxt-backend status`, the DevTools
 * Overview, the `.env.example` groups and the docs' Capabilities page all read
 * them from one registry (src/capabilities/registry.ts).
 *
 * Adding a capability is how a later feature joins the app: its name
 * goes here, its entry into `CAPABILITIES` with every field of
 * {@link CapabilityDefinition} filled, and test/unit/capabilities.test.ts fails until
 * the entry is complete — its env names, findings, docs home, DevTools panel,
 * playground pages all exist, and no other capability claims them.
 */
export type CapabilityName = 'auth' | 'data' | 'jobs' | 'billing' | 'email' | 'notifications' | 'ai' | 'protection' | 'monitoring' | 'flags' | 'analytics' | 'hosting'

/**
 * What a capability is doing right now. Detected from the env and doctor's
 * probes, never configured: there is no option that turns a capability off.
 *
 * - `live`: the real service is configured, and the capability acts for real;
 * - `test`: the capability runs in its service's test mode, never on a simulator:
 *   a dev deployment, the email provider's test mode, the billing sandbox;
 * - `missing`: what it needs is not configured, so it degrades the way its
 *   env names describe;
 * - `failing`: a check of the capability failed, whatever else holds.
 */
export type CapabilityState = 'live' | 'test' | 'missing' | 'failing'

/** Every state, in the order a console lists them. */
export const CAPABILITY_STATES = ['live', 'test', 'missing', 'failing'] as const satisfies readonly CapabilityState[]

/**
 * What each state means, and the light a console shows for it: the
 * terminal's `status`, the DevTools channels and the docs' state tables all
 * say it in these words.
 */
export const CAPABILITY_STATE_MEANING = {
  live: { light: 'green', means: 'The real service is configured, and the capability acts for real.' },
  test: { light: 'amber', means: 'The capability runs in its service\'s test mode: a dev deployment, the email provider\'s test mode or the billing sandbox.' },
  missing: { light: 'grey', means: 'What it needs is not configured, so it degrades the way its env names describe.' },
  failing: { light: 'red', means: 'A check of the capability failed, whatever else holds.' },
} as const satisfies Record<CapabilityState, { light: string, means: string }>

/** A service a capability is built on. Brand names belong here, in prose, and never in an API name. */
export interface CapabilityProvider {
  /** The service, as its makers write it: `Better Auth`. */
  name: string
  /** What it gives the capability, lower case: `sessions, sign-in codes and passkeys`. */
  gives: string
}

/** What the deployment the app talks to is, as `CONVEX_DEPLOYMENT` (or `CONVEX_SELF_HOSTED_URL`) names it. */
export type CapabilityDeployment = DevtoolsDeploymentKind

/**
 * The env name whose value picks every provider's mode, and not only whether
 * a capability runs. Unset, each provider keeps its safe mode: test mode, the
 * sandbox.
 */
export const CAPABILITY_SWITCHES = ['BACKEND_ENVIRONMENT'] as const satisfies readonly BackendEnvName[]

export type CapabilitySwitch = (typeof CAPABILITY_SWITCHES)[number]

/**
 * What detection reads. Values are read for presence and for the switch
 * that picks every provider's mode ({@link CapabilitySwitch}); no value leaves
 * detection.
 *
 * The backend reads its env on the deployment, so once the deployment's
 * names are read they decide: a key in `.env.local` that was never pushed
 * leaves its capability missing. Until then, the env visible here stands in.
 */
export interface CapabilityContext {
  /** The env visible here: `.env`, `.env.local` and the process env. */
  env: Readonly<Record<string, string | undefined>>
  /** Every env name set on the deployment, as its listing reads; `null` when it was not read. */
  deployed: ReadonlySet<string> | null
  /**
   * Names known to be on the deployment while its listing is not read: the
   * ones a clean `env push` provisioned there.
   */
  provisioned?: ReadonlySet<string>
  /**
   * The switches' values as read off the deployment (`convex env get`),
   * for the ones set there: `BACKEND_ENVIRONMENT` as `development`,
   * `preview`, `sandbox` or `production`. A switch set on the deployment
   * and not read here takes the value visible here, and the safe mode (test
   * mode, the sandbox) when none is.
   */
  switches?: Partial<Record<CapabilitySwitch, string>>
  /** The deployment the app talks to. */
  deployment: CapabilityDeployment
  /** The findings doctor (or the dev-server preflight) reported, every capability's. */
  findings: readonly PreflightFinding[]
  /**
   * Production posture (`--prod`): the env visible here is not
   * production's, so an env name counts as set only on the deployment, and
   * none does when its names could not be read.
   */
  prod?: boolean
  /**
   * What the Nuxt app says of itself: `monitoring`, whether it reports
   * errors (the error-reporting SDK installed and wired with a DSN). The
   * backend's health route reads it off the app's request; `status` and
   * DevTools from the app's root. Absent, the app reports nothing.
   */
  app?: { monitoring?: boolean }
}

/** A capability's state, and why, in a clause: `the provider's test mode`. */
export interface CapabilityDetection {
  state: CapabilityState
  reason: string
}

/**
 * One capability: the extension contract every capability keeps. Each field is read by
 * something: the console, the docs, the DevTools panel or the tests.
 */
export interface CapabilityDefinition {
  /** Its label: `Auth`. */
  title: string
  /** What it gives the app, in one line. */
  purpose: string
  /** What it is built on. */
  providers: readonly CapabilityProvider[]
  /** What it runs on in development, in prose: `the provider's sandbox`. */
  development: string
  /** The env names it owns (src/env-registry.ts): each name belongs to one capability. */
  env: readonly BackendEnvName[]
  /** The finding groups it owns (src/findings/): each group, and so each finding, belongs to one capability. */
  findings: readonly FindingGroup[]
  /** The title of its group in `.env.example`, when it differs from `title` (the data capability's is `Backend`). */
  dotenvTitle?: string
  /** Where its docs start: `/docs/build/auth`. */
  docs: string
  /** The DevTools panel tab that shows it. */
  devtools: DevtoolsPanelId
  /** The playground pages that try it on the docs site: Panels, the tutorial's app, and the module's pages beside it. */
  playground: readonly string[]
  /** Its state, from the env and doctor's probes. */
  detect(context: CapabilityContext): CapabilityDetection
}

/** A finding, as a capability's status names its most pressing one. */
export type CapabilityFinding = Pick<PreflightFinding, 'id' | 'status' | 'title' | 'message' | 'fixHint' | 'docsUrl'>

/**
 * One capability as `nuxt-backend status` reports it, and the DevTools Overview
 * shows it: detected state, providers, unset env and its most pressing
 * finding.
 */
export interface CapabilityStatus {
  name: CapabilityName
  title: string
  state: CapabilityState
  /** Why it is in that state, in a clause. */
  reason: string
  /** The names of the services it is built on. */
  providers: string[]
  /**
   * Its env names not set where the backend reads them: the derived, dev-only
   * and tooling ones aside, and outside production the mode switches.
   */
  missingEnv: string[]
  /** How its findings came out. */
  findings: { pass: number, warn: number, fail: number }
  /** Its first failing finding, else its first warning; `null` when every check passes. */
  top: CapabilityFinding | null
  /** Where its docs start, on the docs site. */
  docsUrl: string
  /** The DevTools panel tab that shows it. */
  devtools: DevtoolsPanelId
}
