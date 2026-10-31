import { storageAllows, storageFromCookieHeader } from '../../../../convex/consent-rules'
import type { PricedPlan } from '../../composables/use-pricing'

/** What every slot of `<UpgradePrompt>` receives. */
export interface UpgradePromptSlotContext {
  /** The feature the prompt is for, when it names one. */
  feature: string | undefined
  /**
   * The plans on sale that include it, in pricing order: empty while the
   * pricing loads, and when no plan on sale includes it.
   */
  plans: PricedPlan[]
  /** The plan the action opens: the first of {@link UpgradePromptSlotContext.plans}. */
  plan: PricedPlan | undefined
  /** Where the action goes: the pricing page, on that plan (`?plan=<key>`) when there is one. */
  href: string
  /**
   * Whether the person may buy a plan: a workspace's owner or admin, anyone
   * with `billTo: 'user'`, and a visitor who is signed out. A member who
   * manages no billing is asked to ask one who does instead.
   */
  canManage: boolean
  /** `true` while the pricing loads. */
  isLoading: boolean
}

/**
 * `<UpgradePrompt>`'s slots; each receives {@link UpgradePromptSlotContext}.
 * `default` replaces the whole prompt, the others one region of it.
 */
export interface UpgradePromptSlots {
  default: (context: UpgradePromptSlotContext) => unknown
  /** The sentence: what the plan lacks, and which plans include it. */
  message: (context: UpgradePromptSlotContext) => unknown
  /** The link to the pricing page, for someone who may buy a plan. */
  action: (context: UpgradePromptSlotContext) => unknown
}

/**
 * Where `<UpgradePrompt :cooldown>` keeps when it was dismissed, per person
 * and feature, in this browser: its local storage once the person allowed
 * the `preferences` purpose of optional storage, else the tab's session
 * storage, which ends with the tab (src/convex/legal.ts lists it).
 */
const COOLDOWN_STORE = 'nuxt-backend:upgrade-dismissed'

/** The store a dismissal is written to: local storage only with `preferences` allowed. */
function store(): Storage | undefined {
  const lasting = typeof document !== 'undefined' && storageAllows(storageFromCookieHeader(document.cookie), 'preferences')
  return lasting ? globalThis.localStorage : globalThis.sessionStorage
}

/** The dismissals one store keeps, by key: epoch ms. */
function kept(from: Storage | undefined): Record<string, number> {
  const raw = from?.getItem(COOLDOWN_STORE)
  const parsed = raw ? JSON.parse(raw) as unknown : null
  return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {}
}

/** The dismissals kept, by key: epoch ms, from either store. Nothing when storage is unavailable. */
function dismissals(): Record<string, number> {
  try {
    return { ...kept(globalThis.sessionStorage), ...kept(globalThis.localStorage) }
  }
  catch {
    return {}
  }
}

/** Whether a prompt dismissed under `key` is still within its cool-down. */
export function coolingDown(key: string, cooldown: number, now = Date.now()): boolean {
  const at = dismissals()[key]
  return typeof at === 'number' && now - at < cooldown
}

/** Keep that a prompt was dismissed under `key` now; a cool-down past a year is dropped as it is written. */
export function coolDown(key: string, now = Date.now()): void {
  try {
    const target = store()
    const fresh = Object.fromEntries(Object.entries(kept(target)).filter(([, at]) => now - at < 365 * 24 * 60 * 60 * 1000))
    target?.setItem(COOLDOWN_STORE, JSON.stringify({ ...fresh, [key]: now }))
  }
  catch {
    // A browser that keeps nothing shows the prompt again next time.
  }
}
