/**
 * The homepage console: what each detent of the dial runs and what the LCD
 * prints, as `npx nuxt-backend doctor --only <layer>` prints it for a
 * configured app (src/cli/main.ts): every line, in the order the doctor
 * reports them. test/docs/homepage.test.ts runs the doctor against such an
 * app (a dev deployment with the env set, its routes mounted, a billing
 * catalog and a readable provider) and holds each detent's lines, their
 * order and its summary to what it reports.
 */

/** One finding line: `✓ Title: message`, with the fix hint under a warning. */
export interface ConsoleLine {
  id: string
  status: 'pass' | 'warn' | 'fail'
  title: string
  message: string
  fixHint?: string
}

/** One position of the dial. */
export interface ConsoleDetent {
  /** The app layer it checks: the name `doctor --only` takes. */
  layer: string
  label: string
  /** Where the docs of that layer start. */
  docs: string
  lines: ConsoleLine[]
}

export const CONSOLE_DETENTS: ConsoleDetent[] = [
  {
    layer: 'auth',
    label: 'Auth',
    docs: '/docs/build/auth',
    lines: [
      { id: 'auth-secret', status: 'pass', title: 'Auth secret', message: 'AUTH_SECRET is set on the deployment (its value is not visible here).' },
      { id: 'site-url', status: 'pass', title: 'App site URL', message: 'SITE_URL is set on the deployment (its value is not visible here).' },
      { id: 'deployment-auth-secret', status: 'pass', title: 'Deployment AUTH_SECRET', message: 'AUTH_SECRET is set on the deployment.' },
      { id: 'deployment-site-url', status: 'pass', title: 'Deployment SITE_URL', message: 'SITE_URL is set on the deployment.' },
      { id: 'page-paths', status: 'pass', title: 'Page paths', message: 'The deployment serves on and links to the paths nuxt.config declares.' },
    ],
  },
  {
    layer: 'billing',
    label: 'Billing',
    docs: '/docs/build/billing',
    lines: [
      { id: 'billing-access', status: 'pass', title: 'Billing access', message: 'BILLING_ACCESS_TOKEN visible — billing is on.' },
      { id: 'billing-webhook-secret', status: 'pass', title: 'Billing webhooks', message: 'BILLING_WEBHOOK_SECRET set on the deployment — billing events verify.' },
      { id: 'deployment-billing-access-token', status: 'pass', title: 'Deployment BILLING_ACCESS_TOKEN', message: 'BILLING_ACCESS_TOKEN is set on the deployment.' },
      { id: 'deployment-billing-webhook-secret', status: 'pass', title: 'Deployment BILLING_WEBHOOK_SECRET', message: 'BILLING_WEBHOOK_SECRET is set on the deployment.' },
      { id: 'billing-webhook-route', status: 'pass', title: 'Billing webhook route', message: '/billing/events is mounted (the unsigned probe was rejected, as expected).' },
      { id: 'billing-multiple-subscriptions', status: 'pass', title: 'Multiple subscriptions', message: 'A customer holds one subscription at a time.' },
      { id: 'billing-proration', status: 'warn', title: 'Plan change proration', message: 'Plan changes are settled as \'next_period\' — an upgrade grants the new plan\'s credits and features immediately but is not charged until the next cycle.', fixHint: 'Set the organization\'s proration behaviour to `invoice` or `prorate` if an upgrade should be charged when it happens.' },
      { id: 'billing-benefit-grace', status: 'pass', title: 'Benefit revocation', message: 'Benefits are revoked as soon as a subscription ends.' },
      { id: 'billing-trial-abuse', status: 'pass', title: 'Trial abuse prevention', message: 'No plan declares a trial.' },
      { id: 'billing-portal', status: 'pass', title: 'Customer portal', message: 'The customer portal offers plan changes (pause: off).' },
      { id: 'billing-customer-emails', status: 'pass', title: 'Customer emails', message: 'The provider\'s customer emails for a confirmed order, a renewal, a failed payment and a cancelled or ended subscription, and its renewal and trial reminders, are on.' },
      { id: 'billing-team-customers', status: 'pass', title: 'Team customers', message: 'Workspaces bill as team customers; the token reads customer members (it also needs members:write and customer_sessions:write, which a read can\'t check).' },
    ],
  },
  {
    layer: 'email',
    label: 'Email',
    docs: '/docs/build/email',
    lines: [
      { id: 'email-transport', status: 'pass', title: 'Email transport', message: 'EMAIL_API_KEY set on the deployment — transactional email is on.' },
      { id: 'email-webhook-secret', status: 'pass', title: 'Email webhooks', message: 'EMAIL_WEBHOOK_SECRET set on the deployment — delivery events verify.' },
      { id: 'deployment-email-api-key', status: 'pass', title: 'Deployment EMAIL_API_KEY', message: 'EMAIL_API_KEY is set on the deployment.' },
      { id: 'deployment-email-from', status: 'pass', title: 'Deployment EMAIL_FROM', message: 'EMAIL_FROM is set on the deployment.' },
      { id: 'deployment-email-webhook-secret', status: 'pass', title: 'Deployment EMAIL_WEBHOOK_SECRET', message: 'EMAIL_WEBHOOK_SECRET is set on the deployment.' },
      { id: 'email-webhook-route', status: 'pass', title: 'Email webhook route', message: '/email/events is mounted (the unsigned probe was rejected, as expected).' },
    ],
  },
  {
    layer: 'ai',
    label: 'AI',
    docs: '/docs/build/ai',
    lines: [
      { id: 'deployment-ai-gateway-api-key', status: 'pass', title: 'Deployment AI_GATEWAY_API_KEY', message: 'AI_GATEWAY_API_KEY is not set, and no backend file names a provider/model id that needs a model route.' },
      { id: 'deployment-provenance-private-key', status: 'pass', title: 'Deployment PROVENANCE_PRIVATE_KEY', message: 'PROVENANCE_PRIVATE_KEY is not needed: no backend file turns provenance on.' },
      { id: 'deployment-provenance-certificate', status: 'pass', title: 'Deployment PROVENANCE_CERTIFICATE', message: 'PROVENANCE_CERTIFICATE is not needed: no backend file turns provenance on.' },
      { id: 'ai-components', status: 'pass', title: 'Chat and knowledge components', message: 'No backend file declares a chat or a knowledge store.' },
    ],
  },
  {
    layer: 'protection',
    label: 'Protection',
    docs: '/docs/build/auth/sign-in/bots',
    lines: [
      { id: 'bot-protection', status: 'pass', title: 'Bot protection', message: 'No bot check on this development deployment; production needs one (doctor --prod says so).' },
      { id: 'deployment-protection-proof-secret', status: 'pass', title: 'Deployment PROTECTION_PROOF_SECRET', message: 'PROTECTION_PROOF_SECRET is not set: the deployment takes no proof.' },
      { id: 'deployment-protection-challenge-secret-key', status: 'pass', title: 'Deployment PROTECTION_CHALLENGE_SECRET_KEY', message: 'PROTECTION_CHALLENGE_SECRET_KEY is not set: the deployment takes no challenge answer.' },
    ],
  },
  {
    layer: 'monitoring',
    label: 'Monitoring',
    docs: '/docs/ship/operate/monitoring',
    lines: [
      { id: 'deployment-monitoring-dsn', status: 'pass', title: 'Deployment MONITORING_DSN', message: 'MONITORING_DSN is not set on this dev deployment: the backend reports nothing, and the dev server\'s local error log stands in.' },
      { id: 'monitoring-app', status: 'pass', title: 'App error reports', message: 'No DSN is set for the app: in dev, errors go to the dev server\'s local error log (DevTools › Monitoring).' },
    ],
  },
]

