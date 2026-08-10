/**
 * The `appConfig.backend` content layer — everything a designer edits without
 * touching wiring. Module options own wiring (paths, page set, css,
 * scaffold); app.config owns content (catalog, copy, brand). Components
 * resolve `props ?? appConfig.backend.* ?? built-in default`.
 */

/**
 * A pricing-page plan card. `key` must match a key of the products map passed
 * to `setupBilling` — name and price always resolve live from the billing
 * provider so the catalog cannot drift from the source of truth.
 */
export interface PricingPlan {
  key: string
  /** Prepaid credits the plan grants per period (display only). */
  credits?: number
  /** One-line marketing blurb. */
  blurb?: string
  /** Feature keys the plan unlocks (display only; grants come from billing). */
  features?: string[]
  /** Visually emphasize this plan. */
  highlight?: boolean
}

/** A one-time credit top-up pack; `key` matches a `setupBilling` product key. */
export interface CreditPack {
  key: string
  credits?: number
  blurb?: string
}

export interface BackendAppConfig {
  billing: {
    /** Plan catalog rendered by `<PricingTable>`. */
    plans: PricingPlan[]
    /** One-time credit packs rendered by `<PricingTable>` / settings. */
    packs: CreditPack[]
  }
  brand: {
    /** Product name used in shipped page copy. */
    name?: string
    /** Logo URL for shipped pages that show one. */
    logo?: string
  }
  /** Copy overrides for the shipped components (props still win). */
  labels: {
    auth?: Partial<Record<'title', string>>
    pricing?: Partial<Record<'title' | 'subscribe' | 'switch' | 'cancel' | 'current' | 'signIn' | 'topUp', string>>
    settings?: Partial<Record<'title' | 'create' | 'switch' | 'viewPlans' | 'cancel', string>>
    profile?: Partial<Record<'title' | 'save' | 'changeEmail', string>>
    security?: Partial<Record<'title' | 'addPasskey' | 'revoke' | 'revokeOthers' | 'deleteAccount' | 'signOut', string>>
  }
}

export const backendAppConfigDefaults: BackendAppConfig = {
  billing: { plans: [], packs: [] },
  brand: {},
  labels: {},
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] }

/** `appConfig.backend` as users may write it (everything optional). */
export type BackendAppConfigInput = DeepPartial<BackendAppConfig>
