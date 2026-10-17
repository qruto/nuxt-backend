/**
 * The homepage console: what each detent of the dial runs and what the LCD
 * prints, as `npx nuxt-backend doctor --only <service>` prints it for a
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
  /** The `doctor --only` service it checks. */
  service: string
  label: string
  /** Where the docs of that service start. */
  docs: string
  lines: ConsoleLine[]
}

export const CONSOLE_DETENTS: ConsoleDetent[] = [
  {
    service: 'auth',
    label: 'Auth',
    docs: '/docs/auth',
    lines: [
      { id: 'auth-secret', status: 'pass', title: 'Auth secret', message: 'AUTH_SECRET is set on the deployment (its value is not visible here).' },
      { id: 'site-url', status: 'pass', title: 'App site URL', message: 'SITE_URL is set on the deployment (its value is not visible here).' },
      { id: 'deployment-auth-secret', status: 'pass', title: 'Deployment AUTH_SECRET', message: 'AUTH_SECRET is set on the deployment.' },
      { id: 'deployment-site-url', status: 'pass', title: 'Deployment SITE_URL', message: 'SITE_URL is set on the deployment.' },
      { id: 'deployment-auth-trust-local-origins', status: 'pass', title: 'Deployment AUTH_TRUST_LOCAL_ORIGINS', message: 'AUTH_TRUST_LOCAL_ORIGINS is set on the dev deployment.' },
    ],
  },
  {
    service: 'workspaces',
    label: 'Workspaces',
    docs: '/docs/auth/workspaces',
    lines: [
      { id: 'invitation-path', status: 'pass', title: 'Invitation route', message: 'Invitation emails and the mounted page agree on /accept-invitation.' },
    ],
  },
  {
    service: 'billing',
    label: 'Billing',
    docs: '/docs/billing',
    lines: [
      { id: 'billing-access', status: 'pass', title: 'Billing access', message: 'BILLING_ACCESS_TOKEN visible — billing is on.' },
      { id: 'billing-webhook-secret', status: 'pass', title: 'Billing webhooks', message: 'BILLING_WEBHOOK_SECRET set on the deployment — billing events verify.' },
      { id: 'deployment-billing-access-token', status: 'pass', title: 'Deployment BILLING_ACCESS_TOKEN', message: 'BILLING_ACCESS_TOKEN is set on the deployment.' },
      { id: 'deployment-billing-webhook-secret', status: 'pass', title: 'Deployment BILLING_WEBHOOK_SECRET', message: 'BILLING_WEBHOOK_SECRET is set on the deployment.' },
      { id: 'deployment-billing-environment', status: 'pass', title: 'Deployment BILLING_ENVIRONMENT', message: 'BILLING_ENVIRONMENT is set on the deployment.' },
      { id: 'billing-webhook-route', status: 'pass', title: 'Billing webhook route', message: '/billing/events is mounted (the unsigned probe was rejected, as expected).' },
      { id: 'billing-multiple-subscriptions', status: 'pass', title: 'Multiple subscriptions', message: 'A customer holds one subscription at a time.' },
      { id: 'billing-proration', status: 'warn', title: 'Plan change proration', message: 'Plan changes are settled as \'next_period\' — an upgrade grants the new plan\'s credits and features immediately but is not charged until the next cycle.', fixHint: 'Set the organization\'s proration behaviour to `invoice` or `prorate` if an upgrade should be charged when it happens.' },
      { id: 'billing-benefit-grace', status: 'pass', title: 'Benefit revocation', message: 'Benefits are revoked as soon as a subscription ends.' },
      { id: 'billing-trial-abuse', status: 'pass', title: 'Trial abuse prevention', message: 'No plan declares a trial.' },
      { id: 'billing-portal', status: 'pass', title: 'Customer portal', message: 'The customer portal offers plan changes (pause: off).' },
    ],
  },
  {
    service: 'email',
    label: 'Email',
    docs: '/docs/email',
    lines: [
      { id: 'email-transport', status: 'pass', title: 'Email transport', message: 'EMAIL_API_KEY set on the deployment — transactional email is on.' },
      { id: 'email-webhook-secret', status: 'pass', title: 'Email webhooks', message: 'EMAIL_WEBHOOK_SECRET set on the deployment — delivery events verify.' },
      { id: 'deployment-email-api-key', status: 'pass', title: 'Deployment EMAIL_API_KEY', message: 'EMAIL_API_KEY is set on the deployment.' },
      { id: 'deployment-email-from', status: 'pass', title: 'Deployment EMAIL_FROM', message: 'EMAIL_FROM is set on the deployment.' },
      { id: 'deployment-email-test-mode', status: 'warn', title: 'Deployment EMAIL_TEST_MODE', message: 'EMAIL_TEST_MODE is not set (optional): test mode stays ON (set to "false" to deliver for real).', fixHint: 'Add EMAIL_TEST_MODE to .env.local and run `npx nuxt-backend env push`.' },
      { id: 'deployment-email-webhook-secret', status: 'pass', title: 'Deployment EMAIL_WEBHOOK_SECRET', message: 'EMAIL_WEBHOOK_SECRET is set on the deployment.' },
      { id: 'email-webhook-route', status: 'pass', title: 'Email webhook route', message: '/email/events is mounted (the unsigned probe was rejected, as expected).' },
    ],
  },
]

/** The command a detent runs. */
export const consoleCommand = (detent: ConsoleDetent) => `npx nuxt-backend doctor --only ${detent.service}`

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
