import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  mutationGeneric,
  queryGeneric,
  type RegisteredMutation,
  type RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'
import {
  ALL_TOPICS,
  CONFIRMATION_TTL_MS,
  type EmailCaps,
  type EmailTopic,
  type EmailTopics,
  confirmationToken,
  isTimeZone,
  readConfirmationToken,
  readUnsubscribeToken,
  type ResolvedCaps,
  resolveCaps,
  type TopicState,
  topicVersion,
  unsubscribeToken,
  withTopicFooter,
} from '../email-preferences.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { normalizeEmail } from '../tokens.js'
import { authSecrets, firstVerified, liveSecrets } from '../auth-secrets.js'
import { ownCaller } from './access.js'

// The preference center, for the app: the reads and writes the profile's
// Email section, the unsubscribe page and `useEmailPreferences` call, the
// gate every send under a topic passes, and the RFC 8058 one-click route.
// `setupEmail` builds it from its `topics` and `caps` and returns its parts.

export type { ClockTime, EmailCaps, EmailTopic, EmailTopics, TopicSource, TopicState } from '../email-preferences.js'

type RunMutationCtx = Pick<GenericActionCtx<GenericDataModel>, 'runMutation'>
type RunQueryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>

/** The topic a call passes the component: its key, its default, and the words a consent records. */
interface TopicArg { key: string, subscribedByDefault: boolean, consent?: { version: string, text: string } }

interface PreferencesRefs {
  read: FunctionReference<'query', 'internal', { userId?: string, email?: string, topics: Array<{ key: string, subscribedByDefault: boolean }> }, { contactId: string | null, topics: Array<{ key: string, state: TopicState }> }>
  readContact: FunctionReference<'query', 'internal', { contactId: string, topics: Array<{ key: string, subscribedByDefault: boolean }> }, Array<{ key: string, state: TopicState }> | null>
  choose: FunctionReference<'mutation', 'internal', { email: string, userId?: string, topic: TopicArg & { doubleOptIn: boolean }, subscribe: boolean, source: string, reference?: string }, { contactId: string, state: TopicState, changed: boolean }>
  confirm: FunctionReference<'mutation', 'internal', { contactId: string, topic: TopicArg }, 'confirmed' | 'nothing'>
  unsubscribe: FunctionReference<'mutation', 'internal', { contactId?: string, userId?: string, topic: string, topics: TopicArg[], source: string }, boolean>
  providerTopics: FunctionReference<'mutation', 'internal', { email: string, at?: number, topics: Array<{ id: string, subscription: string }> }, number>
  providerContact: FunctionReference<'mutation', 'internal', { email: string, unsubscribed: boolean, at?: number, topics: TopicArg[] }, number>
  gate: FunctionReference<'mutation', 'internal', { email: string, userId?: string, topic?: { key: string, subscribedByDefault: boolean }, caps: ResolvedCaps, sunset?: boolean }, { outcome: 'send', contactId: string, at: number | null } | { outcome: 'skipped', reason: 'unsubscribed' | 'capped' | 'sunset' }>
  engaged: FunctionReference<'mutation', 'internal', { email?: string, userId?: string }, null>
  seen: FunctionReference<'mutation', 'internal', { userId: string, email: string, timeZone?: string }, null>
}

/** One topic as a person's preferences show it. */
export interface EmailTopicPreference {
  key: string
  name: string
  description: string
  /** Whether the person gets the topic's email. */
  subscribed: boolean
  /** Asked to join, waiting for the confirmation click of a double opt-in. */
  pending: boolean
}

/** What an unsubscribe or confirmation link opens: the topic it names (`null` for every topic) and where it stands. */
export interface EmailLinkView {
  kind: 'unsubscribe' | 'confirm'
  /** The topic, or `null` for an unsubscribe link from every topic. */
  topic: { key: string, name: string, description: string } | null
  /** For an unsubscribe link: whether the person still gets the topic's email (any topic, for every topic). */
  subscribed: boolean
}

