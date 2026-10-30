import { createInterface } from 'node:readline/promises'
import { runConvex } from '../convex-cli'
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

/** Ask on the terminal. */
export async function askOnTerminal(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await terminal.question(question)
  }
  finally {
    terminal.close()
  }
}

/** An address `setUserRole` can look up: lower case, with one `@` between two non-empty parts. */
function addressOf(answer: string): string | null {
  const email = answer.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

/** How long the first administrator's invitation by address lasts: a day to sign in. */
const FIRST_ADMIN_ADMISSION_MS = 24 * 60 * 60 * 1000

/**
 * Admit `email` through the `backend` component's launch access (an
 * invitation by address), so it signs up whatever the phase. `false` for a
 * deployment without it.
 */
async function admitAddress(rootDir: string, email: string, prod: boolean): Promise<boolean> {
  try {
    const args = { emails: [email], source: 'invitation', label: 'first-administrator', expiresAt: Date.now() + FIRST_ADMIN_ADMISSION_MS }
    await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), '--component', 'backend', 'access:admit', JSON.stringify(args)])
    return true
  }
  catch {
    return false
  }
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
