/**
 * Every environment variable this package reads or writes, once: where it is
 * read, whether a deploy needs it, what degrades without it, the findings
 * that report it, and whether `.env.example` lists it. Each name belongs to
 * one app capability, which lists it (src/capabilities/registry.ts) and groups it in
 * `.env.example`.
 *
 * The deployment's contract (`backendEnv` in `src/convex/app.ts`) keeps its
 * own literal validators so its types stay exact; test/unit/env-registry.test.ts
 * holds it, `ENV_EXAMPLE` and the findings to this list. The preflight, `env
 * push` and the DevTools panel read their lists from here.
 *
 * The platform's own names (`CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL`, …) are not
 * here: the platform CLI and runtime own them. `AI_GATEWAY_API_KEY` is the AI
 * Gateway's own name, read as it is and never renamed: it is listed because
 * the deployment needs it set (`env push` carries it from `.env.local`).
 */

export interface BackendEnvEntry {
  /**
   * Where the value is read: `deployment` on the Convex deployment (`npx
   * nuxt-backend env push` sets it), `app` in the Nuxt app's own env, `both`
   * on the deployment and by the app's server, one value on each side.
   */
  side: 'deployment' | 'app' | 'both'
  /** A deploy fails without it. */
  required?: true
  /**
   * Never forwarded from `.env.local`: `env push` derives it from the
   * deployment's kind (`BACKEND_ENVIRONMENT`), and leaves one already set.
   */
  derived?: true
  /**
   * Needed only once one of its findings says so: an app capability lists it as
   * missing while that finding warns or fails, and never otherwise. The
   * gateway key, which only an app that names a model needs, the bot
   * protection secrets, either of which protects, and the marketing sender
   * and the sending region, which no finding checks yet.
   */
  whenFlagged?: true
  /** What happens without it. */
  without: string
  /** What it takes: the values it accepts, and what each one does. */
  values: string
  /** A value as it is written, where one makes the shape plain. */
  example?: string
  /** The webhook route a secret verifies, when it is one. */
  webhook?: string
  /**
   * Pushed to dev deployments alone: `env push` provisions it there
   * (`example` is the value), never forwards it to a preview or production,
   * and no capability counts it as missing. `.env.example` lists it under
   * Dev only, with its value.
   */
  devOnly?: true
  /** Whether `.env.example` lists it, as `# NAME=`, under its group. */
  dotenv?: true
  /** The finding ids that report it. */
  findings: readonly string[]
}

