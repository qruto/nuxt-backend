import { RateLimiter } from '@convex-dev/rate-limiter'
import { Resend } from 'resend'
import { actionGeneric, type FunctionReference, mutationGeneric, queryGeneric, type RegisteredAction, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { admissionEmail, admissionProblem, type AccessPhase } from '../access-tickets.js'
import { firstVerified } from '../auth-secrets.js'
import { readEnv } from '../delivery.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import {
  addressDigest,
  answersProblem,
  checkedQuestions,
  DEFAULT_BOOST,
  readStatusToken,
  SOURCE_FORM,
  WAITLIST_SOURCE_MAX,
  WAITLIST_STATUSES,
  WAITLIST_WAVE_MAX,
  type WaitlistQuestions,
  type WaitlistStatus,
} from '../waitlist-rules.js'
import type { Email } from './email.js'
import { verifyHuman } from './functions.js'
import type { Access, AccessComponents, AccessCtx } from './launch.js'
import { DEFAULT_LIMITS } from './rate-limit.js'

// The waitlist: what `backend/waitlist.ts` builds with `setupWaitlist`. The
// rows, the queue and the launch-news mirror live in the `backend`
// component (`components/backend/waitlist.ts`); the sign-in hooks record an
// entry when a new address's code checks in early access
// (`client/launch-gate.ts`, through `setupAccess`'s gate). This file holds
// what the app serves: the join, a place by its signed link, leaving, and
// the Waitlist tab's functions.

/** One person's standing, as their status page reads it. */
export interface WaitlistStatusView {
  status: WaitlistStatus
  /** The place among the people waiting, 1-based; `null` once the person is no longer waiting. */
  position: number | null
  /** How many people wait. */
  total: number
  /** The friends who joined through their link and count, up to `cap`. */
  friends: number
  /** The most friends that count for one person. */
  cap: number
  /** The code of their share link: `?ref=<shareCode>` on the page that holds the form. */
  shareCode: string
  /** Whether they asked for launch news. */
  launchNews: boolean
}

/** What a join leaves behind in `useWaitlist` and the form's `joined` event: the place a verified address holds. */
export interface WaitlistPlace extends WaitlistStatusView {
  /** The signed token of the status link, `/waitlist#<token>`. */
  token: string
}

/** One entry as the Waitlist tab lists it. */
export interface WaitlistEntryRow {
  id: string
  email: string
  status: WaitlistStatus
  source: string
  answers: Record<string, string>
  locale: string | null
  note: string | null
  /** When the code proved the address, epoch ms. */
  verifiedAt: number
  /** The friends who joined through its link. */
  boost: number
  /** Whether it asked for launch news. */
  launchNews: boolean
  /** The state of its contact at the email provider: `pending`, `synced`, `drift` or `skipped`; `null` without launch news. */
  mirror: string | null
  /** `abuse` for an entry removed as abuse. */
  declinedFor: string | null
}

/** Everything the Waitlist tab shows. */
export interface WaitlistConsole {
  counts: Record<WaitlistStatus, number>
  /** The contacts waiting to be written to the email provider, and those that drifted from their entries. */
  mirror: { pending: number, drift: number }
  /** The oldest entries of the chosen status (waiting by default), at most 200. */
  entries: WaitlistEntryRow[]
  /** The questions the app asks, with their choices: the filter's. */
  questions: WaitlistQuestions
}

/** The room a wave has, read from the services that bound it. */
export interface WaitlistCaps {
  /** The sign-in codes new addresses may still ask for this hour; `null` when no rate limiter is mounted. */
  codes: { left: number, limit: number } | null
  /** The email plan's quota for today; `null` when the provider's usage could not be read. */
  emails: { used: number, limit: number | null } | null
}