/** The preference center's public functions, which `backend/email.ts` re-exports from `email.api`. */
export interface EmailPreferencesApi {
  /** The caller's topics, with their words and the caller's choice. `null` signed out. */
  getEmailPreferences: RegisteredQuery<'public', Record<string, never>, Promise<EmailTopicPreference[] | null>>
  /** The caller joins or leaves one topic. Joining a topic with double opt-in sends its confirmation and answers `pending`. */
  setEmailTopic: RegisteredMutation<'public', { topic: string, subscribed: boolean }, Promise<{ state: TopicState }>>
  /** The caller leaves every topic. */
  unsubscribeAllTopics: RegisteredMutation<'public', Record<string, never>, Promise<null>>
  /** What an unsubscribe link (`token`) or a confirmation link (`confirm`) names; `null` for one that does not work. Anyone may read it: the token is the proof. */
  getEmailLink: RegisteredQuery<'public', { token?: string, confirm?: string }, Promise<EmailLinkView | null>>
  /** Leave the topic an unsubscribe link names, or every topic with `all`. Answers `true` whether or not the link named anyone, so it reveals nothing. */
  unsubscribeByLink: RegisteredMutation<'public', { token: string, all?: boolean }, Promise<boolean>>
  /** The confirmation click of a double opt-in: `confirmed`, or `nothing` for a link used, lapsed or unknown. */
  confirmEmailTopic: RegisteredMutation<'public', { confirm: string }, Promise<'confirmed' | 'nothing'>>
  /** The time zone of the caller's browser, which quiet hours read. The sign-in flow calls it. */
  recordTimeZone: RegisteredMutation<'public', { timeZone: string }, Promise<null>>
}

/** What `setupEmail` builds from its `topics` and `caps`. */
export interface EmailPreferences {
  topics: EmailTopics
  caps: ResolvedCaps
  /** Decide one send: the address gets it, at `at` when quiet hours hold it (with the `hold` its release checks again), with its unsubscribe headers and footer; or `null` and the log line. */
  prepare: <M extends { to: string | string[], html?: string, text?: string, headers?: Array<{ name: string, value: string }>, from?: string }>(ctx: RunMutationCtx & Partial<RunQueryCtx>, message: M, topic: string | undefined, locale: (email: string) => Promise<{ unsubscribe: string }>, options?: { sunset?: boolean, unsubscribeAll?: boolean }) => Promise<(M & { deliverAt?: number, hold?: { contactId: string, topic: { key: string, subscribedByDefault: boolean } } }) | null>
  /** The person clicked an email (the provider's `email.clicked`), or used the app: the sunset rule restarts. */
  engaged: (ctx: RunMutationCtx, who: { email?: string, userId?: string }) => Promise<void>
  /** A choice the provider reports (`contact.topics.updated`), made at `at` (the event's time). */
  providerTopics: (ctx: RunMutationCtx, data: unknown, at?: number) => Promise<void>
  /** A change of the provider's contact (`contact.updated`): unsubscribed from everything there leaves every topic. */
  providerContact: (ctx: RunMutationCtx, data: unknown, at?: number) => Promise<void>
  /** The RFC 8058 route's handler: `GET` sends the reader to the unsubscribe page, `POST` unsubscribes at once. */
  unsubscribeHandler: (ctx: RunMutationCtx, request: Request) => Promise<Response>
  /** Join a paying customer to every topic with `softOptIn`, unless they objected at checkout; the consent ledger keeps the checkout it came from. */
  softOptIn: (ctx: RunMutationCtx, customer: { email: string, userId?: string, objected: boolean, checkoutId?: string }) => Promise<void>
  api: EmailPreferencesApi
}

/** What the preference center needs from `setupEmail`. */
export interface EmailPreferencesDeps {
  refs: PreferencesRefs
  topics: EmailTopics
  caps: EmailCaps
  /** The postal address the footer of every topic email carries. */
  address: () => string | undefined
  /** The unsubscribe page's path, from the app's paths file: the links in an email open it. */
  unsubscribePath: string
  /** Send the double opt-in's confirmation. */
  sendConfirmation: (ctx: RunMutationCtx & Partial<RunQueryCtx>, data: { email: string, topic: string, confirmUrl: string }) => Promise<unknown>
}

