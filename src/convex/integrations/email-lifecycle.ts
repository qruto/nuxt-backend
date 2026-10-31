import type { FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import type { EmailBlock } from '../email-blocks.js'
import { DAY_MS, type EmailTopics, withTopicFooter } from '../email-preferences.js'
import type { EmailMessage, EmailRenderContext } from '../email-templates.js'
import { backendError } from '../errors.js'
import { FLOW_DEFINITIONS, flowEventName, type FlowSettings, LIFECYCLE_FLOWS, type LifecycleFlow } from '../lifecycle-flows.js'
import { normalizeEmail } from '../tokens.js'
import { ALL_BILLING_EVENTS } from './billing/events.js'

// The ready-made lifecycle flows and `email.automations.track`, for the
// app: what `setupEmail({ lifecycle })` declares, checked as the deployment
// loads; the settings `email sync` hands the component; each flow's email
// in the package's layout, which `email sync` makes the flow's template at
// the provider; and the events an app sends its own automations.

export type { LifecycleFlow, LifecycleKind } from '../lifecycle-flows.js'

/** One flow's options: the topic a lifecycle or marketing flow goes under, the app's event that starts it, the days of a win-back. */
export interface LifecycleFlowOptions {
  /** The topic (`setupEmail({ topics })`) a lifecycle or marketing flow goes under: required for them. */
  topic?: string
  /** The app's own event that starts it (`firstResult`, `reviewAsk`), as `email.automations.track` sends it: `app.strip_ready`. `reviewAsk` starts on the account's activation without one. */
  event?: string
  /** For `activationNudge`: the app's event that says the person created something, which stops the nudge. Default: `firstResult`'s event. */
  until?: string
  /** For `winBack`: the days after the plan ended each email goes, 1 to 3 of them. Default `[7, 30]`. */
  days?: number[]
}

/**
 * The ready-made flows an app turns on, by name: `true` for a flow that
 * needs nothing more, else its options. Lifecycle and marketing flows name
 * the topic they go under.
 *
 * @example
 * ```ts
 * lifecycle: {
 *   welcome: true,
 *   activationNudge: { topic: 'tips' },
 *   firstResult: { event: 'app.strip_ready' },
 *   winBack: { topic: 'offers', days: [7, 30] },
 * }
 * ```
 */
export type EmailLifecycle = { readonly [F in LifecycleFlow]?: true | LifecycleFlowOptions }

/** The most a win-back's emails wait after the plan ended, in days. */
const WIN_BACK_MAX_DAYS = 120

/** Why a flow's topic does not fit its kind, or `null`: lifecycle and marketing email go under a declared topic, transactional email under none. */
function topicProblem(flow: LifecycleFlow, topic: string | undefined, topics: EmailTopics): string | null {
  const { kind } = FLOW_DEFINITIONS[flow]
  if (kind === 'transactional') return topic ? `${flow} is transactional and goes under no topic` : null
  return topic && Object.hasOwn(topics, topic) ? null : `${flow} is ${kind} email, so it goes under a topic setupEmail declares: \`${flow}: { topic: '…' }\``
}

/** What one flow needs beside its topic: the event it starts or stops on, a win-back's days. */
const FLOW_NEEDS: Partial<Record<LifecycleFlow, (options: LifecycleFlowOptions, lifecycle: EmailLifecycle) => string | null>> = {
  firstResult: options => options.event ? null : 'firstResult starts on an event of your own: `firstResult: { event: \'app.strip_ready\' }`',
  activationNudge: (_options, lifecycle) => startEvent(lifecycle, 'until') ? null : 'activationNudge stops once the person creates something: name that event as firstResult\'s `event`, or as `until`',
  winBack: ({ days }) => days === undefined || (days.length >= 1 && days.length <= 3 && days.every(day => Number.isInteger(day) && day >= 1 && day <= WIN_BACK_MAX_DAYS))
    ? null
    : `winBack.days is 1 to 3 whole numbers of days from 1 to ${WIN_BACK_MAX_DAYS}`,
}

/** Why one flow's options cannot run, or `null`. */
function flowProblem(flow: LifecycleFlow, options: LifecycleFlowOptions, lifecycle: EmailLifecycle, topics: EmailTopics): string | null {
  const named = [options.event, options.until].filter((name): name is string => name !== undefined).find(name => eventProblem(name))
  if (named) return `${flow}'s event ${named} ${eventProblem(named)}`
  return topicProblem(flow, options.topic, topics) ?? FLOW_NEEDS[flow]?.(options, lifecycle) ?? null
}

/** The options a flow was given, `true` read as none. */
function optionsOf(value: true | LifecycleFlowOptions | undefined): LifecycleFlowOptions {
  return value === undefined || value === true ? {} : value
}

/** The activation the growth funnel records once per account (`setupAudit({ activation })`): where `reviewAsk` starts by default. */
const ACTIVATED = 'account.activated'

/**
 * The event a flow starts or stops on: the nudge's `until`, else
 * `firstResult`'s event; the review's `event`, else the account's
 * activation (`account.activated`).
 */
function startEvent(lifecycle: EmailLifecycle, which: 'until' | 'reviewAsk'): string | undefined {
  if (which === 'reviewAsk') return optionsOf(lifecycle.reviewAsk).event ?? ACTIVATED
  return optionsOf(lifecycle.activationNudge).until ?? optionsOf(lifecycle.firstResult).event
}

/**
 * Why `setupEmail({ lifecycle })` cannot run, naming the flow, or `null`.
 *
 * @internal
 */
export function lifecycleProblem(lifecycle: EmailLifecycle, topics: EmailTopics): string | null {
  for (const [flow, value] of Object.entries(lifecycle)) {
    if (!(LIFECYCLE_FLOWS as readonly string[]).includes(flow)) return `${flow} is no ready-made flow: ${LIFECYCLE_FLOWS.join(', ')}`
    if (value === undefined) continue
    const problem = flowProblem(flow as LifecycleFlow, optionsOf(value), lifecycle, topics)
    if (problem) return problem
  }
  return null
}

/**
 * The flows as the component holds them: what starts each, its delays,
 * its topic and what stops it.
 *
 * @internal
 */
export function lifecycleSettings(lifecycle: EmailLifecycle, topics: EmailTopics): FlowSettings[] {
  return LIFECYCLE_FLOWS.filter(flow => lifecycle[flow] !== undefined).map(flow => flowSettingsOf(flow, lifecycle, topics))
}

/** What starts a flow: its definition's event, or the app's own one it names. */
function startOf(flow: LifecycleFlow, lifecycle: EmailLifecycle): string {
  const { start } = FLOW_DEFINITIONS[flow]
  if (start !== 'app-event') return start
  return flow === 'reviewAsk' ? startEvent(lifecycle, 'reviewAsk')! : optionsOf(lifecycle[flow]).event!
}

/** One flow's settings. */
function flowSettingsOf(flow: LifecycleFlow, lifecycle: EmailLifecycle, topics: EmailTopics): FlowSettings {
  const options = optionsOf(lifecycle[flow])
  const definition = FLOW_DEFINITIONS[flow]
  const start = startOf(flow, lifecycle)
  return {
    flow,
    kind: definition.kind,
    ...(options.topic ? { topic: { key: options.topic, subscribedByDefault: topics[options.topic]!.subscribedByDefault } } : {}),
    // A billing event starts lifecycle or marketing email only for people who joined its topic on purpose.
    explicit: definition.kind !== 'transactional' && start.startsWith('billing.'),
    start,
    delays: flow === 'winBack' && options.days ? options.days.map(day => day * DAY_MS) : [...definition.delays],
    stopOn: flow === 'activationNudge' ? [startEvent(lifecycle, 'until')!] : [...definition.stopOn],
    once: definition.once,
    eventName: flowEventName(flow),
  }
}

/** The words of a flow's email: its subject, its heading, its paragraph, its button. */
const FLOW_LINKS: Readonly<Record<LifecycleFlow, string>> = {
  welcome: '/',
  activationNudge: '/',
  firstResult: '/',
  creditsLow: '/pricing',
  trialEnding: '/pricing',
  checkoutAbandoned: '/pricing',
  winBack: '/pricing',
  stalled: '/',
  annualSwitch: '/pricing',
  reviewAsk: '/',
}

/**
 * One flow's email in the package's layout, in the default language: what
 * `email sync` makes the flow's template at the provider. A lifecycle or
 * marketing flow's carries the postal address and the provider's
 * unsubscribe link, which it fills per contact.
 *
 * @internal
 */
export async function flowEmail(
  flow: LifecycleFlow,
  compose: (build: (context: EmailRenderContext) => EmailMessage) => Promise<EmailMessage>,
  footer: { address: string | undefined, unsubscribeUrl: string },
): Promise<{ subject: string, html: string, text: string }> {
  const message = await compose(({ t, brand }) => {
    const key = (part: string) => `email.lifecycle.${flow}.${part}`
    const blocks: EmailBlock[] = [
      { heading: t(key('heading'), { brand: brand.name }) },
      { paragraph: t(key('body'), { brand: brand.name }) },
    ]
    // The button opens the app: without SITE_URL there is nowhere to send it.
    if (brand.url) blocks.push({ button: { label: t(key('action')), url: `${brand.url.replace(/\/+$/, '')}${FLOW_LINKS[flow]}` } })
    return { to: '', subject: t(key('subject'), { brand: brand.name }), blocks }
  })
  const rendered = { subject: message.subject, html: message.html ?? '', text: message.text ?? '' }
  if (FLOW_DEFINITIONS[flow].kind === 'transactional') return rendered
  const label = (await compose(({ t }) => ({ to: '', subject: t('email.layout.unsubscribe') }))).subject
  return { ...rendered, ...withTopicFooter({ html: rendered.html, text: rendered.text }, { address: footer.address, unsubscribeUrl: footer.unsubscribeUrl, unsubscribeLabel: label }) }
}

/** Why an event name of the app's own cannot be tracked, or `null`. */
function eventProblem(name: string): string | null {
  if (!/^[\w.:-]{1,100}$/.test(name)) return 'is 1 to 100 letters, digits, `.`, `:`, `_` or `-`'
  if (name.startsWith('lifecycle.') || name.startsWith('resend:')) return 'is the package\'s or the provider\'s own (`lifecycle.`, `resend:`)'
  if (name.startsWith('billing.') || (ALL_BILLING_EVENTS as readonly string[]).includes(name)) return 'is a billing event: the billing provider sends its own receipts and reminders, so it is never tracked'
  return null
}

/** A mutation's or an action's ctx: what tracking an event needs. */
export type EmailRunCtx = Pick<GenericActionCtx<GenericDataModel>, 'runMutation'> & Partial<Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>>
type RunCtx = EmailRunCtx

/** What `email.automations` and `email.lifecycle` need from `setupEmail`. */
interface LifecycleDeps {
  refs: {
    track: FunctionReference<'mutation', 'internal', { event: string, email: string, userId?: string, payload?: Record<string, unknown> }, null>
    signal: FunctionReference<'mutation', 'internal', { type: string, userId?: string, email?: string }, { welcome: boolean }>
  }
  findUser: FunctionReference<'query', 'internal', { model: string, where: Array<{ field: string, value: string }> }, unknown> | undefined
  flows: readonly LifecycleFlow[]
}

/** Events the app sends the email provider's automations for one account's contact. */
export interface EmailAutomations {
  /**
   * Send one event to the email provider for the account's contact (by
   * `userId`, or an `email` with no account), with `data` for its
   * automations' conditions and templates. The contact is made when there
   * is none, in the app's segment; the provider gets the event by a job
   * right after, so `track` returns at once. Nothing is forwarded on its
   * own. Refused as `invalid_input` (`event`, reason `billing_event`) for
   * a billing event, which the billing provider's own emails cover, and
   * (reason `reserved`) for the package's `lifecycle.` and the provider's
   * `resend:` names. An event a ready-made flow names (`firstResult`'s)
   * starts and stops that flow too.
   */
  track: (ctx: RunCtx, input: { event: string, userId?: string, email?: string, data?: Record<string, string | number | boolean> }) => Promise<void>
}

/** The ready-made flows, as the package itself runs them. @internal */
export interface EmailLifecycleRunner {
  /** The flows `setupEmail({ lifecycle })` turns on. */
  flows: readonly LifecycleFlow[]
  /** An account was created: the flows that start at sign-up start. Resolves whether the welcome flow sends the welcome. */
  signedUp: (ctx: RunCtx, user: { id: string, email: string }) => Promise<{ welcome: boolean }>
}

/**
 * `email.automations` and `email.lifecycle`, for `setupEmail`.
 *
 * @internal
 */
export function createLifecycle(deps: LifecycleDeps): { automations: EmailAutomations, lifecycle: EmailLifecycleRunner } {
  /** The account's address, by its id; `null` without one. */
  const addressOf = async (ctx: RunCtx, userId: string): Promise<string | null> => {
    if (!deps.findUser || typeof ctx.runQuery !== 'function') return null
    const user = await ctx.runQuery(deps.findUser, { model: 'user', where: [{ field: '_id', value: userId }] }) as { email?: unknown } | null
    return typeof user?.email === 'string' ? user.email : null
  }

  const track: EmailAutomations['track'] = async (ctx, { event, userId, email, data }) => {
    const problem = eventProblem(event)
    if (problem) {
      const reason = /billing/.test(problem) ? 'billing_event' : /own/.test(problem) ? 'reserved' : undefined
      throw backendError('invalid_input', { field: 'event', ...(reason ? { reason } : {}) }, `[nuxt-backend] automations.track: ${event} ${problem}.`)
    }
    const address = email ?? (userId ? await addressOf(ctx, userId) : null)
    if (!address) throw backendError('invalid_input', { field: userId ? 'userId' : 'email' }, '[nuxt-backend] automations.track: name the account (`userId`) or the address (`email`) the event is about.')
    await ctx.runMutation(deps.refs.track, { event, email: normalizeEmail(address), ...(userId ? { userId } : {}), ...(data ? { payload: data } : {}) })
  }

  return {
    automations: { track },
    lifecycle: {
      flows: deps.flows,
      signedUp: async (ctx, user) => deps.flows.length === 0
        ? { welcome: false }
        : ctx.runMutation(deps.refs.signal, { type: 'signed-up', userId: user.id, email: normalizeEmail(user.email) }),
    },
  }
}