/** The public functions `backend/waitlist.ts` re-exports. */
export interface WaitlistApi {
  /** The questions the form asks beside the address, with their choices, for `useWaitlist` and `<WaitlistForm>`. Anyone may read them. */
  getWaitlistQuestions: RegisteredQuery<'public', Record<string, never>, Promise<WaitlistQuestions>>
  /**
   * Begin a join: check the phase, the answers and the bot check, and keep
   * the answers until the sign-in code proves the address. A public action
   * (the bot check needs `fetch`). The client then asks for the code, which
   * spends `signUpOtpGlobal`. Refused as `invalid_input` on a question's
   * field, `forbidden` (reason `bot_check`, or `waitlist_closed` outside
   * early access) or `rate_limited`.
   */
  joinWaitlist: RegisteredAction<'public', { email: string, answers?: Record<string, string>, launchNews?: boolean, launchNewsText?: string, source?: string, ref?: string, locale?: string, human?: string | null }, Promise<{ join: string }>>
  /** A person's standing, by the signed token of their status link; `null` for a token that was not signed here or an entry that is gone. */
  waitlistStatus: RegisteredQuery<'public', { token: string }, Promise<WaitlistStatusView | null>>
  /** Leave the list by the signed token: the entry and the contact are removed. */
  leaveWaitlist: RegisteredMutation<'public', { token: string }, Promise<null>>
  /** The Waitlist tab. `null` for anyone who is not an administrator now. */
  getWaitlistConsole: RegisteredQuery<'public', { status?: WaitlistStatus, domain?: string, source?: string, question?: string, answer?: string }, Promise<WaitlistConsole | null>>
  /** Admit entries by id, or the next `next` in line. An administrator's, in person, with a recent sign-in; each gets one "You're in" email. */
  admitWaitlist: RegisteredMutation<'public', { ids?: string[], next?: number }, Promise<{ admitted: number }>>
  /** Decline entries, or remove them as abuse (which takes back what they gave the friends who shared with them). An administrator's, in person, with a recent sign-in. */
  declineWaitlist: RegisteredMutation<'public', { ids: string[], abuse?: boolean }, Promise<{ declined: number }>>
  /** Keep a note on an entry. An administrator's, in person, with a recent sign-in. */
  noteWaitlist: RegisteredMutation<'public', { id: string, note: string }, Promise<null>>
  /** The room a wave has. `null` for anyone who is not an administrator now. */
  getWaitlistCaps: RegisteredAction<'public', Record<string, never>, Promise<WaitlistCaps | null>>
}

/** The app's waitlist, from {@link setupWaitlist}. */
export interface Waitlist {
  /** The questions asked beside the address. */
  questions: WaitlistQuestions
  /** The public functions `backend/waitlist.ts` re-exports. */
  api: WaitlistApi
  /**
   * The people who asked for launch news, as the email provider holds them:
   * the ids of the segment and the topic the mirror writes to, for a launch
   * announcement. `null` before the first contact is written.
   */
  launchAudience: (ctx: Pick<AccessCtx, 'runQuery'>) => Promise<{ segmentId: string, topicId: string } | null>
}

export interface SetupWaitlistOptions {
  /** The `setupAccess` instance the waitlist is built on: its phases, its administrators and its tickets. */
  access: Access
  /** The app's `setupEmail` instance: the "You're in" email goes through it, so its overrides restyle it. */
  email: Pick<Email, 'sendTemplate'>
  /** Questions asked beside the address: each key holds the choices an answer must be one of (at most 5 questions of 20 choices). */
  questions?: WaitlistQuestions
  /**
   * Your `setupRateLimiter` instance, for the join's limits (`waitlistJoin`,
   * `waitlistJoinGlobal`). Default: the rate limiter component mounted as
   * `rateLimiter`, with the package's limits.
   */
  rateLimiter?: { limit: (ctx: { runQuery: never, runMutation: never }, name: 'waitlistJoin' | 'waitlistJoinGlobal', options?: { key?: string, throws?: boolean }) => Promise<{ ok: boolean, retryAfter?: number }> }
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config: the "You're in" email links an admitted person to
   * `{SITE_URL}{paths.login}` (`pages.login`, `/login` by default).
   */
  paths?: Partial<BackendPaths>
}

