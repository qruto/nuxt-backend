import { billingMode, emailMode, failingFinding, hostingMode, isSet, modelMode, monitoringMode, notificationsMode, onDeployment, protectionMode, unsetReason } from './detect.js'
import type { CapabilityDefinition, CapabilityName } from './types.js'

/**
 * Every app capability, in the order a console lists them. Each one owns its env
 * names, its finding groups, a docs home, a DevTools panel, playground pages
 * and detects its own state. test/unit/capabilities.test.ts holds each entry
 * complete and each name and group to exactly one capability.
 */
export const CAPABILITIES = {
  auth: {
    title: 'Auth',
    purpose: 'Sign-in by email code and passkey, sessions, workspaces with roles and invitations, the admin console with impersonation, the activity trail, and each account\'s data export and complete erasure.',
    providers: [{ name: 'Better Auth', gives: 'sessions, sign-in codes, passkeys and workspaces' }],
    development: 'sign-in codes print in the dev console, or reach the email provider\'s test addresses, which the dev inbox reads back',
    env: ['AUTH_SECRET', 'SITE_URL'],
    findings: ['auth'],
    docs: '/docs/build/auth',
    devtools: 'account',
    playground: ['/playground/strips', '/playground/welcome', '/playground/profile', '/playground/security', '/playground/settings', '/playground/admin'],
    detect(context) {
      const failing = failingFinding(context, 'auth')
      if (failing) return failing
      const unset = ['AUTH_SECRET', 'SITE_URL'].filter(name => !isSet(context, name))
      if (unset.length > 0) return { state: 'missing', reason: unsetReason(context, unset) }
      // Sign-in codes go out by email: without live email they print in the
      // dev console, or reach the email provider's test addresses.
      return emailMode(context).state === 'live'
        ? { state: 'live', reason: 'sign-in codes reach real inboxes' }
        : { state: 'test', reason: 'sign-in codes print in the dev console, or reach the email provider\'s test addresses' }
    },
  },
  data: {
    title: 'Data',
    purpose: 'The database with realtime queries, server rendering, full-text search, aggregates, counters and file storage.',
    providers: [{ name: 'Convex', gives: 'the database, realtime queries, search and file storage' }],
    development: 'a dev deployment of your own, or a local one on this machine',
    env: ['NUXT_PUBLIC_BACKEND_URL', 'BACKEND_ENVIRONMENT'],
    dotenvTitle: 'Backend',
    findings: ['deployment', 'scaffold'],
    docs: '/docs/build/data',
    devtools: 'overview',
    playground: ['/playground/strips', '/playground'],
    detect: context => failingFinding(context, 'data') ?? onDeployment(context),
  },
  jobs: {
    title: 'Jobs',
    purpose: 'Scheduled jobs, durable workflows, queued work, cached action results, migrations and the backend\'s own hourly maintenance.',
    providers: [{ name: 'Convex', gives: 'the scheduler, and the crons, workflow, workpool, action cache and migrations components' }],
    development: 'the dev deployment\'s scheduler',
    env: [],
    findings: [],
    docs: '/docs/build/data/jobs',
    devtools: 'overview',
    playground: ['/playground/strips', '/playground/admin/demo'],
    detect: context => failingFinding(context, 'jobs') ?? onDeployment(context),
  },
  billing: {
    title: 'Billing',
    purpose: 'Plans with monthly and yearly prices, prepaid credits, a server-rendered pricing page, feature gates, gifts and the customer portal, from a catalog in code.',
    providers: [{ name: 'Polar', gives: 'products, checkout, subscriptions, meters and the customer portal' }],
    development: 'the billing provider\'s sandbox, with a test card',
    env: ['BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET'],
    findings: ['billing'],
    docs: '/docs/build/billing',
    devtools: 'billing',
    playground: ['/playground/pricing', '/playground/settings', '/playground/gifts'],
    detect: context => failingFinding(context, 'billing') ?? billingMode(context),
  },
  email: {
    title: 'Email',
    purpose: 'Transactional and marketing mail from one template registry, with delivery tracking and the dev inbox.',
    providers: [{ name: 'Resend', gives: 'sending, delivery events, contacts and topics' }],
    development: 'the provider\'s test mode: its test addresses accept mail and send real delivery events, and the dev inbox reads what was sent back',
    env: ['EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_MARKETING_FROM', 'EMAIL_REGION', 'EMAIL_WEBHOOK_SECRET', 'EMAIL_DEV_INBOX'],
    findings: ['email'],
    docs: '/docs/build/email',
    devtools: 'email',
    playground: ['/playground/notifications', '/playground/settings'],
    detect: context => failingFinding(context, 'email') ?? emailMode(context),
  },
  notifications: {
    title: 'Notifications',
    purpose: 'An in-app inbox for every event the backend records about a person and for events of your own, live and in each person\'s language, with the unread count and marking read; the kinds that allow it by email, and as web push to each device a person allowed, under their channel choices.',
    providers: [{ name: 'Web Push', gives: 'notifications on a phone or a desktop with the app closed, through the browsers\' own push services, signed and encrypted inside the deployment; no account' }],
    development: 'the same code on your dev deployment: events recorded there reach the inbox at once, and a push reaches a browser that subscribed on the dev app',
    env: ['PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY'],
    findings: ['notifications'],
    docs: '/docs/build/email/notifications',
    devtools: 'account',
    playground: ['/playground/notifications'],
    detect: context => notificationsMode(context),
  },
  ai: {
    title: 'AI',
    purpose: 'Metered model calls and streams: each call reserves prepaid credits, runs the model by its provider/model id, then settles at the cost it reports.',
    providers: [
      { name: 'AI SDK', gives: 'model calls and streams, by provider/model id' },
      { name: 'Vercel AI Gateway', gives: 'one key for every provider\'s models, and the cost of each call' },
      { name: 'Convex persistent text streaming', gives: 'streams that persist server-side and resume after a reload' },
      { name: 'Polar', gives: 'the credit meters each call spends' },
    ],
    development: 'the models themselves, through the Convex AI Gateway or a Vercel AI Gateway key, and credits from the billing sandbox',
    env: ['AI_GATEWAY_API_KEY', 'PROVENANCE_PRIVATE_KEY', 'PROVENANCE_CERTIFICATE'],
    findings: ['ai'],
    docs: '/docs/build/ai',
    devtools: 'billing',
    playground: ['/playground/strips', '/playground/admin/demo'],
    detect(context) {
      const failing = failingFinding(context, 'ai')
      if (failing) return failing
      // Every call is paid for with credits: the capability is as real as the
      // billing it spends, and the models it calls.
      const billing = billingMode(context)
      if (billing.state === 'missing') return { state: 'missing', reason: `its credits need billing: ${billing.reason}` }
      const models = modelMode(context)
      if (models) return models
      if (billing.state === 'live') return { state: 'live', reason: 'spends credits in the production billing environment' }
      return { state: 'test', reason: 'spends credits in the billing sandbox' }
    },
  },
  protection: {
    title: 'Protection',
    purpose: 'Bot checks on the requests that send a sign-in code or create an account, and on the calls of your own that verifyHuman guards.',
    providers: [
      { name: 'Vercel BotID', gives: 'an invisible bot check on the app\'s server, on Vercel' },
      { name: 'Cloudflare Turnstile', gives: 'a challenge the browser answers wherever the app has a site key, verified through Better Auth\'s captcha plugin' },
    ],
    development: 'test mode: the dev server\'s bot check answers human, and the challenge provider\'s test keys',
    env: ['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY', 'NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY'],
    findings: ['protection'],
    docs: '/docs/build/auth/sign-in/bots',
    devtools: 'overview',
    playground: ['/playground/admin'],
    detect: context => failingFinding(context, 'protection') ?? protectionMode(context),
  },
  monitoring: {
    title: 'Monitoring',
    purpose: 'Error reports from the browser, the Nuxt server and the backend\'s actions, cron check-ins, and a health endpoint for uptime checks.',
    providers: [{ name: 'Sentry', gives: 'error tracking, tracing, cron monitors and uptime checks' }],
    development: 'the dev server\'s local error log, listed in DevTools',
    env: ['MONITORING_DSN'],
    findings: ['monitoring'],
    docs: '/docs/ship/operate/monitoring',
    devtools: 'monitoring',
    playground: ['/playground/admin'],
    detect: context => failingFinding(context, 'monitoring') ?? monitoringMode(context),
  },
  flags: {
    title: 'Flags',
    purpose: 'Feature flags read inside queries and mutations, targeted by account, workspace, plan or a stable percentage, and the kill switches that pause sign-ups, checkout and AI or put up a maintenance banner.',
    providers: [{ name: 'Convex', gives: 'the stored overrides, read in the same transaction as the function that asks' }],
    development: 'nothing: flags are the package\'s own code, the same in dev, tests and production',
    env: [],
    findings: [],
    docs: '/docs/ship/operate/flags',
    devtools: 'overview',
    playground: ['/playground/strips', '/playground/admin'],
    // Always live: nothing to configure, and nothing it waits on but the
    // deployment its overrides are stored on. Without one, each flag is its
    // default from code.
    detect: context => failingFinding(context, 'flags') ?? { state: 'live', reason: 'flags are evaluated in your own functions: their defaults from code, and the overrides stored on the deployment' },
  },
  analytics: {
    title: 'Analytics',
    purpose: 'Revenue metrics in the admin console: recurring revenue, subscriptions and churn with cancellations per reason, checkouts, usage per meter, and costs and margin, read live from the billing provider.',
    providers: [{ name: 'Polar', gives: 'the metrics it computes from its orders, subscriptions, checkouts and meters' }],
    development: 'the billing sandbox\'s metrics, from the purchases made there with a test card',
    env: [],
    findings: ['analytics'],
    docs: '/docs/build/growth/measure',
    devtools: 'billing',
    playground: ['/playground/admin'],
    detect(context) {
      const failing = failingFinding(context, 'analytics')
      if (failing) return failing
      // The metrics are the billing provider's: as real as the billing they read.
      const billing = billingMode(context)
      if (billing.state === 'missing') return { state: 'missing', reason: `its metrics need billing: ${billing.reason}` }
      return billing.state === 'live'
        ? { state: 'live', reason: 'reads the production billing environment\'s metrics' }
        : { state: 'test', reason: 'reads the billing sandbox\'s metrics' }
    },
  },
  hosting: {
    title: 'Hosting',
    purpose: 'The app on its host: one-command production, the app\'s env written into the host, and the live site\'s HTTPS, security headers, backend and docs for agents checked.',
    providers: [{ name: 'Vercel', gives: 'the Nuxt server, previews per branch, the CDN and custom domains, or any host that runs Nuxt' }],
    development: 'the Nuxt dev server',
    env: [],
    findings: ['site'],
    docs: '/docs/ship/deploy',
    devtools: 'overview',
    playground: ['/playground'],
    detect: context => failingFinding(context, 'hosting') ?? hostingMode(context),
  },
} as const satisfies Record<CapabilityName, CapabilityDefinition>

/** Every capability's name, in console order. */
export const CAPABILITY_NAMES = Object.keys(CAPABILITIES) as CapabilityName[]
