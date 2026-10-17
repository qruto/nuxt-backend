/**
 * `nuxt-backend inbox [address]` — the sign-in codes a dev deployment sent to
 * one of the email provider's sandbox addresses, read from the backend
 * component's sandbox inbox (`convex run --component backend email:inbox`).
 *
 * It is how a coding agent, or a script, finishes an email-code sign-in on a
 * dev deployment with no mailbox and no terminal to read. So it refuses
 * everything else: `--prod`, a deploy key for anything but a dev deployment,
 * a configured deployment that is not dev-class, and an address that is not a
 * sandbox one. The component adds its own guard: with test mode off it holds
 * nothing. Only each message's sender, subject, time and code are printed,
 * never its body.
 */
import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { runConvex } from '../convex-cli'
import { isDevDeploymentId } from '../deployment'
import { configuredDeployment, deployKeyType, readEnvFiles } from '../env-push'
import { findCode, isSandboxAddress } from '../runtime/vue/utils/sandbox-code'
import { withContract } from './contract'

/** The address read when none is given: the provider's plain sandbox address. */
export const DEFAULT_INBOX_ADDRESS = 'delivered@resend.dev'

/** One message as `inbox` reports it: never its body. */
export interface InboxMessage {
  from: string
  subject: string
  /** When it was sent, as epoch ms. */
  receivedAt: number
  /** The first six-digit code in it, or null. */
  code: string | null
}

/** What `inbox --json` prints. */
export interface InboxReport {
  address: string
  /** The dev deployment read (`CONVEX_DEPLOYMENT`), or null when a dev deploy key chose it. */
  deployment: string | null
  /** Newest first, within the last hour. */
  messages: InboxMessage[]
  /** The newest message's code, or null. */
  code: string | null
}

/**
 * Why `inbox` will not read this deployment, or null when it may. The deploy
 * key is looked up where the Convex CLI looks (the process env over
 * `.env.local` over `.env`): the CLI follows it whatever `.env.local` names.
 */
export function inboxRefusal(rootDir: string, { prod, address }: { prod: boolean, address: string }): string | null {
  if (prod) return 'inbox reads dev deployments only: --prod is refused. A sign-in code on a production deployment belongs to its owner\'s mailbox.'
  const keyType = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  if (keyType !== null && keyType !== 'dev') {
    return `inbox reads dev deployments only: CONVEX_DEPLOY_KEY is a ${keyType === 'prod' ? 'production' : keyType} deploy key, and the Convex CLI would read that deployment. Unset it to read the dev deployment .env.local names.`
  }
  if (keyType === null) {
    if (process.env.CONVEX_SELF_HOSTED_URL || readEnvFiles(rootDir).CONVEX_SELF_HOSTED_URL) {
      return 'inbox reads dev deployments only, and a self-hosted deployment does not say whether it is one.'
    }
    const deployment = configuredDeployment(rootDir)
    const kind = deployment?.split(':')[0]
    if (!isDevDeploymentId(deployment)) {
      return kind
        ? `inbox reads dev deployments only, and CONVEX_DEPLOYMENT is ${kind}:… — not a dev, local or anonymous one.`
        : 'No dev deployment is configured: run `npx nuxt-backend dev` once, then read the inbox.'
    }
  }
  if (!isSandboxAddress(address)) {
    return `${address} has no sandbox inbox: only the provider's sandbox addresses do (${DEFAULT_INBOX_ADDRESS}, or delivered+<label>@resend.dev). Sign in with one of them.`
  }
  return null
}

/** The component's raw message, as `email:inbox` returns it. */
interface RawMessage {
  from: string
  subject: string
  text?: string
  html?: string
  receivedAt: number
}

/** Read one sandbox address's inbox on the deployment the Convex CLI selects. */
export async function readInbox(rootDir: string, address: string, run: typeof runConvex = runConvex): Promise<InboxReport> {
  const normalized = address.trim().toLowerCase()
  const { stdout } = await run(rootDir, ['run', '--component', 'backend', 'email:inbox', JSON.stringify({ address: normalized })])
  const raw: unknown = JSON.parse(stdout)
  // `convex run` prints the function's return value; anything else is not the inbox.
  if (!Array.isArray(raw)) throw new Error(`email:inbox returned ${typeof raw === 'object' ? JSON.stringify(raw)?.slice(0, 80) : typeof raw}, not a list of messages`)
  const messages = (raw as RawMessage[]).map(message => ({
    from: message.from,
    subject: message.subject,
    receivedAt: message.receivedAt,
    code: findCode(message) ?? null,
  }))
  const keyed = deployKeyType({ ...readEnvFiles(rootDir), ...process.env }) !== null
  return { address: normalized, deployment: keyed ? null : configuredDeployment(rootDir), messages, code: messages[0]?.code ?? null }
}

/** How long ago `then` was, in words: `12s ago`, `4m ago`. */
function ago(then: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`
}

export const inbox = withContract('inbox', {
  sideEffects: ['reads only'],
  json: '`{ address, deployment, messages: [{ from, subject, receivedAt, code }], code }`: newest first, `code` the newest message\'s; bodies are never printed',
  exitCodes: {
    0: 'the inbox was read; it may be empty (`code` null)',
    1: 'refused — `--prod`, a deploy key for anything but a dev deployment, a deployment that is not dev-class, an address with no sandbox inbox — or the read failed',
  },
}, defineCommand({
  meta: { name: 'inbox', description: 'Print the sign-in codes a dev deployment sent to a sandbox address (default delivered@resend.dev)' },
  args: {
    address: { type: 'positional', description: 'The sandbox address to read, such as delivered+agent@resend.dev', required: false },
    cwd: { type: 'string', description: 'Project directory', default: '.' },
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
    prod: { type: 'boolean', description: 'Refused: the inbox is read on dev deployments only', default: false },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const address = (args.address as string | undefined)?.trim() || DEFAULT_INBOX_ADDRESS
    const refusal = inboxRefusal(rootDir, { prod: args.prod, address })
    if (refusal) {
      console.error(`[nuxt-backend] ${refusal}`)
      process.exitCode = 1
      return
    }
    let report: InboxReport
    try {
      report = await readInbox(rootDir, address)
    }
    catch (error) {
      console.error(`[nuxt-backend] Could not read the inbox: ${error instanceof Error ? error.message : String(error)}. Is \`npx nuxt-backend dev\` running, and has the backend been pushed?`)
      process.exitCode = 1
      return
    }
    if (args.json) {
      console.log(JSON.stringify(report, null, 2))
      return
    }
    if (report.messages.length === 0) {
      console.log(`[nuxt-backend] No mail to ${report.address} in the last hour. Request a sign-in code for it, then read again.`)
      return
    }
    for (const message of report.messages) {
      console.log(`${(message.code ?? '------').padEnd(8)} ${ago(message.receivedAt).padEnd(8)} ${message.subject}`)
    }
  },
}))