interface WaitlistRefs {
  waitlist: {
    stage: FunctionReference<'mutation', 'internal', { email: string, key: string, answers?: Record<string, string>, launchNews?: { text: string }, source: string, ref?: string, locale?: string }, null>
    place: FunctionReference<'query', 'internal', { id: string }, { status: WaitlistStatus, position: number | null, total: number, boost: number, shareCode: string, launchNews: boolean } | null>
    leave: FunctionReference<'mutation', 'internal', { id: string }, null>
    queue: FunctionReference<'query', 'internal', { limit: number }, string[]>
    admit: FunctionReference<'mutation', 'internal', { ids: string[], max?: number, label?: string, createdBy?: string }, Array<{ id: string, email: string, locale: string | null }>>
    decline: FunctionReference<'mutation', 'internal', { ids: string[], abuse?: boolean }, number>
    note: FunctionReference<'mutation', 'internal', { id: string, note: string }, null>
    consoleRows: FunctionReference<'query', 'internal', { status?: WaitlistStatus, domain?: string, source?: string, question?: string, answer?: string }, Omit<WaitlistConsole, 'questions'>>
    audience: FunctionReference<'query', 'internal', Record<string, never>, { segmentId: string, topicId: string } | null>
  }
}

/** What an admission names: the entries or how many are next, within a wave. */
function checkedWave(ids: string[] | undefined, next: number | undefined): void {
  if (next !== undefined && (!Number.isInteger(next) || next < 1 || next > WAITLIST_WAVE_MAX)) {
    throw backendError('invalid_input', { field: 'next' }, `[nuxt-backend] admitWaitlist: next is a whole number from 1 to ${WAITLIST_WAVE_MAX}.`)
  }
  if (ids && ids.length > WAITLIST_WAVE_MAX) throw backendError('invalid_input', { field: 'ids', reason: 'too_many' }, `[nuxt-backend] admitWaitlist: at most ${WAITLIST_WAVE_MAX} entries at a time.`)
  if (!ids && next === undefined) throw backendError('invalid_input', { field: 'ids' }, '[nuxt-backend] admitWaitlist: pass the entries (`ids`) or how many are next (`next`).')
}

/** The words of the launch-news box the person agreed to, kept with the time as the record of consent: the form sends the ones it showed, else these. */
const LAUNCH_NEWS_TEXT = 'Email me when it launches'

/** The most characters of those words kept. */
const LAUNCH_NEWS_TEXT_MAX = 200

/** The source of a join, when the form names one: short, and plain. */
const SOURCE_SHAPE = /^[\w.:/-]+$/

/** Whether `site` is an app URL to link people to. */
const siteUrl = (): string | undefined => readEnv('SITE_URL')?.replace(/\/+$/, '')

/**
 * Run a waitlist for early access: joins proven by the sign-in code (the
 * double opt-in), a place for everyone waiting, a boost for each friend who
 * joins through their link, waves an administrator admits from the console's
 * Waitlist tab, and a mirror of the people who asked for launch news to the
 * email provider. It is built on {@link Access}: an app whose phases
 * include `early-access` records an entry whenever a new address's code
 * checks, and an admitted entry is a ticket.
 *
 * @example
 * ```ts [backend/waitlist.ts]
 * import { setupWaitlist } from 'nuxt-backend/access'
 * import { components } from './_generated/api'
 * import { access } from './access'
 * import { email } from './email'
 * import { paths } from './paths.generated'
 *
 * export const waitlist = setupWaitlist(components, {
 *   access,
 *   email,
 *   paths,
 *   questions: { role: ['Writer', 'Illustrator', 'Reader'] },
 * })
 *
 * export const { getWaitlistQuestions, joinWaitlist, waitlistStatus, leaveWaitlist, getWaitlistConsole, admitWaitlist, declineWaitlist, noteWaitlist, getWaitlistCaps } = waitlist.api
 * ```
 */
