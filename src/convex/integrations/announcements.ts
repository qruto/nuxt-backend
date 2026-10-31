import {
  actionGeneric,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  mutationGeneric,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { vAnnouncementInput } from '../announcements.js'
import { backendEnvironment } from '../delivery.js'
import type { EmailBlock } from '../email-blocks.js'
import { type EmailTopics, withTopicFooter } from '../email-preferences.js'
import type { EmailMessage, EmailRenderContext } from '../email-templates.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, ownCaller, requireAdministratorInPerson } from './access.js'
import type { Audit } from './audit.js'

// Announcements, for the app: the notice `<BackendNotices>` shows every
// signed-in person, and the admin console's Announcements tab that
// publishes it, ends it, and sends the broadcast that may go with it.
// `setupEmail` builds it and returns its functions on `email.api`.

/** Resend's own unsubscribe link, which a broadcast's template carries: the provider fills it per contact. */
export const PROVIDER_UNSUBSCRIBE_URL = '{{{RESEND_UNSUBSCRIBE_URL}}}'

/** The longest a notice's words may be: a sentence or two. */
export const ANNOUNCEMENT_MESSAGE_MAX = 280
/** The longest a broadcast's subject may be. */
const SUBJECT_MAX = 150
/** The longest a broadcast's body may be. */
const BODY_MAX = 20_000
/** The longest a link's words may be. */
const LINK_LABEL_MAX = 40
/** The furthest ahead a notice may expire. */
export const ANNOUNCEMENT_EXPIRY_MAX_MS = 90 * 24 * 60 * 60_000

/** One live announcement, as the notice shows it. */
export interface LiveAnnouncement {
  id: string
  /** The administrator's words. */
  message: string
  /** Where it links: a path of the app or an `https:` URL, and its words (the `announcement.link` label without). */
  link?: { url: string, label?: string }
  /** When it goes away by itself, epoch ms. */
  expiresAt: number
  publishedAt: number
}

/** The audience a broadcast goes to: the app's accounts under a topic, or the waitlist's launch-news contacts. */
export type AnnouncementAudience = 'accounts' | 'waitlist'

/** Where an announcement's broadcast stands: a `draft` until it is sent; `sent` once the provider has it (`sendAt` is when it goes out); `cancelled`. */
export type AnnouncementBroadcastState = 'draft' | 'creating' | 'created' | 'sent' | 'cancelled'

/** One announcement as the admin console lists it. */
export interface AnnouncementRow extends LiveAnnouncement {
  /** When an administrator ended it early. */
  endedAt?: number
  broadcast?: { audience: AnnouncementAudience, topic?: string, subject: string, body: string, state: AnnouncementBroadcastState, sendAt?: number }
}

/** The Announcements tab's data. */
export interface AnnouncementsConsole {
  announcements: AnnouncementRow[]
  /** The topics a broadcast to the accounts may go under. */
  topics: Array<{ key: string, name: string }>
  /** Whether each audience is ready at the provider: `email sync` made the accounts' segment, the waitlist's mirror its own. */
  audiences: Record<AnnouncementAudience, boolean>
  /** Whether a broadcast may be sent from this deployment: only `production` sends one. */
  canBroadcast: boolean
  /** Whether the brand has the postal address every broadcast carries. */
  postalAddress: boolean
}

/** What an announcement is published with. */
export type PublishAnnouncementInput = {
  message: string
  link?: { url: string, label?: string }
  /** When the notice goes away, epoch ms: within 90 days. */
  expiresAt: number
  /** An email to go with it, sent from the tab once it is published. */
  broadcast?: { audience: AnnouncementAudience, topic?: string, subject: string, body: string }
}

/** The announcement functions `backend/email.ts` re-exports from `email.api`. */
export interface AnnouncementsApi {
  /** The announcements the caller sees now, the newest first: `[]` signed out. */
  getAnnouncements: RegisteredQuery<'public', Record<string, never>, Promise<LiveAnnouncement[]>>
  /** The caller dismisses an announcement: it stays dismissed for them. */
  dismissAnnouncement: RegisteredMutation<'public', { id: string }, Promise<null>>
  /** The Announcements tab's data. `null` for anyone who is not an administrator now. */
  getAnnouncementsConsole: RegisteredQuery<'public', Record<string, never>, Promise<AnnouncementsConsole | null>>
  /** Publish an announcement: its notice shows at once. An administrator's, in person, with a recent sign-in. */
  publishAnnouncement: RegisteredMutation<'public', PublishAnnouncementInput, Promise<{ id: string }>>
  /** End an announcement's notice before it expires. An administrator's, in person, with a recent sign-in. */
  endAnnouncement: RegisteredMutation<'public', { id: string }, Promise<{ ended: boolean }>>
  /** Send yourself the broadcast as a transactional email, in test mode outside production. An administrator's, in person. */
  previewAnnouncement: RegisteredMutation<'public', { id: string }, Promise<{ emailId: string | null }>>
  /**
   * Send an announcement's broadcast, now or at `scheduledAt`: created at the
   * provider once and sent by its id, so a retry never sends it twice.
   * Refused outside `production`. An administrator's, in person.
   */
  sendAnnouncement: RegisteredAction<'public', { id: string, scheduledAt?: number }, Promise<{ sendAt: number | null }>>
  /** Cancel a broadcast that has not gone out. An administrator's, in person. */
  cancelAnnouncement: RegisteredAction<'public', { id: string }, Promise<{ cancelled: boolean }>>
}

type Live = { id: string, message: string, link?: { url: string, label?: string }, expiresAt: number, publishedAt: number }
type Claim
  = | { next: 'none' } | { next: 'busy' } | { next: 'done', sendAt?: number }
    | { next: 'create', audience: AnnouncementAudience, topic?: string, subject: string, body: string, claimedAt: number }
    | { next: 'send', providerId: string }

interface AnnouncementsRefs {
  announcements: {
    publish: FunctionReference<'mutation', 'internal', { message: string, link?: { url: string, label?: string }, expiresAt: number, publishedBy: string, broadcast?: { audience: AnnouncementAudience, topic?: string, subject: string, body: string } }, string>
    end: FunctionReference<'mutation', 'internal', { id: string }, boolean>
    live: FunctionReference<'query', 'internal', { userId: string }, Live[]>
    dismiss: FunctionReference<'mutation', 'internal', { id: string, userId: string }, null>
    list: FunctionReference<'query', 'internal', Record<string, never>, Array<Omit<AnnouncementRow, 'broadcast'> & { broadcast?: AnnouncementRow['broadcast'] }>>
    claimBroadcast: FunctionReference<'mutation', 'internal', { id: string }, Claim>
    broadcastCreated: FunctionReference<'mutation', 'internal', { id: string, providerId: string, claimedAt: number }, boolean>
    releaseBroadcast: FunctionReference<'mutation', 'internal', { id: string, claimedAt: number }, null>
    broadcastSent: FunctionReference<'mutation', 'internal', { id: string, sentBy: string, sendAt: number }, boolean>
    cancelBroadcast: FunctionReference<'mutation', 'internal', { id: string }, { cancelled: boolean, providerId: string | null }>
    broadcastCancelled: FunctionReference<'mutation', 'internal', { id: string }, boolean>
  }
  preferences: {
    providerIds: FunctionReference<'query', 'internal', Record<string, never>, Array<{ kind: 'topic' | 'segment', key: string, providerId: string }>>
  }
  waitlist?: {
    audience: FunctionReference<'query', 'internal', Record<string, never>, { segmentId: string, topicId: string } | null>
  }
}

/** What announcements need from `setupEmail`. */
export interface AnnouncementsDeps {
  refs: AnnouncementsRefs
  findOne: AdapterFindOne | undefined
  administrators: Administrators
  topics: EmailTopics
  address: () => string | undefined
  /** The unsubscribe page's path, from the app's paths file. */
  unsubscribePath: string
  audit: Pick<Audit, 'recordBackendEvent'> | undefined
  /** Build a message in the package's layout (`email.compose`). */
  compose: (build: (context: EmailRenderContext) => EmailMessage) => Promise<EmailMessage>
  /** Send a transactional email (`email.send`). */
  send: (ctx: Pick<GenericActionCtx<GenericDataModel>, 'runMutation'>, message: { to: string, subject: string, html?: string, text?: string }) => Promise<string | null>
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

/** A link a notice or an email may open: a path of the app, or a web page over `https:`. */
function linkProblem(link: { url: string, label?: string } | undefined): string | null {
  if (!link) return null
  const url = link.url.trim()
  const path = url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')
  if (!path && !/^https:\/\/[^\s/]+/i.test(url)) return 'a path of the app (`/pricing`) or an https: URL'
  if (url.length > 2000) return 'at most 2000 characters'
  if (link.label !== undefined && (!link.label.trim() || link.label.length > LINK_LABEL_MAX)) return `words of 1 to ${LINK_LABEL_MAX} characters`
  return null
}

/** A link with its path made absolute on `SITE_URL`, for an email. */
function absoluteUrl(url: string): string {
  if (!url.startsWith('/')) return url
  return `${(readEnv('SITE_URL') ?? '').replace(/\/+$/, '')}${url}`
}

/**
 * The broadcast's email in the package's layout: the subject as its
 * heading, the body's paragraphs, the link as a button, then the postal
 * address and the provider's unsubscribe link, which it fills per contact.
 */
async function broadcastMessage(deps: AnnouncementsDeps, broadcast: { subject: string, body: string }, link: { url: string, label?: string } | undefined, unsubscribeUrl: string): Promise<{ subject: string, html: string, text: string }> {
  const message = await deps.compose(({ t }) => {
    const paragraphs = broadcast.body.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
    const blocks: EmailBlock[] = [{ heading: broadcast.subject }, ...paragraphs.map(paragraph => ({ paragraph }))]
    if (link) blocks.push({ button: { label: link.label ?? t('email.announcement.action'), url: absoluteUrl(link.url) } })
    return { to: '', subject: broadcast.subject, blocks }
  })
  const unsubscribeLabel = (await deps.compose(({ t }) => ({ to: '', subject: t('email.layout.unsubscribe') }))).subject
  const footed = withTopicFooter({ html: message.html ?? '', text: message.text ?? '' }, { address: deps.address(), unsubscribeUrl, unsubscribeLabel })
  return { subject: broadcast.subject, html: footed.html, text: footed.text }
}

/** Why a broadcast's audience is not at the provider yet, for the log. */
function notSyncedDetail(draft: { audience: AnnouncementAudience, topic?: string }): string {
  const what = draft.audience === 'waitlist' ? 'the launch-news contacts of the waitlist are' : `the segment of the accounts, or the ${draft.topic} topic, is`
  return `[nuxt-backend] sendAnnouncement: ${what} not at the email provider yet: run npx nuxt-backend email sync.`
}

/** The provider's answer, or `unavailable` (`provider_refused`) with its words in the log. */
async function provider<T>(what: string, call: Promise<{ data: T | null, error: { message: string } | null }>): Promise<T> {
  const { data, error } = await call
  if (error || !data) {
    logBackend('warn', 'email.announcement_refused', `The email provider refused to ${what}.`, error ?? undefined)
    throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend refused to ${what}: ${error?.message ?? 'no answer'}`)
  }
  return data
}

/**
 * The announcement functions, for `setupEmail` to return on `email.api`.
 *
 * @internal
 */
export function createAnnouncements(deps: AnnouncementsDeps): AnnouncementsApi {
  const { refs, topics, administrators } = deps
  const reads = deps.findOne ? createAccessReads(deps.findOne) : null
  type Ctx = Parameters<typeof requireAdministratorInPerson>[0]

  const requireAdmin = (ctx: Ctx, what: string): Promise<string> => {
    if (!reads) throw backendError('forbidden', { reason: 'admin_only' }, `[nuxt-backend] ${what} is for administrators, and the backend component has no auth adapter to read them.`)
    return requireAdministratorInPerson(ctx, reads, administrators, what)
  }
  const record = async (ctx: Parameters<Audit['recordBackendEvent']>[0], event: { type: 'announcement.published' | 'announcement.ended' | 'announcement.sent' | 'announcement.cancelled', data: Record<string, string | boolean> }) => {
    if (deps.audit) await deps.audit.recordBackendEvent(ctx, event as never)
  }

  /** The provider's ids of the audience: its segment, and the topic it is limited to. */
  const audienceOf = async (ctx: Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>, audience: AnnouncementAudience, topic: string | undefined): Promise<{ segmentId: string, topicId: string } | null> => {
    if (audience === 'waitlist') return refs.waitlist ? await ctx.runQuery(refs.waitlist.audience, {}) : null
    const ids = await ctx.runQuery(refs.preferences.providerIds, {})
    const segmentId = ids.find(entry => entry.kind === 'segment' && entry.key === 'accounts')?.providerId
    const topicId = ids.find(entry => entry.kind === 'topic' && entry.key === topic)?.providerId
    return segmentId && topicId ? { segmentId, topicId } : null
  }

  const getAnnouncements = queryGeneric({
    args: {},
    handler: async (ctx): Promise<LiveAnnouncement[]> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return []
      return ctx.runQuery(refs.announcements.live, { userId: identity.subject })
    },
  })

  const dismissAnnouncement = mutationGeneric({
    args: { id: v.string() },
    returns: v.null(),
    handler: async (ctx, { id }) => {
      const userId = await ownCaller(ctx, 'dismissAnnouncement')
      return ctx.runMutation(refs.announcements.dismiss, { id, userId })
    },
  })

  const getAnnouncementsConsole = queryGeneric({
    args: {},
    handler: async (ctx): Promise<AnnouncementsConsole | null> => {
      if (!reads || !await isAdministratorNow(ctx, reads, administrators, 'getAnnouncementsConsole')) return null
      const ids = await ctx.runQuery(refs.preferences.providerIds, {})
      const rows = await ctx.runQuery(refs.announcements.list, {})
      return {
        announcements: rows,
        topics: Object.entries(topics).map(([key, topic]) => ({ key, name: topic.name })),
        audiences: {
          accounts: ids.some(entry => entry.kind === 'segment' && entry.key === 'accounts'),
          waitlist: refs.waitlist ? (await ctx.runQuery(refs.waitlist.audience, {})) !== null : false,
        },
        canBroadcast: backendEnvironment() === 'production',
        postalAddress: Boolean(deps.address()),
      }
    },
  })

  const publishAnnouncement = mutationGeneric({
    args: vAnnouncementInput,
    handler: async (ctx, input): Promise<{ id: string }> => {
      const adminId = await requireAdmin(ctx, 'publishAnnouncement')
      const checked = checkedInput(input, topics)
      const id = await ctx.runMutation(refs.announcements.publish, { ...checked, publishedBy: adminId })
      await record(ctx, { type: 'announcement.published', data: { announcement: id, broadcast: Boolean(checked.broadcast) } })
      return { id }
    },
  })

  const endAnnouncement = mutationGeneric({
    args: { id: v.string() },
    handler: async (ctx, { id }): Promise<{ ended: boolean }> => {
      await requireAdmin(ctx, 'endAnnouncement')
      const ended = await ctx.runMutation(refs.announcements.end, { id })
      if (ended) await record(ctx, { type: 'announcement.ended', data: { announcement: id } })
      return { ended }
    },
  })

  /** The announcement the console lists by this id, with its broadcast's words, or a refusal. */
  const broadcastOf = async (ctx: Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>, id: string) => {
    const row = (await ctx.runQuery(refs.announcements.list, {})).find(entry => entry.id === id)
    if (!row?.broadcast) throw backendError('invalid_input', { field: 'id', reason: 'no_broadcast' }, '[nuxt-backend] This announcement has no broadcast.')
    return row
  }

  const previewAnnouncement = mutationGeneric({
    args: { id: v.string() },
    handler: async (ctx, { id }): Promise<{ emailId: string | null }> => {
      await requireAdmin(ctx, 'previewAnnouncement')
      const identity = await ctx.auth.getUserIdentity()
      const to = typeof (identity as { email?: unknown } | null)?.email === 'string' ? (identity as { email: string }).email : null
      if (!to) throw backendError('invalid_input', { field: 'to' }, '[nuxt-backend] previewAnnouncement: your session names no address to send the preview to.')
      const row = await broadcastOf(ctx, id)
      // The provider fills the unsubscribe link per contact; a preview links the app's unsubscribe page.
      const message = await broadcastMessage(deps, row.broadcast!, row.link, absoluteUrl(deps.unsubscribePath))
      return { emailId: await deps.send(ctx, { to, ...message }) }
    },
  })

  type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>

  /**
   * Make the broadcast at the provider, with send off, and keep its id: a
   * claim that made nothing is let go. One lost while the provider was slow
   * (it lapsed and another send took it, or the broadcast was cancelled)
   * keeps nothing: the provider deletes what this send made, unsent, and the
   * send is refused. Resend's broadcast create takes no idempotency key.
   */
  const createBroadcast = async (ctx: ActionCtx, resend: Resend, id: string, draft: Extract<Claim, { next: 'create' }>, link: AnnouncementRow['link']): Promise<string> => {
    let providerId: string
    try {
      const audience = await audienceOf(ctx, draft.audience, draft.topic)
      if (!audience) throw backendError('not_ready', { reason: 'not_synced' }, notSyncedDetail(draft))
      const message = await broadcastMessage(deps, draft, link, PROVIDER_UNSUBSCRIBE_URL)
      const from = (draft.topic ? topics[draft.topic]?.from : undefined) ?? readEnv('EMAIL_MARKETING_FROM') ?? readEnv('EMAIL_FROM') ?? 'onboarding@resend.dev'
      const made = await provider('create the broadcast', resend.broadcasts.create({ segmentId: audience.segmentId, topicId: audience.topicId, from, name: `Announcement ${id}`, subject: message.subject, html: message.html, text: message.text } as never))
      providerId = (made as { id: string }).id
    }
    catch (error) {
      await ctx.runMutation(refs.announcements.releaseBroadcast, { id, claimedAt: draft.claimedAt })
      throw error
    }
    if (await ctx.runMutation(refs.announcements.broadcastCreated, { id, providerId, claimedAt: draft.claimedAt })) return providerId
    // A refusal is logged: an unsent draft at the provider sends nothing.
    await provider('delete the broadcast this send made', resend.broadcasts.remove(providerId)).catch(() => {})
    throw backendError('rate_limited', { retryAfter: 60_000 }, '[nuxt-backend] This broadcast was taken over by another send, or cancelled, while the email provider made it: this send sent nothing. Try again in a minute to see where it stands.')
  }

  /** Refuse a send this deployment, the brand or the time cannot take. */
  const checkSend = (scheduledAt: number | undefined): void => {
    if (backendEnvironment() !== 'production') {
      throw backendError('unavailable', { service: 'email', reason: 'test_mode' }, '[nuxt-backend] sendAnnouncement: a broadcast goes only from a production deployment. Test mode keeps mail from real people, and a broadcast reaches every contact in its segment.')
    }
    if (!deps.address()) throw backendError('not_ready', { reason: 'no_postal_address' }, '[nuxt-backend] sendAnnouncement: set `brand.address` on setupEmail: every marketing email carries your postal address.')
    if (scheduledAt !== undefined && !(Number.isFinite(scheduledAt) && scheduledAt > Date.now() + 60_000)) {
      throw backendError('invalid_input', { field: 'scheduledAt' }, '[nuxt-backend] sendAnnouncement: scheduledAt is a time at least a minute from now.')
    }
  }

  /** The provider's id of the broadcast to send, made now when it has none; when it goes out, once it was sent. */
  const claimed = async (ctx: ActionCtx, resend: Resend, id: string, link: AnnouncementRow['link']): Promise<{ providerId: string } | { sendAt: number | null }> => {
    const claim = await ctx.runMutation(refs.announcements.claimBroadcast, { id })
    if (claim.next === 'none') throw backendError('invalid_input', { field: 'id', reason: 'cancelled' }, '[nuxt-backend] The broadcast of this announcement was cancelled.')
    if (claim.next === 'busy') throw backendError('rate_limited', { retryAfter: 60_000 }, '[nuxt-backend] This broadcast is being sent; try again in a minute.')
    if (claim.next === 'done') return { sendAt: claim.sendAt ?? null }
    return { providerId: claim.next === 'send' ? claim.providerId : await createBroadcast(ctx, resend, id, claim, link) }
  }

  const sendAnnouncement = actionGeneric({
    args: { id: v.string(), scheduledAt: v.optional(v.number()) },
    handler: async (ctx, { id, scheduledAt }): Promise<{ sendAt: number | null }> => {
      const adminId = await requireAdmin(ctx, 'sendAnnouncement')
      checkSend(scheduledAt)
      const row = await broadcastOf(ctx, id)
      const resend = new Resend(readEnv('EMAIL_API_KEY'))
      const next = await claimed(ctx, resend, id, row.link)
      if ('sendAt' in next) return next
      await provider('send the broadcast', resend.broadcasts.send(next.providerId, scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt).toISOString() } : undefined))
      const sendAt = scheduledAt ?? Date.now()
      // Cancelled meanwhile: the provider deleted it before it went, and it stays cancelled.
      if (!await ctx.runMutation(refs.announcements.broadcastSent, { id, sentBy: adminId, sendAt })) return { sendAt: null }
      const { audience, topic } = row.broadcast!
      await record(ctx, { type: 'announcement.sent', data: { announcement: id, audience, ...(topic ? { topic } : {}), scheduled: scheduledAt !== undefined } })
      return { sendAt }
    },
  })

  const cancelAnnouncement = actionGeneric({
    args: { id: v.string() },
    handler: async (ctx, { id }): Promise<{ cancelled: boolean }> => {
      await requireAdmin(ctx, 'cancelAnnouncement')
      const { cancelled: draft, providerId } = await ctx.runMutation(refs.announcements.cancelBroadcast, { id })
      // A broadcast the provider holds is stopped where it waits, and cancelled here once the provider deleted it: a refusal leaves it as it was.
      const key = readEnv('EMAIL_API_KEY')
      if (providerId && key) await provider('cancel the broadcast', new Resend(key).broadcasts.remove(providerId))
      const cancelled = providerId ? await ctx.runMutation(refs.announcements.broadcastCancelled, { id }) : draft
      if (cancelled) await record(ctx, { type: 'announcement.cancelled', data: { announcement: id } })
      return { cancelled }
    },
  })

  return {
    getAnnouncements,
    dismissAnnouncement,
    getAnnouncementsConsole,
    publishAnnouncement,
    endAnnouncement,
    previewAnnouncement,
    sendAnnouncement,
    cancelAnnouncement,
  } as unknown as AnnouncementsApi
}

/** A refusal of one field of `publishAnnouncement`. */
function refuse(field: string, why: string): never {
  throw backendError('invalid_input', { field }, `[nuxt-backend] publishAnnouncement: ${why}`)
}

/** The broadcast an administrator wrote, checked and trimmed. */
function checkedBroadcast(broadcast: NonNullable<PublishAnnouncementInput['broadcast']>, topics: EmailTopics): NonNullable<PublishAnnouncementInput['broadcast']> {
  const accounts = broadcast.audience === 'accounts'
  if (accounts && (!broadcast.topic || !Object.hasOwn(topics, broadcast.topic))) refuse('topic', 'a broadcast to the accounts goes under a topic setupEmail declares, so only the people who opted in get it.')
  if (!broadcast.subject.trim() || broadcast.subject.length > SUBJECT_MAX) refuse('subject', `the subject is 1 to ${SUBJECT_MAX} characters.`)
  if (!broadcast.body.trim() || broadcast.body.length > BODY_MAX) refuse('body', `the body is 1 to ${BODY_MAX} characters.`)
  return { audience: broadcast.audience, ...(accounts ? { topic: broadcast.topic } : {}), subject: broadcast.subject.trim(), body: broadcast.body.trim() }
}

/** The input an administrator gave, checked and trimmed; a refusal names its field. */
function checkedInput(input: PublishAnnouncementInput, topics: EmailTopics): PublishAnnouncementInput {
  const message = input.message.trim()
  if (!message || message.length > ANNOUNCEMENT_MESSAGE_MAX) refuse('message', `the message is 1 to ${ANNOUNCEMENT_MESSAGE_MAX} characters.`)
  const linkIssue = linkProblem(input.link)
  if (linkIssue) refuse('link', `the link is ${linkIssue}.`)
  const now = Date.now()
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + ANNOUNCEMENT_EXPIRY_MAX_MS) refuse('expiresAt', 'the notice expires within 90 days from now.')
  const link = input.link ? { url: input.link.url.trim(), ...(input.link.label ? { label: input.link.label.trim() } : {}) } : undefined
  return {
    message,
    ...(link ? { link } : {}),
    expiresAt: input.expiresAt,
    ...(input.broadcast ? { broadcast: checkedBroadcast(input.broadcast, topics) } : {}),
  }
}
