import { v } from 'convex/values'
import { DAY_MS } from './email-preferences.js'

// The ready-made lifecycle flows (`setupEmail({ lifecycle })`), shared by
// the app's setup that declares them, `email sync` that makes each one's
// template and automation at the email provider, and the component that
// starts, holds and stops each person's run from the package's own events.
// Runtime-neutral: no Convex runtime, no Vue.

/** How a flow's email counts: transactional email is never capped; lifecycle and marketing email go under a topic and the sending rules. */
export type LifecycleKind = 'transactional' | 'lifecycle' | 'marketing'

/** One ready-made flow, by its key on `setupEmail({ lifecycle })`. */
export type LifecycleFlow = 'welcome' | 'activationNudge' | 'firstResult' | 'creditsLow' | 'trialEnding' | 'checkoutAbandoned' | 'winBack' | 'stalled' | 'annualSwitch' | 'reviewAsk'

/** The flows, in the order the docs list them. */
export const LIFECYCLE_FLOWS: readonly LifecycleFlow[] = ['welcome', 'activationNudge', 'firstResult', 'creditsLow', 'trialEnding', 'checkoutAbandoned', 'winBack', 'stalled', 'annualSwitch', 'reviewAsk']

/** What starts a flow, and what stops a run of it, from the package's own events. */
interface FlowDefinition {
  kind: LifecycleKind
  /** The package event that starts a run: an account's sign-up, an event of the app's own (its `event`), a billing event, or the person's activity (`stalled`). */
  start: 'signed-up' | 'app-event' | 'activity' | `billing.${string}`
  /** The delays of its emails after the start, one run step each; the trial's is counted back from its end. */
  delays: readonly number[]
  /** The events that stop a waiting run. */
  stopOn: readonly string[]
  /** A flow sent at most once per person. */
  once: boolean
}

/**
 * The flows: when each starts, how long each email waits, and what stops
 * it. A billing event starts a lifecycle or marketing email only for people
 * who joined its topic on purpose (`explicit`, in the run).
 */
export const FLOW_DEFINITIONS: Readonly<Record<LifecycleFlow, FlowDefinition>> = {
  welcome: { kind: 'transactional', start: 'signed-up', delays: [0], stopOn: [], once: true },
  activationNudge: { kind: 'lifecycle', start: 'signed-up', delays: [DAY_MS], stopOn: [], once: true },
  firstResult: { kind: 'transactional', start: 'app-event', delays: [0], stopOn: [], once: true },
  creditsLow: { kind: 'transactional', start: 'billing.credits_low', delays: [0], stopOn: [], once: false },
  trialEnding: { kind: 'transactional', start: 'billing.subscription_created', delays: [7 * DAY_MS], stopOn: ['billing.subscription_canceled', 'billing.subscription_revoked'], once: false },
  checkoutAbandoned: { kind: 'marketing', start: 'billing.checkout_abandoned', delays: [DAY_MS], stopOn: ['billing.order_paid', 'billing.subscription_created'], once: true },
  winBack: { kind: 'marketing', start: 'billing.subscription_revoked', delays: [7 * DAY_MS, 30 * DAY_MS], stopOn: ['billing.subscription_created'], once: false },
  stalled: { kind: 'lifecycle', start: 'activity', delays: [14 * DAY_MS], stopOn: [], once: false },
  annualSwitch: { kind: 'marketing', start: 'billing.order_paid', delays: [0], stopOn: [], once: true },
  reviewAsk: { kind: 'lifecycle', start: 'app-event', delays: [7 * DAY_MS], stopOn: [], once: true },
}

/** The shortest trial the trial-ending email is sent for: shorter trials have Polar's own reminder alone. */
export const TRIAL_ENDING_MIN_DAYS = 14

/** The monthly payment after which the switch to the yearly price is suggested. */
export const ANNUAL_SWITCH_AFTER_PAYMENTS = 3

/** The name of the event that starts a flow's automation at the provider: `lifecycle.<flow>` in snake case. */
export function flowEventName(flow: LifecycleFlow): string {
  return `lifecycle.${flow.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`
}

/** The alias of a flow's template at the provider, which `email sync` finds it by. */
export function flowTemplateAlias(flow: LifecycleFlow): string {
  return `nuxt-backend-${flow.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
}

/** The name of a flow's automation at the provider, which `email sync` finds it by. */
export function flowAutomationName(flow: LifecycleFlow): string {
  return `nuxt-backend: ${flow}`
}

/** One flow as the component holds it, after `email sync`: what it needs to start, gate and stop a run. */
export const vFlowSettings = v.object({
  flow: v.string(),
  kind: v.union(v.literal('transactional'), v.literal('lifecycle'), v.literal('marketing')),
  /** The topic it goes under, with its default (non-transactional flows). */
  topic: v.optional(v.object({ key: v.string(), subscribedByDefault: v.boolean() })),
  /** Whether only a person who joined the topic on purpose gets it: every flow a billing event starts. */
  explicit: v.boolean(),
  /** What starts a run: `signed-up`, `activity`, a billing event, or the app's own event's name. */
  start: v.string(),
  /** The delays of its emails, in milliseconds, one run step each. */
  delays: v.array(v.number()),
  /** The events that stop a waiting run: billing events, or the app's own. */
  stopOn: v.array(v.string()),
  once: v.boolean(),
  /** The event the flow's automation listens for. */
  eventName: v.string(),
})

/** One flow's settings. */
export type FlowSettings = typeof vFlowSettings.type