export const BACKEND_ENV = {
  AUTH_SECRET: {
    side: 'deployment',
    required: true,
    without: 'a deploy fails: it signs sessions and encrypts the keys the session tokens are signed with',
    values: 'a random secret of at least 32 characters (`openssl rand -base64 32` prints one)',
    findings: ['auth-secret', 'deployment-auth-secret', 'env-defaults'],
  },
  SITE_URL: {
    side: 'deployment',
    required: true,
    without: 'a deploy fails: auth trusts it as the app origin, and every emailed link names it',
    values: 'the app\'s http(s) origin, without a path',
    example: 'https://app.example.com',
    findings: ['site-url', 'deployment-site-url', 'env-defaults'],
  },
  BACKEND_ENVIRONMENT: {
    side: 'deployment',
    derived: true,
    without: 'every provider stays in its test mode, nothing local is trusted and no sign-in code is logged; `doctor --prod` fails on production',
    values: '`development`, `preview`, `sandbox` or `production`: the kind of deployment the backend runs on. `env push` derives it from the deployment; `sandbox` is the one value you set by hand',
    example: 'production',
    findings: ['deployment-backend-environment'],
  },
  EMAIL_API_KEY: {
    side: 'deployment',
    without: 'email sends no-op; on `development` the sign-in codes print in the dev console, and elsewhere a code to a real address is refused',
    values: 'the email provider\'s API key',
    dotenv: true,
    findings: ['email-transport', 'deployment-email-api-key'],
  },
  EMAIL_FROM: {
    side: 'deployment',
    without: 'the provider onboarding sender is used',
    values: 'an address on a verified sending domain, alone or as `Name <address>`: the sender of transactional mail',
    example: 'Acme <hello@acme.com>',
    dotenv: true,
    findings: ['deployment-email-from'],
  },
  EMAIL_MARKETING_FROM: {
    side: 'deployment',
    whenFlagged: true,
    without: 'marketing mail goes from EMAIL_FROM',
    values: 'an address on a sending subdomain apart from EMAIL_FROM\'s, alone or as `Name <address>`: the sender of marketing and lifecycle mail',
    example: 'Acme News <news@news.acme.com>',
    dotenv: true,
    findings: [],
  },
  EMAIL_REGION: {
    side: 'deployment',
    whenFlagged: true,
    without: 'the provider\'s default region',
    values: 'the region the sending domain sends from: `us-east-1`, `eu-west-1`, `sa-east-1` or `ap-northeast-1`. Account data stays in the US whatever the region',
    example: 'eu-west-1',
    dotenv: true,
    findings: [],
  },
  EMAIL_WEBHOOK_SECRET: {
    side: 'deployment',
    without: 'delivery events are rejected — useEmailStatus stays at "sent"',
    values: 'the signing secret of the provider\'s webhook endpoint',
    webhook: '/email/events',
    dotenv: true,
    findings: ['email-webhook-secret', 'deployment-email-webhook-secret', 'email-webhook-route'],
  },
  EMAIL_DEV_INBOX: {
    side: 'deployment',
    devOnly: true,
    without: 'the dev inbox\'s page reader (getSandboxInbox, behind useSandboxInbox) answers nothing; the CLI\'s inbox still reads',
    values: '`1` publishes the dev inbox to pages: getSandboxInbox answers on a deployment whose BACKEND_ENVIRONMENT is set and not production. `nuxt-backend dev` sets it on dev deployments and `nuxt-backend deploy --sandbox` on a sandbox (a public demo, whose visitors read their codes off the page); set it by hand on a preview that publishes the inbox, and never on a live production, where `doctor --prod` flags it',
    example: '1',
    dotenv: true,
    findings: ['deployment-email-dev-inbox'],
  },
  BILLING_ACCESS_TOKEN: {
    side: 'deployment',
    without: 'billing queries return empty and checkout actions fail on invocation',
    values: 'an organization access token of the billing provider: a sandbox token outside production, a live one on it',
    dotenv: true,
    findings: ['billing-access', 'deployment-billing-access-token', 'billing-organization'],
  },
  BILLING_WEBHOOK_SECRET: {
    side: 'deployment',
    without: 'billing events are rejected — entitlements refresh only on demand (syncEntitlements)',
    values: 'the signing secret of the provider\'s webhook endpoint (`billing sync` stores it)',
    webhook: '/billing/events',
    dotenv: true,
    findings: ['billing-webhook-secret', 'deployment-billing-webhook-secret', 'billing-webhook-route'],
  },
  AI_GATEWAY_API_KEY: {
    side: 'deployment',
    without: 'a provider/model id the backend names goes through the Convex AI Gateway alone, on Convex Cloud with a paid plan and @convex-dev/ai-sdk-provider installed; anywhere else (a free plan, a self-hosted deployment) it is refused when called',
    values: 'a Vercel AI Gateway API key: the route a provider/model id takes where the Convex AI Gateway does not answer it. Convex runs actions on its own servers, never on Vercel, so the gateway\'s keyless sign-in never reaches them',
    dotenv: true,
    whenFlagged: true,
    findings: ['deployment-ai-gateway-api-key'],
  },
  PROVENANCE_PRIVATE_KEY: {
    side: 'deployment',
    whenFlagged: true,
    without: 'generated images are stored with the IPTC source type and no signed C2PA manifest (`ai.provenance_unsigned`); `doctor --prod` fails once the backend turns provenance on',
    values: 'the PKCS #8 PEM key (`BEGIN PRIVATE KEY`, P-256, P-384 or RSA) that signs the content credentials `ctx.storeImage` writes, its line ends escaped as `\\n` on one line. `env push` generates one with PROVENANCE_CERTIFICATE when neither the deployment nor .env.local has it and the backend turns provenance on',
    findings: ['deployment-provenance-private-key'],
  },
  PROVENANCE_CERTIFICATE: {
    side: 'deployment',
    whenFlagged: true,
    without: 'as without PROVENANCE_PRIVATE_KEY: the two sign together',
    values: 'the PEM certificate chain of PROVENANCE_PRIVATE_KEY, the signer\'s certificate first: one `env push` issues under a root of its own (verifiers show its signer as unknown), or one from a certificate authority on the C2PA trust list for a named signer',
    findings: ['deployment-provenance-certificate'],
  },
  PUSH_PUBLIC_KEY: {
    side: 'deployment',
    without: 'the in-app inbox and email notifications work, but web push does not: `getPushConfig` answers no key, so `usePushSubscription` reads unsupported',
    values: 'the public half of the web push (VAPID) key pair, base64url (an uncompressed P-256 point). Browsers receive it when they subscribe, so it is public. `env push` generates the pair when neither the deployment nor .env.local has it, and `env push --prod` a pair of production\'s own, never copied from .env.local. Never derived from another secret: new keys orphan every subscribed device',
    findings: ['deployment-push-public-key'],
  },
  PUSH_PRIVATE_KEY: {
    side: 'deployment',
    without: 'as without PUSH_PUBLIC_KEY: the two sign together',
    values: 'the private half of the same pair, base64url (the 32-byte P-256 scalar). It stays on the deployment, never in the app\'s public config',
    findings: ['deployment-push-private-key'],
  },
  PROTECTION_PROOF_SECRET: {
    side: 'both',
    whenFlagged: true,
    without: 'the auth routes that send a code take no proof of a bot check: on Vercel, BotID still refuses the bots that come through the app, but not the ones that call the deployment\'s own URL',
    values: 'a random secret of at least 32 characters (`openssl rand -base64 32` prints one), the same value on the deployment and on the app\'s server, and production\'s its own, never .env.local\'s. For an app on Vercel, where BotID signs the proofs: off Vercel nothing signs one, so set it there only beside the challenge keys. The app\'s server reads it from .env.local in development; in production set it in the host\'s env by hand. Never derived from another secret: to rotate it, a comma-separated `new,old` on the deployment passes proofs signed with either',
    dotenv: true,
    findings: ['deployment-protection-proof-secret', 'protection-proof', 'bot-protection'],
  },
  PROTECTION_CHALLENGE_SECRET_KEY: {
    side: 'deployment',
    whenFlagged: true,
    without: 'the deployment verifies no challenge answer, so off Vercel nothing checks for bots',
    values: 'the challenge provider\'s secret key (Cloudflare Turnstile); its documented test keys pass or refuse everyone',
    dotenv: true,
    findings: ['deployment-protection-challenge-secret-key', 'protection-challenge-keys', 'bot-protection'],
  },
  MONITORING_DSN: {
    side: 'deployment',
    without: 'the backend reports nothing: errors in its actions and its cron check-ins go nowhere (the browser and the Nuxt server report on the DSN the app reads, and in dev a local error log stands in)',
    values: 'a DSN of the monitoring service (`https://<key>@<host>/<project id>`). The Nuxt app reads it too. Where the service\'s Vercel integration sets the DSN as `NEXT_PUBLIC_SENTRY_DSN`, the app reads that, and `env push` forwards it as `MONITORING_DSN`, so the integration alone is enough',
    example: 'https://public-key@o0.ingest.sentry.io/0',
    dotenv: true,
    findings: ['deployment-monitoring-dsn', 'monitoring-app'],
  },
  NUXT_PUBLIC_BACKEND_URL: {
    side: 'app',
    without: 'derived from the deployment the platform CLI names in .env.local; set it to point at another deployment',
    values: 'the deployment\'s URL',
    example: 'https://happy-otter-123.convex.cloud',
    dotenv: true,
    findings: ['backend-site-url'],
  },
  NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: {
    side: 'app',
    without: 'no challenge widget renders, so the deployment\'s PROTECTION_CHALLENGE_SECRET_KEY refuses every code request that carries no proof',
    values: 'the challenge provider\'s site key (Cloudflare Turnstile), public. Its documented test keys (`1x00000000000000000000AA` always passes) are test mode',
    example: '1x00000000000000000000AA',
    dotenv: true,
    findings: ['protection-challenge-keys'],
  },
} as const satisfies Record<string, BackendEnvEntry>