/** Log why a send was skipped: the rule, never the address. */
function logSkipped(reason: 'unsubscribed' | 'capped' | 'sunset', topic: string | undefined): void {
  const under = topic ? ` under the ${topic} topic` : ''
  if (reason === 'unsubscribed') logBackend('info', 'email.skipped_unsubscribed', `An email${under} was not sent: its recipient is not in the topic.`)
  else if (reason === 'capped') logBackend('info', 'email.skipped_capped', `An email${under} was not sent: its recipient reached the weekly cap.`)
  else logBackend('info', 'email.skipped_sunset', `An email${under} was not sent: its recipient has not engaged for the sunset period.`)
}

/** The deployment's RFC 8058 route. */
export const UNSUBSCRIBE_ROUTE = '/email/unsubscribe'

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

/** The secrets links are checked against, current first: `AUTH_SECRET`'s, which the deploy requires. A rotation's previous secret still verifies the links it signed. */
function linkSecrets(): string[] {
  const secrets = liveSecrets(authSecrets())
  if (secrets.length === 0) throw backendError('unavailable', { service: 'email', reason: 'unconfigured' }, '[nuxt-backend] AUTH_SECRET is not set on the deployment: unsubscribe links cannot be signed.')
  return secrets
}

/** The secret new links are signed with: the current one. */
function linkSecret(): string {
  return linkSecrets()[0]!
}

/** What an unsubscribe token names, checked against every live secret. */
function readUnsubscribe(token: string, secrets: readonly string[] = linkSecrets()) {
  return firstVerified(secrets, secret => readUnsubscribeToken(secret, token))
}

/** What a confirmation token names, checked against every live secret. */
function readConfirmation(token: string, secrets: readonly string[] = linkSecrets()) {
  return firstVerified(secrets, secret => readConfirmationToken(secret, token))
}

/** An origin without its trailing slash, or `''`. */
function originOf(url: string | undefined): string {
  return (url ?? '').trim().replace(/\/+$/, '')
}

/** The app's unsubscribe page at `path`, for a token. */
function pageUrl(path: string, query: string): string {
  return `${originOf(readEnv('SITE_URL'))}${path}?${query}`
}

/**
 * The preference center over the component's copy of each person's choices.
 * Internal: `setupEmail` calls it with its own `topics` and `caps`.
 *
 * @internal
 */
