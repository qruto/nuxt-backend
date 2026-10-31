/**
 * The `email-*` tools: the email provider's API (Resend), read with
 * `EMAIL_API_KEY` from the process env or `.env.local`, plus the dev inbox's
 * sign-in codes, which `nuxt-backend inbox` reads through the deployment.
 * Sending is the one write, and only to the provider's test addresses.
 *
 * One key usually serves development and production alike, so the account
 * holds production's recipients too. Without `--prod` the tools answer only
 * what went to, or names, the provider's test addresses.
 */
import { Resend } from 'resend'
import { z } from 'zod'
import { DEFAULT_INBOX_ADDRESS, inboxRefusal, readInbox, type InboxReport } from '../cli/inbox'
import { deploymentBackendEnvironment, readEnvFiles } from '../env-push'
import { isSandboxAddress } from '../runtime/vue/utils/sandbox-code'
import { defineTool, limit, ToolRefusal, type DevTool, type ToolContext } from './tools'

/** The provider client the tools use: tests pass a fake. */
export type EmailClient = Pick<Resend, 'emails' | 'domains' | 'contacts' | 'segments'>

/** What the inbox tool reads with: tests pass fakes. */
export interface InboxReader {
  environment: (rootDir: string) => Promise<string | null>
  read: (rootDir: string, address: string) => Promise<InboxReport>
}

/** The key, where the CLI reads provider keys: the process env over `.env.local`. */
export function emailApiKey(rootDir: string): string | undefined {
  return process.env.EMAIL_API_KEY || readEnvFiles(rootDir).EMAIL_API_KEY || undefined
}

function client({ rootDir }: ToolContext, create: (key: string) => EmailClient): EmailClient {
  const key = emailApiKey(rootDir)
  if (!key) throw new ToolRefusal('EMAIL_API_KEY is not set: create an API key with full access at resend.com/api-keys, put it in .env.local, then call again.')
  return create(key)
}

/** A provider answer's data, or its error said in words. */
function unwrap<T>(answer: { data: T | null, error: { name?: string, message?: string } | null }): T {
  if (answer.error || answer.data === null) {
    const restricted = answer.error?.name === 'restricted_api_key'
    throw new ToolRefusal(restricted
      ? 'EMAIL_API_KEY can only send: reading emails, domains and contacts needs a key with full access (resend.com/api-keys).'
      : `The email provider answered: ${answer.error?.message ?? 'nothing'}.`)
  }
  return answer.data
}

/** Whether every recipient is one of the provider's test addresses: what the tools answer without `--prod`. */
function toTestAddresses(to: string | string[] | null | undefined): boolean {
  const recipients = Array.isArray(to) ? to : to ? [to] : []
  return recipients.length > 0 && recipients.every(isSandboxAddress)
}

/** The list inside a provider list answer. */
const listOf = <T>(data: { data?: T[] } | T[]): T[] => (Array.isArray(data) ? data : data.data ?? [])

const createClient = (key: string): EmailClient => new Resend(key)

const defaultInbox: InboxReader = {
  environment: rootDir => deploymentBackendEnvironment(rootDir),
  read: (rootDir, address) => readInbox(rootDir, address),
}

