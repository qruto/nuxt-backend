import { runConvex } from '../convex-cli'
import { ADMISSION_TTL_MS, ADMIT_BATCH_MAX, cleanAddresses, INVITE_LABEL_MAX } from '../convex/access-tickets'
import { deploymentFlags } from '../env-push'
import { finding, type PreflightFinding } from '../findings'

// The first administrator. A fresh deployment has none: nobody can open the
// admin console, ban an account or act as one until an account holds the
// `admin` role. doctor reports it (admin-bootstrap), and `doctor --fix`
// asks for an address and gives that account the role through the
// scaffold's `setUserRole` bootstrap.

/** The most accounts the read looks through: well under a query's read limit, so it never fails on a large deployment. */
const SCAN_LIMIT = 8000

/**
 * The read that says whether an account holds the role, never a value:
 * `true` at the first account whose roles (several comma-separated, as
 * Better Auth stores them) include `admin`, `false` when none does, and
 * `null` when it looked through {@link SCAN_LIMIT} accounts without
 * finding one, which tells nothing.
 */
const HAS_ADMIN_QUERY = [
  'let read = 0',
  'for await (const user of ctx.db.query("user")) {',
  '  if (typeof user.role === "string" && user.role.split(",").some(role => role.trim() === "admin")) return true',
  `  if (++read >= ${SCAN_LIMIT}) return null`,
  '}',
  'return false',
].join('\n')

/**
 * Whether an account on the deployment holds the `admin` role (alone or
 * among others: `admin,support`), read off the auth tables of the
 * `backend` component; `null` when the deployment cannot be read, or holds
 * more accounts than the read looks through and none of those is an
 * administrator. Only the `admin` role itself is looked for: an app whose
 * administrators hold only a role of its own reads as having none.
 */
export async function deploymentHasAdmin(rootDir: string, { prod }: { prod: boolean }): Promise<boolean | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), '--component', 'backend', '--inline-query', HAS_ADMIN_QUERY])
    const answer = stdout.trim()
    return answer === 'true' ? true : answer === 'false' ? false : null
  }
  catch {
    return null
  }
}

/** The command that makes `email` an administrator, as a person types it. */
function setRoleCommand(email: string, prod: boolean): string {
  return `npx convex run${prod ? ' --prod' : ''} functions:setUserRole '${JSON.stringify({ email, role: 'admin' })}'`
}

/** The admin-bootstrap finding for what {@link deploymentHasAdmin} read: none when it could not read. */
export function adminBootstrapFindings(hasAdmin: boolean | null, { prod }: { prod: boolean }): PreflightFinding[] {
  if (hasAdmin === null) return []
  if (hasAdmin) return [finding('admin-bootstrap', 'pass', 'An account holds the admin role: the admin console (/admin) has its administrator.')]
  return [finding(
    'admin-bootstrap',
    'warn',
    'No account holds the admin role yet: nobody can open the admin console (/admin), ban an account or act as one.',
    `Sign in once, then run \`npx nuxt-backend doctor --fix${prod ? ' --prod' : ''}\` and enter your address, or \`${setRoleCommand('you@example.com', prod)}\`.`,
  )]
}

/** What `doctor --fix` reads from the person: an answer to one question. */
export type Ask = (question: string) => Promise<string>

