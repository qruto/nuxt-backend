import { RateLimiter } from '@convex-dev/rate-limiter'
import { actionGeneric, type FunctionReference, type GenericActionCtx, type GenericDataModel, internalActionGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { backendEnvironment, readEnv } from '../delivery.js'
import { isLive } from '../environment.js'
import { backendError } from '../errors.js'
import {
  authenticSender,
  checkedReply,
  contactProblem,
  contactRefOf,
  defined,
  CONTACT_MESSAGE_MAX,
  type InboundRejection,
  INBOUND_ATTACHMENTS_MAX,
  INBOUND_TEXT_MAX,
  type ContactInput,
  type InboundAuthentication,
  type InboundRoute,
  parseAddress,
  type ParsedAddress,
  replyAddressFor,
  routeOf,
} from '../inbound-rules.js'
import { logBackend } from '../log.js'
import { protectionEnv } from '../proof.js'
import { normalizeEmail, sha256Hex } from '../tokens.js'
import { addressDigest } from '../waitlist-rules.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, refuseCaller, requireAdministratorInPerson } from './access.js'
import { verifyHuman } from './functions.js'
import { DEFAULT_LIMITS } from './rate-limit.js'
import { DEFAULT_ADMIN_ROLES } from '../constants.js'

// The contact form and inbound mail, behind `setupEmail`: the form's write
// and its protections, the receiving webhook's routing (reply addresses,
// workspace addresses, the support inbox), the Inbox tab's two functions and
// the sync that prepares the provider. The rows live in the `backend`
// component (`components/backend/inbound.ts`); the rules both sides share are
// in `../inbound-rules.ts`.

/** A message as the hooks receive it, once it is verified and stored. */
export interface InboundMessage {
  /** The email provider's id for the received email: read an attachment's content with it. */
  id: string
  /** The sender's address. */
  from: string
  /** The sender's display name, when the mail gave one. */
  name?: string
  /** The address it came to. */
  to: string
  subject: string
  text: string | null
  html: string | null
  /** Each attachment's name and size; its content is one more call to the provider. */
  attachments: Array<{ name: string, size: number | null }>
  /** When the mail arrived, as epoch ms. */
  receivedAt: number
}

/** A minimal action context (just the `run*` callers), so any app action or HTTP action ctx fits. */
type HookCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation' | 'runAction'>

/** What `setupEmail({ inbound })` takes. */
export interface InboundOptions {
  /**
   * The receiving domain: a subdomain whose MX records point at the email
   * provider (`in.panels.app`). Reply addresses and workspace addresses live
   * on it. On a dev deployment, the `<id>.resend.app` address the provider
   * gives every account.
   */
  domain?: string
  /**
   * The support address (`support@panels.app`): an inbox at the email
   * provider that stores and threads the conversation. The contact form posts
   * its messages into it, and `npx nuxt-backend email sync` creates it.
   */
  support?: string
  /**
   * Called when a person replies by email to a reply address
   * (`email.replyAddress`), once the sender passed DMARC and is that person's
   * own address. The reply is in `message`; `thread` is what the address named.
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, after the message is verified and stored
   * - Delivery: at least once: a message already handled answers 200 without running it again, but one whose hook threw is redelivered
   * - Order: as the provider delivers: no order across messages
   * - When it throws: logged as `handler_error`, answered 500, and the provider delivers the message again; the stored copy is not duplicated
   * - Idempotency: key what it writes on `message.id`
   */
  onReply?: (ctx: HookCtx, event: { userId: string, thread: string, message: InboundMessage }) => Promise<void>
  /**
   * Called when mail arrives at a workspace's own address on the receiving
   * domain (its slug), once the sender passed the DMARC check.
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, after the message is verified and stored
   * - Delivery: at least once: a message already handled answers 200 without running it again, but one whose hook threw is redelivered
   * - Order: as the provider delivers: no order across messages
   * - When it throws: logged as `handler_error`, answered 500, and the provider delivers the message again; the stored copy is not duplicated
   * - Idempotency: key what it writes on `message.id`
   */
  onWorkspaceMail?: (ctx: HookCtx, event: { workspaceId: string, slug: string, message: InboundMessage }) => Promise<void>
}

/** What `setupEmail({ contact })` takes. */
export interface ContactOptions {
  /** The team's mailbox: a contact message is copied there with the sender's address as its reply-to, when there is no support inbox. */
  to?: string
}

/** One row of the Inbox tab. */
export interface InboxRow {
  id: string
  /** `contact` (the form), `reply` (a reply address), `workspace` (a workspace's address) or `support` (the support inbox). */
  kind: 'contact' | 'reply' | 'workspace' | 'support'
  /** When it was sent or arrived, as epoch ms. */
  at: number
  /** The sender's address. */
  from: string | null
  name: string | null
  /** The account that sent it, when it was one. */
  account: { id: string, name: string, email: string } | null
  subject: string | null
  text: string
  attachments: Array<{ name: string, size?: number }>
  /** A contact message: where its copy went (`support`, `copy`, `kept`, `held` or `failed`). */
  delivery: 'support' | 'copy' | 'kept' | 'held' | 'failed' | null
  workspaceId: string | null
  thread: string | null
  /** Whether an administrator can answer it here: it sits in the support inbox. */
  canReply: boolean
  repliedAt: number | null
}

/** Everything the Inbox tab shows. */
export interface InboxConsole {
  /** The support address; `null` without a support inbox. */
  support: string | null
  /** Newest first, at most 100. */
  rows: InboxRow[]
}

/** What `syncInbound` reports to `nuxt-backend email sync`. */
export interface InboundSyncReport {
  /** The support address, or `null` when `setupEmail` names none. */
  support: string | null
  /** The inbox: found, made now, or `null` without a support address. */
  inbox: 'found' | 'created' | null
  /** The receiving domain's state at the provider, or `null` when the address names a domain the account does not hold. */
  domain: { name: string, status: string, receiving: boolean } | null
  /** The webhook that carries the events: found, its events completed, or missing (it needs the route's URL and secret, which only you can set). */
  webhook: { state: 'ok' | 'updated' | 'missing', id: string | null, added: string[] }
  /** What is left to do by hand, in words. */
  todo: string[]
}

interface InboundRefs {
  inbound: {
    replyToken: FunctionReference<'mutation', 'internal', { userId: string, thread: string }, string>
    replyOf: FunctionReference<'query', 'internal', { token: string }, { userId: string, thread: string } | null>
    storeContact: FunctionReference<'mutation', 'internal', { userId?: string, name?: string, email?: string, message: string, locale?: string, support?: string, to?: string }, { id: string, ref: string, delivery: 'support' | 'copy' | 'kept' | 'held' | 'failed' }>
    linkContact: FunctionReference<'mutation', 'internal', { ref: string, threadId: string, inboxEmailId: string }, boolean>
    recordInbound: FunctionReference<'mutation', 'internal', { message: StoredInbound }, { id: string, fresh: boolean, handled: boolean }>
    markHandled: FunctionReference<'mutation', 'internal', { id: string }, null>
    markReplied: FunctionReference<'mutation', 'internal', { kind: 'contact' | 'inbound', id: string, by: string }, null>
    replyTarget: FunctionReference<'query', 'internal', { kind: 'contact' | 'inbound', id: string }, { kind: 'contact' | 'support', threadId: string, inboxEmailId: string } | null>
    consoleRows: FunctionReference<'query', 'internal', Record<string, never>, Array<Omit<InboxRow, 'account'> & { userId: string | null }>>
  }
  adapter: { findOne: AdapterFindOne }
}

/** A recipient on the receiving domain that something claims: a reply address (with its owner and thread) or a workspace's slug. */
type Accepted
  = | { recipient: string, kind: 'reply', userId: string, thread: string }
    | { recipient: string, kind: 'workspace', workspaceId: string, slug: string }

/** The events the webhook at the provider must carry for inbound mail. */
const INBOUND_EVENTS = ['email.received', 'inbox.email.received'] as const

interface StoredInbound {
  emailId: string
  route: 'reply' | 'workspace' | 'support'
  to: string
  from: string
  fromName?: string
  subject: string
  text?: string
  attachments: Array<{ name: string, size?: number }>
  receivedAt: number
  userId?: string
  thread?: string
  workspaceId?: string
  threadId?: string
  inboxEmailId?: string
}

/** A received email as the provider returns it: what the file reads of it. */
type ReceivedMail = { text?: string | null, html?: string | null, subject?: string | null, created_at: string, headers?: Record<string, string> | null, attachments?: Array<{ id?: string, filename?: string | null, size?: number | null }> }

/** The webhook event data this file reads (`email.received`, `inbox.email.received`). */
interface ReceivedData {
  email_id?: string
  from?: string
  to?: string[]
  cc?: string[]
  received_for?: string[]
  subject?: string
  created_at?: string
  inbox_id?: string
  thread_id?: string
  thread?: { subject?: string | null }
  email?: {
    id?: string
    direction?: string
    from?: string
    to?: string[]
    cc?: string[]
    bcc?: string[]
    reply_to?: string[]
    subject?: string | null
    attachments?: Array<{ id?: string, filename?: string | null, size?: number | null }>
    received_at?: string
  }
  attachments?: Array<{ id?: string, filename?: string | null, size?: number | null }>
}

/** The rate limits the contact form, inbound mail and the Inbox tab's replies spend, as `setupEmail({ rateLimiter })` takes them. */
export interface InboundRateLimiter {
  limit: (ctx: never, name: 'contact' | 'contactGlobal' | 'inboundMail' | 'inboundMailGlobal' | 'admin', options?: { key?: string, count?: number, throws?: boolean }) => Promise<{ ok: boolean, retryAfter?: number }>
}

export interface InboundDeps {
  components: { backend: Record<string, unknown>, rateLimiter?: unknown }
  inbound: InboundOptions | undefined
  contact: ContactOptions | undefined
  adminRoles?: readonly string[]
  adminUserIds?: readonly string[]
  rateLimiter?: InboundRateLimiter
}

/** The provider's client; refused when the deployment has no key. */
function providerClient(): Resend {
  const key = readEnv('EMAIL_API_KEY')
  if (!key) throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, '[nuxt-backend] Inbound mail needs EMAIL_API_KEY on the deployment.')
  return new Resend(key)
}

