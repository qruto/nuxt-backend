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
    /**
     * Credit balance under which `<CreditsLowBanner>` appears. One number for
     * the whole app so the nudge is consistent wherever the banner sits; the
     * component's `threshold` prop overrides it per placement.
     */
    lowCreditsThreshold: number
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
    /**
     * `trial` is a template: `{count}` and `{interval}` are replaced with the
     * plan's live trial length (`'{count}-{interval} free trial'`).
     */
    pricing?: Partial<Record<'title' | 'subscribe' | 'switch' | 'upgrade' | 'downgrade' | 'cancel' | 'uncancel' | 'trial' | 'current' | 'signIn' | 'topUp', string>>
    settings?: Partial<Record<'title' | 'create' | 'switch' | 'viewPlans' | 'cancel', string>>
    profile?: Partial<Record<'title' | 'save' | 'changeEmail', string>>
    security?: Partial<Record<'title' | 'addPasskey' | 'revoke' | 'revokeOthers' | 'deleteAccount' | 'signOut', string>>
    /** `<BillingHistory>` — past charges and their invoice links. */
    history?: Partial<Record<'title' | 'invoice' | 'empty' | 'loading' | 'newer' | 'older', string>>
    /**
     * `<UsageHistory>` — metered consumption. `units` is a template: `{units}`
     * is replaced with the event's unit count.
     */
    usage?: Partial<Record<'title' | 'units' | 'empty' | 'loading' | 'newer' | 'older', string>>
    /**
     * `<CreditsLowBanner>`. `low` is a template: `{balance}` is replaced with
     * the remaining credits.
     */
    credits?: Partial<Record<'low' | 'topUp' | 'dismiss', string>>
  }
}

/**
 * The package defaults. Copy stays out of `labels` on purpose: `useBackendConfig`
 * merges the user's label groups over these, so a shipped default here would be
 * dropped the moment an app overrode one key of its group. Components own their
 * fallback strings (`labels.subscribe ?? 'Subscribe'`) instead, which keeps a
 * partial override partial.
 */
export const backendAppConfigDefaults: BackendAppConfig = {
  billing: { plans: [], packs: [], lowCreditsThreshold: 10 },
  brand: {},
  labels: {},
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] }

/** `appConfig.backend` as users may write it (everything optional). */
export type BackendAppConfigInput = DeepPartial<BackendAppConfig>

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: NonNullable<T[K]> extends Record<string, unknown>
    ? K extends 'billing' | 'brand' | 'labels' ? Paths<NonNullable<T[K]>, `${Prefix}${K}.`> : `${Prefix}${K}`
    : `${Prefix}${K}`
}[keyof T & string]

/** Every dotted key of {@link BackendAppConfig}, as STABILITY.md §2 lists them. */
export type BackendAppConfigPath = Paths<BackendAppConfig>

/**
 * The frozen `appConfig.backend` surface, one dotted key per entry. `satisfies`
 * ties the list to the type both ways: a key added to {@link BackendAppConfig}
 * without an entry here is a type error, and so is a typo. The surface test
 * pins this list to STABILITY.md §2 and to the customization page.
 */
export const BACKEND_APP_CONFIG_KEYS = [
  'billing.plans',
  'billing.packs',
  'billing.lowCreditsThreshold',
  'brand.name',
  'brand.logo',
  'labels.auth',
  'labels.pricing',
  'labels.settings',
  'labels.profile',
  'labels.security',
  'labels.history',
  'labels.usage',
  'labels.credits',
] as const satisfies readonly BackendAppConfigPath[]