/** An address `setUserRole` can look up: lower case, with one `@` between two non-empty parts. */
function addressOf(answer: string): string | null {
  const email = answer.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

/** How long the first administrator's invitation by address lasts: a day to sign in. */
const FIRST_ADMIN_ADMISSION_MS = 24 * 60 * 60 * 1000

/** The label an admission from the command line carries in the Access tab, unless `--label` names another. */
export const CLI_ADMISSION_LABEL = 'command line'

/** What `access admit --json` prints. */
export interface AccessAdmitReport {
  deployment: 'dev' | 'production'
  /**
   * `admitted`: the admission ran (`admitted` may still be empty when every
   * address was skipped); `refused`: the command ran nothing, for its input
   * or its deploy key (`note` says why); `missing`: the deployment has no
   * launch access to admit through (a backend older than it); `failed`: it
   * refused, or did not answer.
   */
  status: 'admitted' | 'refused' | 'missing' | 'failed'
  /** The addresses that hold an invitation now, lower-cased. */
  admitted: string[]
  /** The addresses it skipped, and why: `malformed`, `reserved` (a documentation or test domain), `account` (an account exists). */
  skipped: Array<{ email: string, reason: 'malformed' | 'reserved' | 'account' }>
  /** When the invitations stop admitting, epoch ms; `null` when refused, since none was given. */
  expiresAt: number | null
  /** Why it was refused, is missing or failed. */
  note?: string
}

/** The report of a run refused before it ran anything: nothing admitted, no expiry. */
export function admitRefused(prod: boolean, note: string): AccessAdmitReport {
  return { deployment: prod ? 'production' : 'dev', status: 'refused', admitted: [], skipped: [], expiresAt: null, note }
}

export interface AdmitOptions {
  prod: boolean
  /** What the Access tab lists the invitations under: 1 to 64 characters (`INVITE_LABEL_MAX`). */
  label: string
  /** When the invitations stop admitting, epoch ms. */
  expiresAt: number
}

/**
 * Admit addresses, as given, through the `backend` component's launch
 * access: an invitation by address each, as the admin console's Access tab
 * gives one, so each signs up whatever the phase until `expiresAt`. One
 * with an account is skipped. No email is sent, and it is not on the
 * activity trail: the Access tab lists it under its label.
 */
async function admitAddresses(rootDir: string, emails: readonly string[], { prod, label, expiresAt }: AdmitOptions, run: typeof runConvex): Promise<AccessAdmitReport> {
  const deployment = prod ? 'production' : 'dev'
  const report = (status: AccessAdmitReport['status'], admitted: string[], skipped: AccessAdmitReport['skipped'], note?: string): AccessAdmitReport =>
    ({ deployment, status, admitted, skipped, expiresAt, ...(note ? { note } : {}) })
  if (emails.length === 0) return report('admitted', [], [])
  try {
    const args = { emails, source: 'invitation', label, expiresAt }
    const { stdout } = await run(rootDir, ['run', ...deploymentFlags({ prod }), '--component', 'backend', 'access:admit', JSON.stringify(args)])
    const stored = (JSON.parse(stdout || 'null') ?? {}) as { admitted?: string[], skipped?: Array<{ email: string }> }
    return report('admitted', stored.admitted ?? [], (stored.skipped ?? []).map(row => ({ email: row.email, reason: 'account' as const })))
  }
  catch (error) {
    if ((error as { missingFunction?: unknown } | null)?.missingFunction === true) return report('missing', [], [], `the ${deployment} deployment's backend has no launch access to admit through (access:admit): push the backend first.`)
    return report('failed', [], [], `the ${deployment} deployment refused the admission (${error instanceof Error ? error.message : String(error)}).`)
  }
}

/**
 * `access admit`: each address cleaned as the Access tab cleans a pasted
 * list (trimmed, lower-cased, a malformed one or one on a reserved test
 * domain skipped), then the rest admitted.
 */
export async function admitCleaned(rootDir: string, emails: readonly string[], options: AdmitOptions, run: typeof runConvex = runConvex): Promise<AccessAdmitReport> {
  const { clean, skipped } = cleanAddresses(emails)
  const report = await admitAddresses(rootDir, clean, options, run)
  return { ...report, skipped: [...skipped, ...report.skipped] }
}

/** Why `access admit`'s input may not run, or null: no address, too many, or a label or expiry out of range. */
export function admitInputRefusal(emails: readonly string[], label: string, days: number): string | null {
  if (emails.length === 0) return 'name at least one address: npx nuxt-backend access admit you@example.com'
  if (emails.length > ADMIT_BATCH_MAX) return `at most ${ADMIT_BATCH_MAX} addresses at a time.`
  if (!label.trim() || label.trim().length > INVITE_LABEL_MAX) return `--label is 1-${INVITE_LABEL_MAX} characters.`
  if (!Number.isInteger(days) || days < 1 || days > 365) return '--days is a whole number of days from 1 to 365.'
  return null
}

/** The invitations' lifetime `access admit` gives by default: the Access tab's. */
export const ADMISSION_DAYS = ADMISSION_TTL_MS / (24 * 60 * 60 * 1000)

/**
 * Admit `email` for the first administrator: a day to sign up, whatever
 * the phase. `true` only when the deployment says that address holds the
 * invitation now: `false` for a deployment without launch access, and for
 * one that skipped it (an account it found under that address).
 */
async function admitAddress(rootDir: string, email: string, prod: boolean): Promise<boolean> {
  const { status, admitted } = await admitAddresses(rootDir, [email], { prod, label: 'first-administrator', expiresAt: Date.now() + FIRST_ADMIN_ADMISSION_MS }, runConvex)
  return status === 'admitted' && admitted.includes(email)
}

/**
 * `doctor --fix`'s first administrator: when the deployment has none, ask
 * for an address and give that account the `admin` role through the
 * scaffold's `setUserRole`, which records the change on the activity trail
 * as the app's. An address with no account yet is admitted (the launch
 * phase lets it sign up), and the person signs in, then runs it again. An
 * empty answer skips it. Resolves with the address made an administrator,
 * or `null`.
 */
export async function bootstrapAdmin(rootDir: string, { prod, ask, print }: { prod: boolean, ask: Ask, print: (line: string) => void }): Promise<string | null> {
  if (await deploymentHasAdmin(rootDir, { prod }) !== false) return null
  const answer = await ask('[nuxt-backend] doctor --fix: no account holds the admin role. Make which account the first administrator? Its email (empty to skip): ')
  if (!answer.trim()) {
    print('[nuxt-backend] doctor --fix: no first administrator made.')
    return null
  }
  const email = addressOf(answer)
  if (!email) {
    print(`[nuxt-backend] doctor --fix: "${answer.trim()}" is not an email address; no first administrator made.`)
    return null
  }
  try {
    await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), 'functions:setUserRole', JSON.stringify({ email, role: 'admin' })])
  }
  catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    if (/No user with email/.test(why)) {
      // No account yet: while the app is closed, that address would meet
      // the invite step, so it is admitted first (an invitation by address).
      const admitted = await admitAddress(rootDir, email, prod)
      print(`[nuxt-backend] doctor --fix: ${email} has no account yet${admitted ? ', and may now sign up while the app is closed' : ''}. Sign in with it once, then run doctor --fix again to make it the first administrator.`)
      return null
    }
    print(`[nuxt-backend] doctor --fix: ${email} was not made an administrator (${why.split('\n')[0]}).`)
    return null
  }
  print(`[nuxt-backend] doctor --fix: ${email} is the first administrator.`)
  return email
}

