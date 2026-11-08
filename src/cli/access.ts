import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { type AccessAdmitReport, ADMISSION_DAYS, admitCleaned, admitInputRefusal, CLI_ADMISSION_LABEL } from './admin'
import { finish, progress, withContract } from './contract'
import { targetKeyRefusal } from './target'

// `nuxt-backend access`: the launch access an app runs in phases (early
// access, invite only, public), from the terminal. `admit` gives addresses
// an invitation each, as the admin console's Access tab does, for a drill,
// an end-to-end test or a first tester, with nobody signed in to the console.

/** The addresses a run names: the first positional and every one after it, each also split on commas. */
function addressesOf(args: { email?: string, _?: string[] }): string[] {
  const words = [...new Set([args.email, ...(args._ ?? [])].filter((word): word is string => typeof word === 'string'))]
  return words.flatMap(word => word.split(',')).map(word => word.trim()).filter(Boolean)
}

/** Why an address was skipped, as a person reads it. */
const SKIPPED: Readonly<Record<AccessAdmitReport['skipped'][number]['reason'], string>> = {
  account: 'it has an account',
  reserved: 'a reserved test domain',
  malformed: 'not an address',
}

/** The report as the lines a person reads. */
function admitLines(report: AccessAdmitReport): string[] {
  if (report.status !== 'admitted') return [`[nuxt-backend] access admit: ${report.note}`]
  const until = new Date(report.expiresAt).toISOString().slice(0, 10)
  return [
    ...report.admitted.length ? [`[nuxt-backend] access admit: ${report.admitted.join(', ')} may sign up on the ${report.deployment} deployment until ${until}, whatever the phase.`] : [],
    ...report.skipped.map(({ email, reason }) => `[nuxt-backend] access admit: skipped ${email} (${SKIPPED[reason]}).`),
  ]
}

export const accessAdmit = withContract('access admit', {
  sideEffects: ['writes the dev deployment'],
  byFlag: { '--prod': ['writes production'] },
  json: '`{ deployment: "dev" | "production", status: "admitted" | "missing" | "failed", admitted, skipped: [{ email, reason: "malformed" | "reserved" | "account" }], expiresAt, note? }`',
  exitCodes: {
    0: 'the admission ran: each address named holds an invitation, or was skipped with its reason',
    1: 'refused or not admitted: no address or too many, a label or a lifetime out of range, a deploy key for another deployment than the flags name, a deployment without launch access, or one that refused',
  },
}, defineCommand({
  meta: { name: 'admit', description: 'Let addresses sign up while the app is closed: an invitation by address each, as the admin console\'s Access tab gives one, with no email sent. An address with an account is skipped' },
  args: {
    email: { type: 'positional', description: 'The address to admit; name several, or separate them with commas', required: true },
    cwd: { type: 'string', description: 'Project directory', default: '.' },
    prod: { type: 'boolean', description: 'Admit on the production deployment', default: false },
    label: { type: 'string', description: `What the Access tab lists the invitations under (default "${CLI_ADMISSION_LABEL}")`, default: CLI_ADMISSION_LABEL },
    days: { type: 'string', description: `How many days the invitations admit (default ${ADMISSION_DAYS}, at most 365)`, default: String(ADMISSION_DAYS) },
    json: { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const emails = addressesOf(args)
    const days = Number(args.days)
    const refused = admitInputRefusal(emails, args.label, days) ?? targetKeyRefusal(rootDir, args.prod)
    if (refused) {
      console.error(`[nuxt-backend] access admit refused: ${refused}`)
      process.exitCode = 1
      return
    }
    const report = await admitCleaned(rootDir, emails, { prod: args.prod, label: args.label.trim(), expiresAt: Date.now() + days * 24 * 60 * 60 * 1000 })
    for (const line of admitLines(report)) progress(args.json)(line)
    finish(args.json, { exitCode: report.status === 'admitted' ? 0 : 1, output: report })
  },
}))

export const access = defineCommand({
  meta: { name: 'access', description: 'Launch access helpers' },
  subCommands: { admit: accessAdmit },
})