export function setupWaitlist(components: AccessComponents, options: SetupWaitlistOptions): Waitlist {
  if (!options.access?.internals) {
    throw new TypeError('[nuxt-backend] setupWaitlist: `access` is not a setupAccess instance. Pass the app\'s, from access.ts: `setupWaitlist(components, { access, email })`.')
  }
  if (typeof (options.email as Partial<Email> | undefined)?.sendTemplate !== 'function') {
    throw new TypeError('[nuxt-backend] setupWaitlist: `email` is not a setupEmail instance. Pass the app\'s, from email.ts: `setupWaitlist(components, { access, email })`.')
  }
  const { access, email } = options
  const questions = checkedQuestions(options.questions)
  // Where an admitted person signs up: the sign-in page, wherever nuxt.config moves it.
  const signInPath = resolveBackendPaths(options.paths, 'setupWaitlist').login
  const refs = access.internals.refs as WaitlistRefs & Record<string, unknown>
  const { secrets, administrators } = access.internals
  const audit = access.internals.audit
  const own = components.rateLimiter
    ? new RateLimiter(components.rateLimiter as never, { waitlistJoin: DEFAULT_LIMITS.waitlistJoin, waitlistJoinGlobal: DEFAULT_LIMITS.waitlistJoinGlobal, signUpOtpGlobal: DEFAULT_LIMITS.signUpOtpGlobal })
    : undefined
  const limiter = options.rateLimiter ?? own

  /** The entry a status token names, if the token was signed here. */
  const entryOf = async (token: string): Promise<string | null> => firstVerified(secrets(), value => readStatusToken(value, token))

  /** An entry's standing, as its status page reads it. */
  async function placeFor(ctx: Pick<AccessCtx, 'runQuery'>, id: string): Promise<WaitlistStatusView | null> {
    const place = await ctx.runQuery(refs.waitlist.place, { id })
    if (!place) return null
    return { status: place.status, position: place.position, total: place.total, friends: place.boost, cap: DEFAULT_BOOST.cap, shareCode: place.shareCode, launchNews: place.launchNews }
  }

  const getWaitlistQuestions = queryGeneric({ args: {}, handler: async (): Promise<WaitlistQuestions> => questions })

  /** What a join is checked for before anything is spent on it: the address, the phase, the answers and the source. Answers the source to keep. */
  async function checkedJoin(ctx: Pick<AccessCtx, 'runQuery'>, input: { answers?: Record<string, string>, source?: string }, address: string): Promise<string> {
    if (admissionProblem(address) === 'malformed') throw backendError('invalid_input', { field: 'email' }, '[nuxt-backend] joinWaitlist: not an email address.')
    const phase: AccessPhase = await access.phase(ctx)
    if (phase !== 'early-access') throw backendError('forbidden', { reason: 'waitlist_closed', phase }, `[nuxt-backend] joinWaitlist: the app is ${phase}, not in early access.`)
    const problem = answersProblem(questions, input.answers)
    if (problem) throw backendError('invalid_input', { field: problem.field, reason: problem.reason }, `[nuxt-backend] joinWaitlist: "${problem.field}" ${problem.reason === 'unknown_question' ? 'is no question of this waitlist' : 'is not one of its choices'}.`)
    const source = input.source?.trim()
    if (source === undefined) return SOURCE_FORM
    if (!source || source.length > WAITLIST_SOURCE_MAX || !SOURCE_SHAPE.test(source)) {
      throw backendError('invalid_input', { field: 'source' }, `[nuxt-backend] joinWaitlist: a source is 1-${WAITLIST_SOURCE_MAX} letters, digits or . : / - _.`)
    }
    return source
  }

  const joinWaitlist = actionGeneric({
    args: {
      email: v.string(),
      answers: v.optional(v.record(v.string(), v.string())),
      launchNews: v.optional(v.boolean()),
      launchNewsText: v.optional(v.string()),
      source: v.optional(v.string()),
      ref: v.optional(v.string()),
      locale: v.optional(v.string()),
      human: v.optional(v.union(v.string(), v.null())),
    },
    returns: v.object({ join: v.string() }),
    handler: async (ctx, input): Promise<{ join: string }> => {
      const address = admissionEmail(input.email)
      const source = await checkedJoin(ctx, input, address)
      // The bot check first: a refused call spends none of the limits.
      await verifyHuman(ctx, input.human, { action: 'waitlist', subject: address })
      if (limiter) {
        await limiter.limit(ctx as never, 'waitlistJoin', { key: await addressDigest(address), throws: true })
        await limiter.limit(ctx as never, 'waitlistJoinGlobal', { throws: true })
      }
      // The browser that began the join keeps its key, and its code check carries it back.
      const join = crypto.randomUUID()
      await ctx.runMutation(refs.waitlist.stage, {
        email: address,
        key: join,
        ...(input.answers && Object.keys(input.answers).length ? { answers: input.answers } : {}),
        ...(input.launchNews ? { launchNews: { text: input.launchNewsText?.trim().slice(0, LAUNCH_NEWS_TEXT_MAX) || LAUNCH_NEWS_TEXT } } : {}),
        source,
        ...(input.ref?.trim() ? { ref: input.ref.trim().slice(0, 32) } : {}),
        ...(input.locale?.trim() ? { locale: input.locale.trim().slice(0, 35) } : {}),
      })
      return { join }
    },
  })

  const waitlistStatus = queryGeneric({
    args: { token: v.string() },
    handler: async (ctx, { token }): Promise<WaitlistStatusView | null> => {
      const id = await entryOf(token)
      return id ? placeFor(ctx, id) : null
    },
  })

  const leaveWaitlist = mutationGeneric({
    args: { token: v.string() },
    returns: v.null(),
    handler: async (ctx, { token }) => {
      const id = await entryOf(token)
      if (!id) return null
      await ctx.runMutation(refs.waitlist.leave, { id })
      await audit.recordBackendEvent(ctx, { type: 'waitlist.left', actor: null })
      return null
    },
  })

  const getWaitlistConsole = queryGeneric({
    args: { status: v.optional(v.union(...WAITLIST_STATUSES.map(name => v.literal(name)))), domain: v.optional(v.string()), source: v.optional(v.string()), question: v.optional(v.string()), answer: v.optional(v.string()) },
    handler: async (ctx, filter): Promise<WaitlistConsole | null> => {
      if (!await administrators.is(ctx, 'getWaitlistConsole')) return null
      const rows = await ctx.runQuery(refs.waitlist.consoleRows, filter)
      return { ...rows, questions }
    },
  })

  /** Each person admitted gets one plain "You're in" email; the ticket stands when it cannot be sent, and an operator reads the log and writes to them. */
  async function sendAdmitted(ctx: Parameters<Email['sendTemplate']>[0], person: { id: string, email: string, locale: string | null }): Promise<void> {
    try {
      await email.sendTemplate(ctx, 'waitlistAdmitted', { email: person.email, signInUrl: `${siteUrl() ?? ''}${signInPath}` }, { ...(person.locale ? { locale: person.locale } : {}), idempotencyKey: `nuxt-backend:waitlist-admitted:${person.id}` })
    }
    catch (error) {
      logBackend('warn', 'waitlist.admitted_unsent', 'A waitlist entry was admitted but its "You\'re in" email was not sent.', error)
    }
  }

  const admitWaitlist = mutationGeneric({
    args: { ids: v.optional(v.array(v.string())), next: v.optional(v.number()) },
    handler: async (ctx, { ids, next }): Promise<{ admitted: number }> => {
      const adminId = await administrators.require(ctx, 'admitWaitlist')
      checkedWave(ids, next)
      // The next in line, in the order of the queue; the queue may run a few
      // seconds behind, so it is read with room to spare and cut at `next`.
      const chosen = ids ?? await ctx.runQuery(refs.waitlist.queue, { limit: (next ?? 0) * 2 + 20 })
      const admitted = await ctx.runMutation(refs.waitlist.admit, { ids: chosen, ...(next !== undefined ? { max: next } : {}), createdBy: adminId })
      for (const person of admitted) await sendAdmitted(ctx, person)
      if (admitted.length) await audit.recordBackendEvent(ctx, { type: 'waitlist.admitted', data: { count: admitted.length } })
      return { admitted: admitted.length }
    },
  })

  const declineWaitlist = mutationGeneric({
    args: { ids: v.array(v.string()), abuse: v.optional(v.boolean()) },
    handler: async (ctx, { ids, abuse }): Promise<{ declined: number }> => {
      await administrators.require(ctx, 'declineWaitlist')
      if (ids.length > WAITLIST_WAVE_MAX) throw backendError('invalid_input', { field: 'ids', reason: 'too_many' }, `[nuxt-backend] declineWaitlist: at most ${WAITLIST_WAVE_MAX} entries at a time.`)
      const declined = await ctx.runMutation(refs.waitlist.decline, { ids, ...(abuse ? { abuse } : {}) })
      if (declined) await audit.recordBackendEvent(ctx, { type: 'waitlist.declined', data: { count: declined, abuse: Boolean(abuse) } })
      return { declined }
    },
  })

  const noteWaitlist = mutationGeneric({
    args: { id: v.string(), note: v.string() },
    returns: v.null(),
    handler: async (ctx, input) => {
      await administrators.require(ctx, 'noteWaitlist')
      await ctx.runMutation(refs.waitlist.note, input)
      return null
    },
  })

  const getWaitlistCaps = actionGeneric({
    args: {},
    handler: async (ctx): Promise<WaitlistCaps | null> => {
      if (!await administrators.is(ctx, 'getWaitlistCaps')) return null
      return readCaps(own as never, ctx)
    },
  })

  return {
    questions,
    launchAudience: ctx => ctx.runQuery(refs.waitlist.audience, {}),
    api: { getWaitlistQuestions, joinWaitlist, waitlistStatus, leaveWaitlist, getWaitlistConsole, admitWaitlist, declineWaitlist, noteWaitlist, getWaitlistCaps } as unknown as WaitlistApi,
  }
}