/**
 * `doctor --fix`'s first-administrator step: {@link bootstrapAdmin} for a
 * person at a terminal; without one (a script, CI, `--json`) nothing is
 * asked, and unless the deployment has an administrator it says so, the
 * deployment without one or not read, so a run that skipped the step does
 * not read as one that made it.
 */
export async function firstAdministratorOnFix(rootDir: string, { prod, interactive, ask, print }: { prod: boolean, interactive: boolean, ask: Ask, print: (line: string) => void }): Promise<string | null> {
  if (interactive) return bootstrapAdmin(rootDir, { prod, ask, print })
  const hasAdmin = await deploymentHasAdmin(rootDir, { prod })
  if (hasAdmin === true) return null
  const fix = `Run \`npx nuxt-backend doctor --fix${prod ? ' --prod' : ''}\` at a terminal, or \`${setRoleCommand('you@example.com', prod)}\`.`
  print(hasAdmin === false
    ? `[nuxt-backend] doctor --fix: no first administrator made: there is no terminal to ask at. ${fix}`
    : `[nuxt-backend] doctor --fix: could not check for a first administrator: the deployment's accounts did not answer, or hold more than doctor reads. If none holds the admin role, ${fix.charAt(0).toLowerCase()}${fix.slice(1)}`)
  return null
}