/** An error the provider answered with, as its status. */
const isNotFound = (error: { name?: string, statusCode?: number | null } | null | undefined): boolean => error?.name === 'not_found' || error?.statusCode === 404

/** The inbox ids of support addresses, for the isolate's life: an address keeps its id. */
const inboxIds = new Map<string, string>()

/** Each attachment as the hooks and the console see it. */
function attachmentsOf(list: ReceivedData['attachments']): Array<{ name: string, size?: number }> {
  return (list ?? []).slice(0, INBOUND_ATTACHMENTS_MAX).map(item => ({
    name: (item.filename ?? 'attachment').slice(0, 255),
    ...(typeof item.size === 'number' ? { size: item.size } : {}),
  }))
}

/** The address list of a webhook field, as parsed addresses. */
function addressesOf(...lists: Array<string[] | undefined>) {
  const seen = new Set<string>()
  const parsed = []
  for (const value of lists.flatMap(list => list ?? [])) {
    const address = parseAddress(value)
    if (!address || seen.has(address.address)) continue
    seen.add(address.address)
    parsed.push(address)
  }
  return parsed
}

/**
 * The contact form and inbound mail for `setupEmail`. Everything is built
 * lazily from the options: an app without `inbound` or `contact` pays for
 * none of it.
 */
export function createInbound(deps: InboundDeps) {
  const { inbound, contact } = deps
  const refs = deps.components.backend as unknown as Partial<InboundRefs>
  const administrators: Administrators = { roles: deps.adminRoles ?? DEFAULT_ADMIN_ROLES, userIds: deps.adminUserIds ?? [] }
  const reads = refs.adapter ? createAccessReads(refs.adapter.findOne) : undefined
  const own = deps.components.rateLimiter
    ? new RateLimiter(deps.components.rateLimiter as never, { contact: DEFAULT_LIMITS.contact, contactGlobal: DEFAULT_LIMITS.contactGlobal, inboundMail: DEFAULT_LIMITS.inboundMail, inboundMailGlobal: DEFAULT_LIMITS.inboundMailGlobal, admin: DEFAULT_LIMITS.admin })
    : undefined
  const limiter = (deps.rateLimiter ?? own) as InboundRateLimiter | undefined
  const domain = inbound?.domain?.trim().toLowerCase()
  const support = inbound?.support?.trim().toLowerCase()

  function component(): InboundRefs['inbound'] {
    if (!refs.inbound) throw new TypeError('[nuxt-backend] The contact form and inbound mail need the current backend component: run `npx nuxt-backend upgrade` and deploy.')
    return refs.inbound
  }

  const findUser = async (ctx: Pick<HookCtx, 'runQuery'>, field: '_id' | 'email', value: string) => refs.adapter
    ? await ctx.runQuery(refs.adapter.findOne, { model: 'user', where: [{ field, value }] }) as { _id?: string, name?: string | null, email?: string, locale?: string | null, banned?: boolean | null } | null
    : null

  /** The tab's reads and writes are an administrator's, in person. */
  const isAdmin = (ctx: never, what: string) => reads ? isAdministratorNow(ctx, reads, administrators, what) : Promise.resolve(false)

  // --- The reply address ---------------------------------------------------

  /**
   * An address on the receiving domain that carries a person and a thread,
   * for an email's `replyTo`: the same one every time for the same pair.
   */
  async function replyAddress(ctx: Pick<HookCtx, 'runMutation'>, options: { userId: string, thread: string }): Promise<string> {
    if (!domain) throw new TypeError('[nuxt-backend] email.replyAddress needs `setupEmail({ inbound: { domain } })`: the receiving domain the address lives on.')
    if (!options.userId || !options.thread) throw new TypeError('[nuxt-backend] email.replyAddress: name the person (`userId`) and the thread.')
    const token = await ctx.runMutation(component().replyToken, { userId: options.userId, thread: options.thread })
    return replyAddressFor(token, domain)
  }

  // --- The contact form ----------------------------------------------------

  /** Refuse a production deployment that checks no one: the form is closed there, never open. */
  function requireBotCheck(): void {
    const protection = protectionEnv()
    if (isLive(backendEnvironment()) && !protection.proofSecret && !protection.challengeSecretKey) {
      throw backendError('forbidden', { reason: 'bot_check' }, '[nuxt-backend] submitContactMessage: production has no bot check set up (PROTECTION_PROOF_SECRET or PROTECTION_CHALLENGE_SECRET_KEY), so the form is refused.')
    }
  }

  /**
   * The sender of a contact message: the signed-in account, else the name and
   * address typed. An administrator acting as an account is refused: a
   * message stored as the account's own would be words it never wrote.
   */
  async function senderOf(ctx: HookCtx & { auth: GenericActionCtx<GenericDataModel>['auth'] }) {
    const identity = await ctx.auth.getUserIdentity()
    if (identity) refuseCaller(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'submitContactMessage')
    const account = identity ? await findUser(ctx, '_id', identity.subject) : null
    return { accountId: account ? identity!.subject : null, account }
  }

  const submitContactMessage = actionGeneric({
    args: {
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      message: v.string(),
      /** The honeypot: a field people never spot. A bot that fills it is told "sent", and nothing is written. */
      website: v.optional(v.string()),
      locale: v.optional(v.string()),
      human: v.optional(v.union(v.string(), v.null())),
    },
    returns: v.object({ sent: v.literal(true) }),
    handler: async (ctx, input): Promise<{ sent: true }> => {
      const { accountId, account } = await senderOf(ctx)
      const problem = contactProblem(defined({ name: input.name, email: input.email, message: input.message }) as ContactInput, { signedIn: accountId !== null })
      if (problem) throw backendError('invalid_input', { field: problem.field, reason: problem.reason }, `[nuxt-backend] submitContactMessage: ${problem.field} is ${problem.reason.replace('_', ' ')}.`)
      // A bot that fills the hidden field reads "sent": nothing is written, nothing is spent.
      if (input.website?.trim()) return { sent: true }
      const address = normalizeEmail(account ? account.email ?? '' : input.email!)
      requireBotCheck()
      await verifyHuman(ctx, input.human, { action: 'contact', subject: accountId ? undefined : address } as { action: string, subject?: string })
      if (limiter) {
        await limiter.limit(ctx as never, 'contact', { key: accountId ?? await addressDigest(address), throws: true })
        await limiter.limit(ctx as never, 'contactGlobal', { throws: true })
      }
      const name = (account ? account.name?.trim() : input.name?.trim()) || undefined
      const locale = (account?.locale || input.locale?.trim())?.slice(0, 35)
      await ctx.runMutation(component().storeContact, defined({
        userId: accountId ?? undefined,
        name,
        email: address || undefined,
        message: input.message.trim().slice(0, CONTACT_MESSAGE_MAX),
        locale,
        support,
        to: contact?.to?.trim().toLowerCase(),
      }) as never)
      return { sent: true }
    },
  })

  // --- Receiving -----------------------------------------------------------

  /** A dropped message: one log line with the reason, never the sender, the subject or the text. */
  function reject(reason: InboundRejection): void {
    logBackend('warn', 'email.inbound_rejected', `Inbound mail was dropped (reason ${reason}).`)
  }

  /** A dropped message that leaves nothing to carry on with. */
  function drop(reason: InboundRejection): null {
    reject(reason)
    return null
  }

  /**
   * Spend the deployment's inbound limit, one for each recipient a message
   * claims (each runs a hook); `false` past it. Spent only once something
   * claims the message, so mail to addresses nobody holds spends nothing.
   */
  async function withinDeployment(ctx: HookCtx, count: number): Promise<boolean> {
    return !limiter || (await limiter.limit(ctx as never, 'inboundMailGlobal', { count })).ok
  }

  /**
   * Spend the sender's own inbound limit, once the provider's results are
   * in; `false` past it. A sender that passed DMARC spends its own bucket and
   * any other a bucket apart, so mail forged in a person's name never uses up
   * theirs.
   */
  async function withinSender(ctx: HookCtx, sender: string, authentication: InboundAuthentication | null | undefined): Promise<boolean> {
    if (!limiter) return true
    const digest = await addressDigest(sender)
    return (await limiter.limit(ctx as never, 'inboundMail', { key: authentication?.dmarc === 'pass' ? digest : `unverified:${digest}` })).ok
  }

  /** Store a message once and run its hook unless the hook already finished with it. */
  async function deliver(ctx: HookCtx, stored: StoredInbound, hook: (() => Promise<void>) | undefined): Promise<void> {
    const { id, handled } = await ctx.runMutation(component().recordInbound, { message: stored })
    if (handled) return
    if (hook) await hook()
    await ctx.runMutation(component().markHandled, { id })
  }

  /** The provider's answer, or `null` when the message is already gone; any other refusal throws, so the provider delivers the event again. */
  function readOr<T>(answer: { data: T | null, error: { name?: string, statusCode?: number | null, message: string } | null }, what: string): T | null {
    if (answer.data) return answer.data
    if (isNotFound(answer.error)) {
      logBackend('warn', 'email.inbox_unread', `${what} could not be read from the email provider; it is gone.`)
      return null
    }
    throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend: ${answer.error?.message ?? 'no message'}`)
  }

  /** A recipient a reply address leads to: its token's owner, when the sender is that person and the account may still post. */
  async function acceptReply(ctx: HookCtx, token: string, recipient: string, sender: string): Promise<Accepted | null> {
    const owner = await ctx.runQuery(component().replyOf, { token })
    if (!owner) return drop('unknown_recipient')
    const person = await findUser(ctx, '_id', owner.userId)
    if (!person?.email || normalizeEmail(person.email) !== sender) return drop('sender_mismatch')
    // A banned account is refused everywhere else: its old reply addresses carry no voice either.
    if (person.banned === true) return drop('sender_mismatch')
    return { recipient, kind: 'reply', userId: owner.userId, thread: owner.thread }
  }

  /** A recipient a workspace's slug leads to. */
  async function acceptWorkspace(ctx: HookCtx, slug: string, recipient: string): Promise<Accepted | null> {
    const workspace = refs.adapter ? await ctx.runQuery(refs.adapter.findOne, { model: 'organization', where: [{ field: 'slug', value: slug }] }) as { _id?: string, slug?: string } | null : null
    if (!workspace?._id) return drop('unknown_recipient')
    return { recipient, kind: 'workspace', workspaceId: workspace._id, slug: workspace.slug ?? slug }
  }

  /** Whether the event's recipients on the receiving domain are claimed by nothing: reported once, unless the support inbox has them. */
  function unclaimed(recipients: ParsedAddress[], routes: Array<{ route: InboundRoute | null }>): boolean {
    if (routes.some(entry => entry.route && entry.route.kind !== 'support')) return false
    // The support inbox hands its own mail to its own event; anything else on the domain leads nowhere.
    if (!routes.some(entry => entry.route?.kind === 'support') && recipients.some(recipient => recipient.domain === domain)) reject('unknown_recipient')
    return true
  }

  /**
   * What an `email.received` event asks for: the sender, and the recipients on
   * the receiving domain that a reply address or a workspace claims, checked
   * as far as the event allows (what costs nothing goes first), with the
   * deployment's limit spent for them. `null` when there is nothing to do.
   */
  async function claim(ctx: HookCtx, data: ReceivedData): Promise<{ sender: ParsedAddress, accepted: Accepted[] } | null> {
    const recipients = addressesOf(data.to, data.cc, data.received_for)
    const routes = recipients.map(recipient => ({ recipient: recipient.address, route: routeOf(recipient.address, defined({ domain: domain!, support }) as { domain: string, support?: string }) }))
    if (unclaimed(recipients, routes)) return null
    const sender = parseAddress(data.from)
    if (!sender) return drop('dmarc')
    const accepted: Accepted[] = []
    for (const { recipient, route } of routes) {
      const target = route?.kind === 'reply'
        ? await acceptReply(ctx, route.token, recipient, sender.address)
        : route?.kind === 'workspace'
          ? await acceptWorkspace(ctx, route.slug, recipient)
          : null
      if (target) accepted.push(target)
    }
    if (!accepted.length) return null
    return await withinDeployment(ctx, accepted.length) ? { sender, accepted } : drop('rate_limited')
  }

  /** What the hooks receive and what is stored, for one recipient of a received email. */
  function received(emailId: string, sender: ParsedAddress, target: Accepted, mail: ReceivedMail): { message: InboundMessage, stored: StoredInbound } {
    const name = parseAddress(mail.headers?.from)?.name ?? sender.name
    const text = typeof mail.text === 'string' ? mail.text.slice(0, INBOUND_TEXT_MAX) : null
    const attachments = attachmentsOf(mail.attachments)
    const receivedAt = Date.parse(mail.created_at) || Date.now()
    const subject = mail.subject ?? ''
    return {
      message: { id: emailId, from: sender.address, ...defined({ name }), to: target.recipient, subject, text, html: typeof mail.html === 'string' ? mail.html : null, attachments: attachments.map(item => ({ name: item.name, size: item.size ?? null })), receivedAt },
      stored: {
        emailId,
        route: target.kind,
        to: target.recipient,
        from: sender.address,
        ...defined({ fromName: name?.slice(0, 200), text: text ?? undefined }),
        subject: subject.slice(0, 500),
        attachments,
        receivedAt,
        ...(target.kind === 'reply' ? { userId: target.userId, thread: target.thread } : { workspaceId: target.workspaceId }),
      },
    }
  }

  /** `email.received`: reply addresses and workspace addresses on the receiving domain. */
  async function receiveMail(ctx: HookCtx, data: ReceivedData): Promise<void> {
    const emailId = domain ? data.email_id : undefined
    const claimed = emailId ? await claim(ctx, data) : null
    if (!emailId || !claimed) return
    // Now the message itself, with the results of the provider's own checks.
    const mail = readOr(await providerClient().emails.receiving.get(emailId), 'A received email')
    if (!mail) return
    const authentication = (mail as { authentication?: InboundAuthentication | null }).authentication
    for (const target of claimed.accepted) {
      if (!authenticSender(authentication, { strict: target.kind === 'reply' })) {
        reject('dmarc')
        continue
      }
      if (!await withinSender(ctx, claimed.sender.address, authentication)) {
        reject('rate_limited')
        continue
      }
      const { message, stored } = received(emailId, claimed.sender, target, mail)
      const hook = target.kind === 'reply'
        ? inbound?.onReply && (() => inbound.onReply!(ctx, { userId: target.userId, thread: target.thread, message }))
        : inbound?.onWorkspaceMail && (() => inbound.onWorkspaceMail!(ctx, { workspaceId: target.workspaceId, slug: target.slug, message }))
      await deliver(ctx, stored, hook || undefined)
    }
  }

  /** The id of the support inbox, for an event that names the inbox by id and not by address. */
  async function supportInboxId(client: Resend): Promise<string | null> {
    if (!support) return null
    const known = inboxIds.get(support)
    if (known) return known
    const { data } = await client.inboxes.get(support)
    if (data) inboxIds.set(support, data.id)
    return data?.id ?? null
  }

  /** Whether a support inbox event is for the inbox this app named: it was addressed to it, or the inbox's id is. */
  async function isOurs(client: Resend, data: ReceivedData): Promise<boolean> {
    const email = data.email
    if (addressesOf(email?.to, email?.cc, email?.bcc).some(item => item.address === support)) return true
    return Boolean(data.inbox_id) && await supportInboxId(client) === data.inbox_id
  }

  /**
   * The account of a support inbox email's sender, and whether it is
   * authentic: the provider's own results when it will tell. A forgery is
   * `rejected`, and only an authenticated sender is tied to its account.
   */
  async function senderAccount(ctx: HookCtx, client: Resend, emailId: string, sender: string): Promise<{ rejected: boolean, authentication?: InboundAuthentication, userId?: string }> {
    const received = await client.emails.receiving.get(emailId)
    if (!received.data && !isNotFound(received.error)) readOr(received, 'A support inbox email')
    const authentication = (received.data as { authentication?: InboundAuthentication | null } | null)?.authentication ?? undefined
    if (received.data && !authenticSender(authentication, { strict: false })) return { rejected: true }
    const person = authentication?.dmarc === 'pass' ? await findUser(ctx, 'email', sender) : null
    return { rejected: false, ...defined({ authentication, userId: person?._id }) }
  }

  /** A support inbox email as it is stored. */
  function supportMessage(data: ReceivedData & { thread_id: string }, email: NonNullable<ReceivedData['email']> & { id: string }, sender: ParsedAddress, text: string | null, userId: string | undefined): StoredInbound {
    return {
      emailId: email.id,
      route: 'support',
      to: support!,
      from: sender.address,
      ...defined({ fromName: sender.name?.slice(0, 200), text: text ?? undefined, userId }),
      subject: (data.thread?.subject ?? email.subject ?? '').slice(0, 500),
      attachments: attachmentsOf(email.attachments),
      receivedAt: Date.parse(email.received_at ?? '') || Date.now(),
      threadId: data.thread_id,
      inboxEmailId: email.id,
    }
  }

  /** `inbox.email.received`: a message in the support inbox, or the thread a contact message became. */
  async function receiveInbox(ctx: HookCtx, data: ReceivedData): Promise<void> {
    const email = data.email
    const sender = parseAddress(email?.from)
    if (!support || !email?.id || !data.thread_id || email.direction !== 'inbound') return
    if (!sender) return reject('dmarc')
    const client = providerClient()
    if (!await isOurs(client, data)) return
    // Every message spends the deployment's limit before it costs a read at the provider, the copies this deployment sent included.
    if (!await withinDeployment(ctx, 1)) return reject('rate_limited')
    const body = readOr(await client.inboxes.threads.emails.get({ emailAddress: support, threadId: data.thread_id, emailId: email.id }), 'A support inbox email')
    if (!body) return
    const text = typeof body.text === 'string' ? body.text.slice(0, INBOUND_TEXT_MAX) : null
    const checked = await senderAccount(ctx, client, email.id, sender.address)
    if (checked.rejected) return reject('dmarc')
    // The copy of a contact message this deployment sent: its thread goes to its row in the Inbox tab, which the reference line at its foot finds. A row takes one thread, so a forged copy moves none.
    const ref = sender.address === parseAddress(readEnv('EMAIL_FROM'))?.address ? contactRefOf(text) : null
    if (ref && await ctx.runMutation(component().linkContact, { ref, threadId: data.thread_id, inboxEmailId: email.id })) return
    if (!await withinSender(ctx, sender.address, checked.authentication)) return reject('rate_limited')
    await deliver(ctx, supportMessage({ ...data, thread_id: data.thread_id }, { ...email, id: email.id }, sender, text, checked.userId), undefined)
  }

  /**
   * Handle a verified `email.received` or `inbox.email.received` event: the
   * webhook route calls it before the app's own `events` handlers. Mail the
   * options do not claim is acknowledged and ignored.
   */
  async function receive(ctx: HookCtx, event: { type: string, data: unknown }): Promise<void> {
    if (event.type === 'email.received') await receiveMail(ctx, (event.data ?? {}) as ReceivedData)
    else if (event.type === 'inbox.email.received') await receiveInbox(ctx, (event.data ?? {}) as ReceivedData)
  }

  // --- The Inbox tab -------------------------------------------------------

  const getInboxConsole = queryGeneric({
    args: {},
    handler: async (ctx): Promise<InboxConsole | null> => {
      if (!await isAdmin(ctx as never, 'getInboxConsole')) return null
      const rows = await ctx.runQuery(component().consoleRows, {})
      const accounts = new Map<string, { id: string, name: string, email: string } | null>()
      for (const id of new Set(rows.map(row => row.userId).filter((id): id is string => id !== null))) {
        const person = await findUser(ctx, '_id', id)
        accounts.set(id, person?._id ? { id, name: person.name ?? '', email: person.email ?? '' } : null)
      }
      return {
        support: support ?? null,
        rows: rows.map(({ userId, ...row }) => ({ ...row, account: userId ? accounts.get(userId) ?? null : null })),
      }
    },
  })

  const replyToInbox = actionGeneric({
    args: { kind: v.union(v.literal('contact'), v.literal('inbound')), id: v.string(), text: v.string() },
    returns: v.null(),
    handler: async (ctx, { kind, id, text }): Promise<null> => {
      if (!reads) throw new TypeError('[nuxt-backend] replyToInbox needs the backend component\'s adapter.')
      const adminId = await requireAdministratorInPerson(ctx as never, reads, administrators, 'replyToInbox')
      const reply = checkedReply(text)
      if (!reply) throw backendError('invalid_input', { field: 'text' }, '[nuxt-backend] replyToInbox: write the reply (at most 10,000 characters).')
      const target = support ? await ctx.runQuery(component().replyTarget, { kind, id }) : null
      if (!support || !target) throw backendError('invalid_input', { field: 'id', reason: support ? 'no_thread' : 'no_inbox' }, '[nuxt-backend] replyToInbox: this message is not a thread of the support inbox.')
      // An administrator's write, under the per-caller limit the admin routes spend.
      if (limiter) await limiter.limit(ctx as never, 'admin', { key: adminId, throws: true })
      // The same reply to the same message goes out once, however often the call is retried: the provider answers a repeat with the first send.
      const idempotencyKey = `nuxt-backend:inbox-reply:${kind}:${id}:${await sha256Hex(reply)}`
      const { error } = await providerClient().inboxes.threads.emails.reply({ emailAddress: support, threadId: target.threadId, emailId: target.inboxEmailId, text: reply }, { idempotencyKey })
      if (error) throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend: ${error.message}`)
      await ctx.runMutation(component().markReplied, { kind, id, by: adminId })
      return null
    },
  })

  // --- email sync ----------------------------------------------------------

  /** The support address's domain at the provider, and what it still needs. */
  async function syncDomain(client: Resend, report: InboundSyncReport, host: string): Promise<boolean> {
    const held = (await client.domains.list()).data?.data.find(item => item.name.toLowerCase() === host)
    if (!held) {
      report.todo.push(`Add ${host} as a domain at the email provider, verify it and turn on receiving: the support inbox needs a domain you hold.`)
      return false
    }
    report.domain = { name: held.name, status: held.status, receiving: held.capabilities.receiving === 'enabled' }
    if (held.status !== 'verified') report.todo.push(`Verify ${held.name} at the email provider: its DNS records are not all in place.`)
    if (!report.domain.receiving) report.todo.push(`Turn on receiving for ${held.name} at the email provider, and publish its MX record with the lowest number.`)
    return true
  }

  /** The support inbox: found, or created on a domain the account holds. */
  async function syncInbox(client: Resend, report: InboundSyncReport, address: string, domainHeld: boolean): Promise<void> {
    const known = await client.inboxes.get(address)
    if (known.data) {
      report.inbox = 'found'
      return
    }
    if (!isNotFound(known.error) || !domainHeld) return
    const made = await client.inboxes.create({ emailAddress: address, name: 'Support' })
    if (made.error) report.todo.push(`The support inbox was not created: ${made.error.message}`)
    else report.inbox = 'created'
  }

  /** The webhook behind `/email/events`: its events completed with the two inbound ones. */
  async function syncWebhook(client: Resend, report: InboundSyncReport): Promise<void> {
    const route = ((await client.webhooks.list()).data?.data ?? []).find(item => item.endpoint.endsWith('/email/events'))
    if (!route) {
      report.webhook.state = 'missing'
      report.todo.push('Create the webhook for your `/email/events` route at the email provider with the events `email.received` and `inbox.email.received`, and set its signing secret as EMAIL_WEBHOOK_SECRET.')
      return
    }
    report.webhook.id = route.id
    const have = new Set<string>(route.events ?? [])
    const added = INBOUND_EVENTS.filter(event => !have.has(event))
    if (!added.length || !route.events) return
    const updated = await client.webhooks.update(route.id, { events: [...route.events, ...added] })
    if (updated.error) report.todo.push(`The webhook's events were not completed: ${updated.error.message}`)
    else Object.assign(report.webhook, { state: 'updated', added: [...added] })
  }

  const syncInbound = internalActionGeneric({
    args: {},
    handler: async (): Promise<InboundSyncReport> => {
      const report: InboundSyncReport = { support: support ?? null, inbox: null, domain: null, webhook: { state: 'ok', id: null, added: [] }, todo: [] }
      if (!support) {
        report.todo.push('Set `inbound.support` on setupEmail to name the support inbox.')
        return report
      }
      const client = providerClient()
      const domainHeld = await syncDomain(client, report, support.slice(support.lastIndexOf('@') + 1))
      await syncInbox(client, report, support, domainHeld)
      await syncWebhook(client, report)
      return report
    },
  })

  return { replyAddress, receive, api: { submitContactMessage, getInboxConsole, replyToInbox, syncInbound } }
}