/**
 * The room a wave has: the sign-in codes new addresses may still ask for
 * this hour (the rate limiter's `signUpOtpGlobal`), and the email plan's
 * quota for today, as the provider's usage endpoint reports it.
 */
async function readCaps(limiter: Pick<RateLimiter<typeof DEFAULT_LIMITS>, 'getValue'> | undefined, ctx: Pick<AccessCtx, 'runQuery'>): Promise<WaitlistCaps> {
  const limit = DEFAULT_LIMITS.signUpOtpGlobal.rate
  let codes: WaitlistCaps['codes'] = null
  if (limiter) {
    try {
      const { value } = await limiter.getValue(ctx as never, 'signUpOtpGlobal')
      codes = { left: Math.max(0, Math.min(limit, Math.floor(value))), limit }
    }
    catch (error) {
      logBackend('warn', 'waitlist.caps_unread', 'The sign-in code budget could not be read for the Waitlist tab.', error)
    }
  }
  const key = readEnv('EMAIL_API_KEY')
  let emails: WaitlistCaps['emails'] = null
  if (key) {
    try {
      const usage = await new Resend(key).usage.get()
      if (!usage.error) emails = { used: usage.data.emails.daily.used, limit: usage.data.emails.daily.limit }
    }
    catch (error) {
      logBackend('warn', 'waitlist.caps_unread', 'The email provider\'s usage could not be read for the Waitlist tab.', error)
    }
  }
  return { codes, emails }
}

export { LAUNCH_NEWS_TEXT }