export type BackendEnvName = keyof typeof BACKEND_ENV

type Entry<N extends BackendEnvName> = (typeof BACKEND_ENV)[N]

/** The deployment's contract: the names `backendEnv` declares. */
type ContractName = { [N in BackendEnvName]: Entry<N> extends { side: 'deployment' | 'both' } ? N : never }[BackendEnvName]

type RequiredName = { [N in ContractName]: Entry<N> extends { required: true } ? N : never }[ContractName]

type OptionalName = Exclude<ContractName, RequiredName>

const names = Object.keys(BACKEND_ENV) as BackendEnvName[]
const entry = (name: BackendEnvName): BackendEnvEntry => BACKEND_ENV[name]

/** The names `backendEnv` declares, in registry order. */
export const CONTRACT_ENV_NAMES = names.filter(name => entry(name).side !== 'app') as ContractName[]

/** Deployment env that must exist before a deploy succeeds. */
export const REQUIRED_DEPLOYMENT_ENV = CONTRACT_ENV_NAMES.filter(name => entry(name).required) as RequiredName[]

/**
 * The optional contract tier, with the designed degradation each one's
 * absence causes: the wording the preflight, doctor and `env push` share.
 */
export const OPTIONAL_DEPLOYMENT_ENV = Object.fromEntries(
  CONTRACT_ENV_NAMES.filter(name => !entry(name).required).map(name => [name, entry(name).without]),
) as Record<OptionalName, string>