export function createEmailPreferences(deps: EmailPreferencesDeps): EmailPreferences {
  const { refs, topics } = deps
  const caps = resolveCaps(deps.caps)
  const keys = Object.keys(topics)
  const refsOf = () => keys.map(key => ({ key, subscribedByDefault: topics[key]!.subscribedByDefault }))
  const versions = new Map<string, Promise<string>>()
  const versionOf = (key: string) => {
    if (!versions.has(key)) versions.set(key, topicVersion(topics[key]!))
    return versions.get(key)!
  }
  /** A topic as a write passes it: with the words a consent records. */
  const topicArg = async (key: string): Promise<TopicArg> => ({
    key,
    subscribedByDefault: topics[key]!.subscribedByDefault,
    consent: { version: await versionOf(key), text: topics[key]!.description },
  })
  const allArgs = () => Promise.all(keys.map(topicArg))
  const declared = (key: string, what: string): EmailTopic => {
    if (!Object.hasOwn(topics, key)) {
      throw backendError('invalid_input', { field: 'topic' }, `[nuxt-backend] ${what}: \`${key}\` is no topic \`setupEmail({ topics })\` declares${keys.length ? ` (${keys.map(k => `\`${k}\``).join(', ')})` : ''}.`)
    }
    return topics[key]!
  }

  /** A declared topic as the gate and a held send read it. */
  const topicRef = (key: string) => ({ key, subscribedByDefault: topics[key]!.subscribedByDefault })

  /** The one address a gated send goes to: its unsubscribe link is that person's own. */
  const recipientOf = (to: string | string[]): string => {
    const recipients = Array.isArray(to) ? to : [to]
    if (recipients.length !== 1) {
      throw backendError('invalid_input', { field: 'to' }, '[nuxt-backend] send: an email under a topic goes to one address, so its unsubscribe link is that person\'s own. Send one per recipient.')
    }
    return normalizeEmail(recipients[0]!)
  }

  /** The message's headers with the RFC 8058 pair for this token, in place of any it had. */
  const unsubscribeHeaders = (headers: Array<{ name: string, value: string }> | undefined, token: string) => [
    ...(headers ?? []).filter(header => !/^list-unsubscribe(?:-post)?$/i.test(header.name)),
    { name: 'List-Unsubscribe', value: `<${originOf(readEnv('CONVEX_SITE_URL'))}${UNSUBSCRIBE_ROUTE}?token=${encodeURIComponent(token)}>` },
    { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
  ]

  const prepare: EmailPreferences['prepare'] = async (ctx, message, topic, locale, options = {}) => {
    if (topic !== undefined) declared(topic, 'send')
    const email = recipientOf(message.to)
    const decision = await ctx.runMutation(refs.gate, { email, ...(topic ? { topic: topicRef(topic) } : {}), caps, ...(options.sunset === false ? { sunset: false } : {}) })
    if (decision.outcome === 'skipped') {
      logSkipped(decision.reason, topic)
      return null
    }
    const at = decision.at !== null && decision.at > Date.now() ? decision.at : null
    if (!topic && !options.unsubscribeAll) return { ...message, ...(at !== null ? { deliverAt: at } : {}) }
    // A held send asks the topic again as it goes: the person may leave it meanwhile.
    const deliverAt = at !== null ? { deliverAt: at, ...(topic ? { hold: { contactId: decision.contactId, topic: topicRef(topic) } } : {}) } : {}
    return { ...await withUnsubscribe(message, { email, contactId: decision.contactId, topic, locale }), ...deliverAt }
  }

  /**
   * A message that owes its reader a way out: the RFC 8058 headers, the
   * marketing sender and the footer with the postal address and the
   * unsubscribe link. Under no topic (an invitation by address), the link
   * leaves everything.
   */
  async function withUnsubscribe<M extends { html?: string, text?: string, headers?: Array<{ name: string, value: string }>, from?: string }>(message: M, { email, contactId, topic, locale }: { email: string, contactId: string, topic: string | undefined, locale: (email: string) => Promise<{ unsubscribe: string }> }): Promise<M> {
    const token = await unsubscribeToken(linkSecret(), contactId, topic ?? ALL_TOPICS)
    const from = message.from ?? (topic ? topics[topic]!.from : undefined) ?? readEnv('EMAIL_MARKETING_FROM')
    const footed = withTopicFooter(message, { address: deps.address(), unsubscribeUrl: pageUrl(deps.unsubscribePath, `token=${encodeURIComponent(token)}`), unsubscribeLabel: (await locale(email)).unsubscribe })
    return { ...footed, headers: unsubscribeHeaders(message.headers, token), ...(from ? { from } : {}) }
  }

  const engaged: EmailPreferences['engaged'] = async (ctx, who) => {
    if (!who.email && !who.userId) return
    await ctx.runMutation(refs.engaged, { ...(who.email ? { email: normalizeEmail(who.email) } : {}), ...(who.userId ? { userId: who.userId } : {}) })
  }

  const providerTopics: EmailPreferences['providerTopics'] = async (ctx, data, at) => {
    const { email, topics: changed } = (data ?? {}) as { email?: unknown, topics?: unknown }
    if (typeof email !== 'string' || !Array.isArray(changed)) return
    const entries = changed.filter((entry): entry is { id: string, subscription: string } => typeof entry?.id === 'string' && typeof entry?.subscription === 'string')
    await ctx.runMutation(refs.providerTopics, { email: normalizeEmail(email), ...(at !== undefined ? { at } : {}), topics: entries.slice(0, 100) })
  }

  const providerContact: EmailPreferences['providerContact'] = async (ctx, data, at) => {
    const { email, unsubscribed } = (data ?? {}) as { email?: unknown, unsubscribed?: unknown }
    if (typeof email !== 'string' || typeof unsubscribed !== 'boolean') return
    await ctx.runMutation(refs.providerContact, { email: normalizeEmail(email), unsubscribed, ...(at !== undefined ? { at } : {}), topics: await allArgs() })
  }

  /** Leave the topic a verified token names, or every topic. */
  const leaveByToken = async (ctx: RunMutationCtx, token: string, all: boolean, source: string): Promise<boolean> => {
    const named = await readUnsubscribe(token)
    if (!named) return false
    const topic = all || named.topic === ALL_TOPICS || !Object.hasOwn(topics, named.topic) ? ALL_TOPICS : named.topic
    return ctx.runMutation(refs.unsubscribe, { contactId: named.contactId, topic, topics: await allArgs(), source })
  }

  const unsubscribeHandler: EmailPreferences['unsubscribeHandler'] = async (ctx, request) => {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') ?? ''
    // Mail scanners open every link: a GET changes nothing, and sends the reader to the page that asks.
    if (request.method === 'GET') {
      return new Response(null, { status: 302, headers: { 'Location': pageUrl(deps.unsubscribePath, token ? `token=${encodeURIComponent(token)}` : ''), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
    }
    try {
      if (token.length > 0 && token.length <= 256) await leaveByToken(ctx, token, false, 'one-click')
    }
    catch (error) {
      // The status says nothing about an address; the failure is logged, and the mail client may try again.
      logBackend('warn', 'email.preferences_unsynced', 'A one-click unsubscribe could not be written; the request answered 500 so the mail client tries again.', error)
      return new Response(null, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const softOptIn: EmailPreferences['softOptIn'] = async (ctx, { email, userId, objected, checkoutId }) => {
    if (objected) return
    for (const key of keys.filter(key => topics[key]!.softOptIn)) {
      await ctx.runMutation(refs.choose, { email: normalizeEmail(email), ...(userId ? { userId } : {}), topic: { ...(await topicArg(key)), doubleOptIn: false }, subscribe: true, source: 'soft-opt-in', ...(checkoutId ? { reference: `checkout:${checkoutId}` } : {}) })
    }
  }

  // ── The public functions ─────────────────────────────────────────────

  /** The caller's account and address, or the refusal. */
  const caller = async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string, email?: string } | null> } }, what: string) => {
    const userId = await ownCaller(ctx, what)
    const email = (await ctx.auth.getUserIdentity())?.email
    if (typeof email !== 'string' || !email) throw backendError('invalid_input', { field: 'email' }, `[nuxt-backend] ${what}: the account has no email address.`)
    return { userId, email: normalizeEmail(email) }
  }

  const getEmailPreferences = queryGeneric({
    args: {},
    handler: async (ctx): Promise<EmailTopicPreference[] | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const { userId, email } = await caller(ctx, 'getEmailPreferences')
      const read = await ctx.runQuery(refs.read, { userId, email, topics: refsOf() })
      const states = new Map(read.topics.map(entry => [entry.key, entry.state]))
      return keys.map(key => ({
        key,
        name: topics[key]!.name,
        description: topics[key]!.description,
        subscribed: states.get(key) === 'subscribed',
        pending: states.get(key) === 'pending',
      }))
    },
  })

  const setEmailTopic = mutationGeneric({
    args: { topic: v.string(), subscribed: v.boolean() },
    handler: async (ctx, args): Promise<{ state: TopicState }> => {
      const { userId, email } = await caller(ctx, 'setEmailTopic')
      const topic = declared(args.topic, 'setEmailTopic')
      const result = await ctx.runMutation(refs.choose, { email, userId, topic: { ...(await topicArg(args.topic)), doubleOptIn: topic.doubleOptIn === true }, subscribe: args.subscribed, source: 'profile' })
      if (result.state === 'pending' && result.changed) {
        const confirm = await confirmationToken(linkSecret(), result.contactId, args.topic, Date.now() + CONFIRMATION_TTL_MS)
        await deps.sendConfirmation(ctx, { email, topic: topic.name, confirmUrl: pageUrl(deps.unsubscribePath, `confirm=${encodeURIComponent(confirm)}`) })
      }
      return { state: result.state }
    },
  })

  const unsubscribeAllTopics = mutationGeneric({
    args: {},
    handler: async (ctx): Promise<null> => {
      const { userId } = await caller(ctx, 'unsubscribeAllTopics')
      await ctx.runMutation(refs.unsubscribe, { userId, topic: ALL_TOPICS, topics: await allArgs(), source: 'profile' })
      return null
    },
  })

  const wordsOf = (key: string) => ({ key, name: topics[key]!.name, description: topics[key]!.description })

  const getEmailLink = queryGeneric({
    args: { token: v.optional(v.string()), confirm: v.optional(v.string()) },
    handler: async (ctx, { token, confirm }): Promise<EmailLinkView | null> => {
      const secrets = liveSecrets(authSecrets())
      if (secrets.length === 0) return null
      if (confirm) {
        const named = confirm.length <= 256 ? await readConfirmation(confirm, secrets) : null
        if (!named || !Object.hasOwn(topics, named.topic)) return null
        return { kind: 'confirm', topic: wordsOf(named.topic), subscribed: false }
      }
      const named = token && token.length <= 256 ? await readUnsubscribe(token, secrets) : null
      if (!named) return null
      const states = await ctx.runQuery(refs.readContact, { contactId: named.contactId, topics: refsOf() })
      // A link whose contact is gone reads as a working one with nothing left to leave.
      const topic = named.topic !== ALL_TOPICS && Object.hasOwn(topics, named.topic) ? named.topic : null
      const subscribed = (states ?? []).some(entry => entry.state !== 'unsubscribed' && (topic === null || entry.key === topic))
      return { kind: 'unsubscribe', topic: topic ? wordsOf(topic) : null, subscribed }
    },
  })

  const unsubscribeByLink = mutationGeneric({
    args: { token: v.string(), all: v.optional(v.boolean()) },
    handler: async (ctx, { token, all }): Promise<boolean> => {
      if (token.length > 256) throw backendError('invalid_input', { field: 'token' }, '[nuxt-backend] unsubscribeByLink: this link does not work.')
      if (!await readUnsubscribe(token)) throw backendError('invalid_input', { field: 'token' }, '[nuxt-backend] unsubscribeByLink: this link does not work.')
      await leaveByToken(ctx, token, all === true, 'unsubscribe-page')
      return true
    },
  })

  const confirmEmailTopic = mutationGeneric({
    args: { confirm: v.string() },
    handler: async (ctx, { confirm }): Promise<'confirmed' | 'nothing'> => {
      const named = confirm.length <= 256 ? await readConfirmation(confirm) : null
      if (!named || !Object.hasOwn(topics, named.topic)) return 'nothing'
      return ctx.runMutation(refs.confirm, { contactId: named.contactId, topic: await topicArg(named.topic) })
    },
  })

  const recordTimeZone = mutationGeneric({
    args: { timeZone: v.string() },
    handler: async (ctx, { timeZone }): Promise<null> => {
      const { userId, email } = await caller(ctx, 'recordTimeZone')
      await ctx.runMutation(refs.seen, { userId, email, ...(isTimeZone(timeZone) ? { timeZone } : {}) })
      return null
    },
  })

  return {
    topics,
    caps,
    prepare,
    engaged,
    providerTopics,
    providerContact,
    unsubscribeHandler,
    softOptIn,
    api: { getEmailPreferences, setEmailTopic, unsubscribeAllTopics, getEmailLink, unsubscribeByLink, confirmEmailTopic, recordTimeZone } as EmailPreferencesApi,
  }
}
