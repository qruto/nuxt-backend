import type { BackendError } from '../../utils/backend-error'
import type { PricedPlan } from '../../composables/use-pricing'
import type { ActiveWorkspace } from '../../composables/use-workspace'

/** What the content of `<Gate>` receives: the active workspace with `workspace`, the quota as it stands with `quota`. */
export interface GateContent {
  /** The active workspace, with `workspace`. */
  workspace?: ActiveWorkspace
  /** How many the plan allows, or `'unlimited'`, with `quota`. */
  limit?: number | 'unlimited'
  /** How many are used, with `quota`. */
  used?: number
  /** How many more fit, with `quota`: `Infinity` when the plan allows any number. */
  remaining?: number
}

/** What the `fallback` slot of `<Gate quota>` receives: why the content is not there, and how to get room. */
export interface GateQuotaContext {
  /** The quota, by its catalog key. */
  quota: string
  /** How many the plan allows: `0` when it names the quota nowhere. */
  limit: number
  used: number
  /** How many the content needs. */
  amount: number
  /** The plans on sale that allow enough, in pricing order: empty while the pricing loads, and when none does. */
  plans: PricedPlan[]
  /** The plan the action opens: the first of {@link GateQuotaContext.plans}. */
  plan: PricedPlan | undefined
  /** Where the action goes: the pricing page, on that plan (`?plan=<key>`) when there is one. */
  href: string
  /** Whether the person may buy a plan; a member who manages no billing is asked to ask one who does. */
  canManage: boolean
  /** `true` while the pricing loads. */
  isLoading: boolean
}

/** `<Gate>`'s slots: exactly one renders, by the state of the checks. */
export interface GateSlots {
  /** Every check passed. */
  default: (content: GateContent) => unknown
  /**
   * A check failed. With `quota`, when the plan has no room left, it
   * receives the plans that allow more, and replaces the packaged sentence
   * and link; for any other check it receives nothing.
   */
  fallback: (context: GateQuotaContext | Record<string, never>) => unknown
  /** The checks are loading, on the server render and until the page has hydrated. */
  placeholder: (context: Record<string, never>) => unknown
  /** The plan's features or quotas could not be read, and why. */
  error: (context: { error: BackendError }) => unknown
}

/** What `<Gate>` renders, as its checks decide. */
export type GateVerdict
  = | { kind: 'content', content: GateContent }
    | { kind: 'placeholder' }
    | { kind: 'fallback' }
    | { kind: 'nothing' }
    | { kind: 'quota-loading' }
    | { kind: 'error', error: BackendError }
    | { kind: 'quota-error' }
    | { kind: 'quota', quota: string, name: string, limit: number, used: number, amount: number }