/** The command a detent runs. */
export const consoleCommand = (detent: ConsoleDetent) => `npx nuxt-backend doctor --only ${detent.layer}`

/** The line under the findings, as the CLI prints it (formatPreflightSummary). */
export function consoleSummary(lines: readonly ConsoleLine[]): string {
  const problems = lines.filter(line => line.status !== 'pass')
  if (lines.length === 0) return 'no checks ran'
  if (problems.length === 0) return `${lines.length} check${lines.length === 1 ? '' : 's'} ✓`
  return `${problems.length} finding${problems.length === 1 ? '' : 's'}: ${problems.map(line => line.id).join(', ')}`
}

/** How the CLI marks a finding's line. */
export const CONSOLE_GLYPH = { pass: '✓', warn: '⚠', fail: '✗' } as const

/**
 * What the terminal shows under the command, line by line, as the CLI
 * prints it: each finding, its fix indented under a warning, a blank line
 * and the summary.
 */
export function consoleTranscript(detent: ConsoleDetent): string[] {
  return [
    ...detent.lines.flatMap(line => [
      `${CONSOLE_GLYPH[line.status]} ${line.title}: ${line.message}`,
      ...(line.fixHint ? [`    ↳ ${line.fixHint}`] : []),
    ]),
    '',
    consoleSummary(detent.lines),
  ]
}

/**
 * The rows of a transcript typed up to `typed` characters, each split into
 * what shows and the rest. The console keeps the rest in place, invisible,
 * so typing only repaints: the LCD keeps its size and nothing around it
 * moves.
 */
export function typedRows(texts: readonly string[], typed: number): Array<{ shown: string, rest: string }> {
  let left = typed
  return texts.map((text) => {
    const shown = text.slice(0, Math.max(0, left))
    left -= text.length
    return { shown, rest: text.slice(shown.length) }
  })
}

/** How many rows a phone shows above the summary until the reader asks for all of them. */
export const CONSOLE_PHONE_ROWS = 6

/**
 * Whether a phone folds row `index` of a transcript of `count` rows away
 * while the LCD is folded: every row past the first six but the last, the
 * summary, which always shows. A transcript that fits has nothing to fold.
 */
export function foldsOnPhone(index: number, count: number): boolean {
  return index >= CONSOLE_PHONE_ROWS && index < count - 1
}

/** The install line the hero and the closing show: the Quickstart's first command. */
export const INSTALL_COMMAND = 'npx nuxt module add nuxt-backend'