/** The contract names `env push` sets on dev deployments alone, each with its value. */
export const DEV_ONLY_DEPLOYMENT_ENV: Readonly<Record<string, string>> = Object.fromEntries(
  CONTRACT_ENV_NAMES.flatMap((name) => {
    const listed = entry(name)
    return listed.devOnly && listed.example ? [[name, listed.example]] : []
  }),
)

/** The contract names `env push` derives from the deployment's kind, never from `.env.local`. */
export const DERIVED_DEPLOYMENT_ENV: ReadonlySet<string> = new Set(CONTRACT_ENV_NAMES.filter(name => entry(name).derived))

/**
 * The variables `0.2.0` removes, each with what replaced it. `env push` never
 * forwards one (none is in the contract), and `doctor` names any still set on
 * a deployment (`deployment-removed-env`). The Environment variables page,
 * the Upgrade page and the rename map carry the same list.
 */
export const REMOVED_ENV = {
  EMAIL_TEST_MODE: 'BACKEND_ENVIRONMENT: test mode everywhere but production',
  BILLING_ENVIRONMENT: 'BACKEND_ENVIRONMENT: Polar\'s sandbox everywhere but production',
  MONITORING_ENVIRONMENT: 'BACKEND_ENVIRONMENT, which names the monitoring environment',
  AUTH_TRUST_LOCAL_ORIGINS: 'BACKEND_ENVIRONMENT=development, which trusts the local origins',
  NUXT_BACKEND_LOG_OTP: 'BACKEND_ENVIRONMENT=development, which logs the sign-in codes',
  NUXT_PUBLIC_BACKEND_SITE_URL: 'derived from NUXT_PUBLIC_BACKEND_URL; a custom domain sets NUXT_PUBLIC_CONVEX_SITE_URL, the base module\'s own variable',
  BILLING_SIMULATOR_URL: 'nothing: development bills in Polar\'s sandbox',
  NUXT_BACKEND_SIMULATE_MODELS: 'nothing: development calls the same models through the Convex AI Gateway or AI_GATEWAY_API_KEY',
} as const satisfies Record<string, string>

/** The removed names that could still be set on a deployment. */
export const REMOVED_DEPLOYMENT_ENV: readonly string[] = Object.keys(REMOVED_ENV).filter(name => name !== 'NUXT_PUBLIC_BACKEND_SITE_URL')