export function emailTools(create: (key: string) => EmailClient = createClient, inbox: InboxReader = defaultInbox): DevTool[] {
  return [
    defineTool({
      name: 'email-sent',
      title: 'Sent emails',
      description: 'The emails the app sent, newest first: each with its recipients, subject, time and its last delivery event (`delivered`, `bounced`, `complained`, …). Never a body. In development, only those of the last `limit` sent that went to the provider\'s test addresses; with --prod, every one.',
      input: z.object({ limit }),
      provider: true,
      run: async ({ limit }, context) => listOf(unwrap(await client(context, create).emails.list({ limit }))).filter(email => context.prod || toTestAddresses(email.to)).map(email => ({
        id: email.id,
        to: email.to,
        from: email.from,
        subject: email.subject,
        createdAt: email.created_at,
        lastEvent: email.last_event,
      })),
    }),
    defineTool({
      name: 'email-get',
      title: 'One sent email',
      description: 'One sent email by its id: its recipients, subject, time and last delivery event. Never a body. In development, only one sent to the provider\'s test addresses; with --prod, any.',
      input: z.object({ id: z.string().min(1).max(100) }),
      provider: true,
      run: async ({ id }, context) => {
        const email = unwrap(await client(context, create).emails.get(id))
        if (!context.prod && !toTestAddresses(email.to)) throw new ToolRefusal('That email went to an address other than the provider\'s test addresses, which is production\'s: read it with `npx nuxt-backend mcp --prod`.')
        return { id: email.id, to: email.to, from: email.from, subject: email.subject, createdAt: email.created_at, lastEvent: email.last_event, scheduledAt: email.scheduled_at ?? null }
      },
    }),
    defineTool({
      name: 'email-inbox',
      title: 'Dev inbox codes',
      description: `The sign-in codes the dev deployment sent to one of the provider's test addresses (${DEFAULT_INBOX_ADDRESS} by default, or delivered+<label>@resend.dev), newest first: how an agent finishes an email-code sign-in with no mailbox. Development only: refused on any deployment whose BACKEND_ENVIRONMENT is not \`development\`.`,
      input: z.object({ address: z.string().max(200).default(DEFAULT_INBOX_ADDRESS).describe('The test address the code was sent to') }),
      provider: true,
      run: async ({ address }, { rootDir, prod }) => {
        const refusal = inboxRefusal(rootDir, { prod, address })
        if (refusal) throw new ToolRefusal(refusal)
        const environment = await inbox.environment(rootDir)
        if (environment !== 'development') {
          throw new ToolRefusal(`email-inbox reads codes on a development deployment only, and this one's BACKEND_ENVIRONMENT is ${environment ?? 'not set'}. Run \`npx nuxt-backend env push\` on a dev deployment to set it.`)
        }
        return inbox.read(rootDir, address)
      },
    }),
    defineTool({
      name: 'email-domains',
      title: 'Sending domains',
      description: 'The sending domains on the email account, with their verification status and region.',
      input: z.object({}),
      provider: true,
      run: async (_args, context) => listOf(unwrap(await client(context, create).domains.list())).map(domain => ({ id: domain.id, name: domain.name, status: domain.status, region: domain.region })),
    }),
    defineTool({
      name: 'email-contacts',
      title: 'Contacts',
      description: 'The contacts on the email account, of one segment or of all: each with its email, name and whether it unsubscribed. In development, only the provider\'s test addresses among the first `limit`; with --prod, every one.',
      input: z.object({ segmentId: z.string().max(100).optional(), limit }),
      provider: true,
      run: async ({ segmentId, limit }, context) => listOf(unwrap(await client(context, create).contacts.list({ ...(segmentId ? { segmentId } : {}), limit }))).filter(contact => context.prod || toTestAddresses(contact.email)).map(contact => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.first_name ?? null,
        lastName: contact.last_name ?? null,
        unsubscribed: contact.unsubscribed,
      })),
    }),
    defineTool({
      name: 'email-segments',
      title: 'Segments',
      description: 'The contact segments on the email account.',
      input: z.object({ limit }),
      provider: true,
      run: async ({ limit }, context) => listOf(unwrap(await client(context, create).segments.list({ limit }))).map(segment => ({ id: segment.id, name: segment.name, createdAt: segment.created_at })),
    }),
    defineTool({
      name: 'email-send-test',
      title: 'Send a test email',
      description: 'Send a plain-text test email to one of the provider\'s test addresses (delivered@, bounced@ or complained@resend.dev, with an optional +label), which answer with real delivery events. It asks you first, and sends to no other address.',
      input: z.object({
        to: z.string().max(200).default(DEFAULT_INBOX_ADDRESS).describe('A test address, such as bounced+agent@resend.dev'),
        subject: z.string().min(1).max(200).default('nuxt-backend test email'),
        text: z.string().max(5000).default('A test email from the developer MCP server.'),
      }),
      readOnly: false,
      provider: true,
      run: async ({ to, subject, text }, context) => {
        if (!isSandboxAddress(to)) throw new ToolRefusal(`${to} is not one of the provider's test addresses: email-send-test sends only to delivered@, bounced@ or complained@resend.dev, with an optional +label.`)
        const email = client(context, create)
        await context.confirm({ action: `send a test email to ${to}`, command: 'send it from the Resend dashboard, or with the app\'s own sign-in form' })
        const from = process.env.EMAIL_FROM || readEnvFiles(context.rootDir).EMAIL_FROM || 'onboarding@resend.dev'
        const sent = unwrap(await email.emails.send({ from, to, subject, text }))
        return { id: sent.id, to, from }
      },
    }),
  ]
}
