/**
 * Every environment variable this package reads or writes, once: where it is
 * read, whether a deploy needs it, what degrades without it, the findings
 * that report it, and its group in `.env.example`.
 *
 * The deployment's contract (`backendEnv` in `src/convex/app.ts`) keeps its
 * own literal validators so its types stay exact; test/unit/env-registry.test.ts
 * holds it, `ENV_EXAMPLE` and the findings to this list. The preflight, `env
 * push` and the DevTools panel read their lists from here.
 *
 * The platform's own names (`CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL`, …) are not
 * here: the platform CLI and runtime own them.
 */

export interface BackendEnvEntry {
  /**
   * Where the value is read: `deployment` on the Convex deployment (`npx
   * nuxt-backend env push` sets it), `app` in the Nuxt app's own env.
   */
  side: 'deployment' | 'app'
  /** A deploy fails without it. */
  required?: true
  /** Only ever set on a dev deployment: `env push` never forwards it elsewhere. */
  devOnly?: true
  /**
   * Set by the package's own dev tooling, not declared in `backendEnv`
   * (`NUXT_BACKEND_LOG_OTP`).
   */
  tooling?: true
  /** What happens without it. */
  without: string
  /** The `.env.example` group it is listed under, or `null` when it isn't listed. */
  example: 'Backend' | 'Email' | 'Billing' | 'Dev only' | null
  /** The finding ids that report it. */
  findings: readonly string[]
}

export const BACKEND_ENV = {
  AUTH_SECRET: {
    side: 'deployment',
    required: true,
    without: 'a deploy fails: it signs sessions and encrypts the keys agent tokens are signed with',
    example: null,
    findings: ['auth-secret', 'deployment-auth-secret'],
  },
  SITE_URL: {
    side: 'deployment',
    required: true,
    without: 'a deploy fails: auth trusts it as the app origin, and invitation and gift emails link to it',
    example: null,
    findings: ['site-url', 'deployment-site-url'],
  },
  AUTH_TRUST_LOCAL_ORIGINS: {
    side: 'deployment',
    devOnly: true,
    without: 'only SITE_URL is trusted as a browser origin (dev-only: set to "1" on a dev deployment to also trust http://localhost:* and http://127.0.0.1:*)',
    example: 'Dev only',
    findings: ['deployment-auth-trust-local-origins'],
  },
  EMAIL_API_KEY: {
    side: 'deployment',
    without: 'email sends no-op and OTP sign-in throws (NUXT_BACKEND_LOG_OTP=1 echoes codes to the convex dev console)',
    example: 'Email',
    findings: ['email-transport', 'deployment-email-api-key'],
  },
  EMAIL_FROM: {
    side: 'deployment',
    without: 'the provider onboarding sender is used',
    example: 'Email',
    findings: ['deployment-email-from'],
  },
  EMAIL_TEST_MODE: {
    side: 'deployment',
    without: 'test mode stays ON (set to "false" to deliver for real)',
    example: 'Email',
    findings: ['deployment-email-test-mode'],
  },
  EMAIL_WEBHOOK_SECRET: {
    side: 'deployment',
    without: 'delivery events are rejected — useEmailStatus stays at "sent"',
    example: 'Email',
    findings: ['email-webhook-secret', 'deployment-email-webhook-secret', 'email-webhook-route'],
  },
  BILLING_ACCESS_TOKEN: {
    side: 'deployment',
    without: 'billing queries return empty and checkout actions fail on invocation',
    example: 'Billing',
    findings: ['billing-access', 'deployment-billing-access-token', 'billing-organization'],
  },
  BILLING_WEBHOOK_SECRET: {
    side: 'deployment',
    without: 'billing events are rejected — entitlements refresh only on demand (syncEntitlements)',
    example: 'Billing',
    findings: ['billing-webhook-secret', 'deployment-billing-webhook-secret', 'billing-webhook-route'],
  },
  BILLING_ENVIRONMENT: {
    side: 'deployment',
    without: 'the sandbox billing environment is used',
    example: 'Billing',
    findings: ['deployment-billing-environment'],
  },
  NUXT_BACKEND_LOG_OTP: {
    side: 'deployment',
    devOnly: true,
    tooling: true,
    without: 'with no email transport, OTP sign-in throws instead of printing the code in the convex dev console (dev deployments get it from `env push`)',
    example: null,
    findings: [],
  },
  NUXT_PUBLIC_BACKEND_URL: {
    side: 'app',
    without: 'derived from the deployment the platform CLI names in .env.local; set it to point at another deployment',
    example: 'Backend',
    findings: [],
  },
  NUXT_PUBLIC_BACKEND_SITE_URL: {
    side: 'app',
    without: 'derived from the backend URL; with neither, the /api/auth proxy has no target',
    example: 'Backend',
    findings: ['backend-site-url'],
  },
} as const satisfies Record<string, BackendEnvEntry>

export type BackendEnvName = keyof typeof BACKEND_ENV

type Entry<N extends BackendEnvName> = (typeof BACKEND_ENV)[N]

/** The deployment's contract: the names `backendEnv` declares. */
type ContractName = { [N in BackendEnvName]: Entry<N> extends { side: 'deployment' } ? Entry<N> extends { tooling: true } ? never : N : never }[BackendEnvName]

type RequiredName = { [N in ContractName]: Entry<N> extends { required: true } ? N : never }[ContractName]

type OptionalName = Exclude<ContractName, RequiredName>

const names = Object.keys(BACKEND_ENV) as BackendEnvName[]
const entry = (name: BackendEnvName): BackendEnvEntry => BACKEND_ENV[name]

/** The names `backendEnv` declares, in registry order. */
export const CONTRACT_ENV_NAMES = names.filter(name => entry(name).side === 'deployment' && !entry(name).tooling) as ContractName[]

/** Deployment env that must exist before a deploy succeeds. */
export const REQUIRED_DEPLOYMENT_ENV = CONTRACT_ENV_NAMES.filter(name => entry(name).required) as RequiredName[]

/**
 * The optional contract tier, with the designed degradation each one's
 * absence causes: the wording the preflight, doctor and `env push` share.
 */
export const OPTIONAL_DEPLOYMENT_ENV = Object.fromEntries(
  CONTRACT_ENV_NAMES.filter(name => !entry(name).required).map(name => [name, entry(name).without]),
) as Record<OptionalName, string>

/**
 * The optional names that only make sense on a dev-class deployment: `env
 * push` never forwards them to a non-dev deployment, and `doctor` treats their
 * absence there as the healthy state (presence as a warning).
 */
export const DEV_ONLY_DEPLOYMENT_ENV: ReadonlySet<string> = new Set(CONTRACT_ENV_NAMES.filter(name => entry(name).devOnly))
