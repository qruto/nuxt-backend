/**
 * Billing catalog-as-code: the app declares its meters, plans, packs, and
 * feature benefits once in `backend/billing.catalog.ts`, and `nuxt-backend
 * billing sync` pushes them to the billing provider (find-or-create, tagged
 * with `metadata.managedBy`), writing the resulting id map to
 * `backend/billing.generated.ts` — the only place provider UUIDs live.
 *
 * Granting stays fully provider-native: "the Pro plan includes 500
 * credits/month" is a meter-credit benefit attached to the subscription
 * product, granted by the provider every billing cycle (once at purchase for
 * one-time packs). This package only pushes the catalog and reads the
 * balances.
 *
 * Pure types and helpers — no runtime dependencies, importable from
 * both Convex code and the CLI.
 */

/** A credit grant a plan or pack carries (a provider meter-credit benefit). */
export interface CatalogCreditGrant {
  /** The catalog meter key the credits land on. */
  meter: string
  /** Units granted (per cycle for plans, once for packs). */
  units: number
  /**
   * Carry unused credits into the next cycle. Defaults to `false` for plan
   * grants (use-it-or-lose-it monthly allowances) and `true` for packs
   * (purchased credits keep).
   */
  rollover?: boolean
}

/** A usage meter, keyed by the event name spends use (`spendCredits({ meter })`). */
export interface CatalogMeter {
  /**
   * How events aggregate: `'sum'` (default) sums `property` across events —
   * multi-credit spends in one event; `'count'` counts events (1 credit per
   * event, not refundable).
   */
  aggregation?: 'sum' | 'count'
  /** The metadata property summed by `'sum'` meters. Default `'amount'`. */
  property?: string
  /** Event name the meter filters on. Defaults to the catalog key. */
  eventName?: string
}

/**
 * How a price is taxed. `'location'` (the default) lets the provider decide
 * from the customer's location and the organization's setting.
 */
export type CatalogTaxBehavior = 'inclusive' | 'exclusive' | 'location'

/**
 * A free trial the plan grants before its first charge: the provider's own,
 * with the card taken at checkout. With `pass: true` it is a reverse trial
 * instead: every new workspace starts on the plan as a pass, with no card,
 * for `count` `interval`s (14 days by default), then falls back to the
 * free plan. The plan itself then sells with no trial of its own.
 */
export type CatalogTrial
  = | {
    interval: 'day' | 'week' | 'month' | 'year'
    /** Number of intervals. Defaults to 1. */
    count?: number
    pass?: false
  }
  | {
    /** The pass's length unit. Defaults to `'day'`, with `count` 14. */
    interval?: 'day' | 'week' | 'month'
    /** Number of intervals. Defaults to 1, or 14 days when `interval` is left out. */
    count?: number
    /** A reverse trial on a plan pass, started for every new workspace (LIFECYCLE). */
    pass: true
  }

/** The longest a reverse trial runs: three months. */
export const TRIAL_PASS_MAX_DAYS = 92

/**
 * A reverse trial's length in days, or `undefined` for a trial that is the
 * provider's own: `{ pass: true }` alone is 14 days.
 */
export function trialPassDays(trial: CatalogTrial | undefined): number | undefined {
  if (!trial?.pass) return undefined
  if (trial.interval === undefined) return trial.count ?? 14
  const count = trial.count ?? 1
  return trial.interval === 'day' ? count : trial.interval === 'week' ? count * 7 : count * 30
}

/** The trial the provider runs for a plan, or `undefined`: a reverse trial is the package's, so the product carries none. */
export function providerTrialOf(trial: CatalogTrial | undefined): { interval: 'day' | 'week' | 'month' | 'year', count?: number } | undefined {
  return trial && !trial.pass ? trial : undefined
}

/**
 * A metered price billed on top of the plan's fixed price — pay-as-you-go
 * overage, charged at the end of each cycle for what the meter recorded.
 *
 * This is the *other* way to sell a meter: `credits` prepays an allowance the
 * provider grants per cycle, `usage` bills whatever is spent. A plan can do
 * both (an included allowance, then overage) because the provider settles the
 * metered price against the meter's remaining balance.
 */
export interface CatalogUsagePrice {
  /** The catalog meter key this price bills. */
  meter: string
  /**
   * Price per unit in cents. Pass a string for sub-cent precision (up to 12
   * decimal places) — a number would lose it.
   */
  unitAmount: number | string
  /** Never charge more than this many cents per cycle, however much is used. */
  cap?: number
}

/**
 * A field the checkout collects and stores on the order/subscription — the
 * answers ride along to the provider dashboard and the webhook payloads.
 */
export interface CatalogCustomField {
  /** Input type. `'select'` needs {@link CatalogCustomField.options}. */
  type: 'text' | 'number' | 'checkbox' | 'date' | 'select'
  /** Label shown at checkout. Defaults to the catalog key. */
  name?: string
  /** Key the answer is stored under. Defaults to the catalog key. */
  slug?: string
  /** Checkout refuses to submit without an answer. Defaults to `false`. */
  required?: boolean
  /** Choices for `type: 'select'`. */
  options?: Array<{ value: string, label: string }>
}

/** A billing interval a plan is sold at: a product per interval, each with its own price. */
export type CatalogInterval = 'month' | 'year'

/** The intervals a plan may be priced at, in the order pricing lists them. */
export const CATALOG_INTERVALS = ['month', 'year'] as const satisfies readonly CatalogInterval[]

/**
 * A plan's prices in cents, one per billing interval it is sold at. Each
 * becomes a product of its own at the provider, tagged with the plan's key
 * and the interval, so a subscriber switches between them like between
 * plans. At least one is required. A plan priced `{ month: 0 }` is the
 * catalog's free plan (see {@link CatalogPlan.prices}).
 */
export interface CatalogPlanPrices {
  /** Billed every month. */
  month?: number
  /** Billed every year. */
  year?: number
}

/**
 * A plan's prices in several currencies: each lower-case ISO 4217 code to
 * the plan's prices in it, `{ usd: { month: 2900 }, eur: { month: 2700 } }`.
 * Every currency prices the same intervals, and one of them is the
 * catalog's {@link BillingCatalog.currency} (the organization's default
 * presentment currency when that is unset). Each becomes a native
 * presentment price on the same product, so a visitor pays in their own
 * currency and the subscription is the same plan.
 */
export type CatalogCurrencyPrices = Record<string, CatalogPlanPrices>

/**
 * A pack's price in several currencies: each lower-case ISO 4217 code to
 * the price in cents, `{ usd: 2000, eur: 1800 }`. One of them is the
 * catalog's {@link BillingCatalog.currency}.
 */
export type CatalogPackPrices = Record<string, number>

/**
 * A plan's credit grant, given every billing cycle — a month on the monthly
 * price, a year on the yearly one. `units` as a number is the monthly
 * allowance, and the yearly product grants twelve times it once a year;
 * `{ month, year }` sets each cycle's grant yourself.
 */
export interface CatalogPlanCreditGrant extends Omit<CatalogCreditGrant, 'units'> {
  units: number | Partial<Record<CatalogInterval, number>>
}

/** The lengths, in months, a plan can be gifted for as a pass. */
export const PASS_LENGTHS = [1, 3, 12] as const

/** A plan's gift as a pass: the lengths it is sold for. */
export interface CatalogPlanGift {
  /** Which of 1, 3 and 12 months the plan can be gifted for. */
  months: ReadonlyArray<(typeof PASS_LENGTHS)[number]>
}

/** A subscription plan: one recurring product per priced interval. */
export interface CatalogPlan {
  name: string
  description?: string
  /**
   * Price in cents per interval: `{ month: 2900, year: 29000 }`, in the
   * catalog's {@link BillingCatalog.currency}; or per currency,
   * `{ usd: { month: 2900 }, eur: { month: 2700 } }`.
   *
   * `{ month: 0 }` makes the plan the catalog's free plan: a real
   * subscription the provider holds, started for every new billing entity
   * and again whenever a paid plan ends, so its credits and features are
   * granted like any plan's. A catalog has at most one, priced by the month
   * only, with no trial and no `usage`; it is never checked out, and a
   * checkout of a paid plan upgrades it in place.
   */
  prices: CatalogPlanPrices | CatalogCurrencyPrices
  /** Credits included with the plan, granted every cycle (see {@link CatalogPlanCreditGrant}). */
  credits?: CatalogPlanCreditGrant
  /** Feature-benefit keys (from {@link BillingCatalog.features}) this plan grants. */
  features?: string[]
  /**
   * Free trial before the first charge, on every interval. `billing sync`
   * pushes a change to it. `{ pass: true }` makes it a reverse trial: a
   * pass every new workspace starts on, with no card (LIFECYCLE).
   */
  trial?: CatalogTrial
  /**
   * Run the plan's meters on a monthly cycle on every price: a yearly price
   * then charges once a year while its credits are granted, and its usage
   * invoiced, every month (the provider's meter cycle). `billing sync`
   * sets it on the plan's yearly product as it creates it; the provider
   * never changes a product's meter cycle afterwards.
   */
  meterCycle?: 'month'
  /** Metered prices charged on top of the fixed price (pay-as-you-go overage), every cycle. */
  usage?: CatalogUsagePrice[]
  /**
   * Make the plan giftable as a pass, for these lengths: someone buys it once
   * and a workspace on the free plan holds it for that long, with no card and
   * no renewal. `billing sync` makes two private products for it: a one-time
   * purchase product per length (the months at the monthly price, 12 at the
   * yearly one when the plan has it) and one free pass product carrying the
   * plan's benefits. Needs a free plan to return to.
   *
   * @experimental
   */
  gift?: CatalogPlanGift
  /** Tax treatment of the price. Defaults to the organization's setting. */
  taxBehavior?: CatalogTaxBehavior
  /** Checkout field keys (from {@link BillingCatalog.customFields}) to collect. */
  customFields?: string[]
  /**
   * Retire the plan: `billing sync` archives its products, so nobody new
   * can check out or switch to it, while everyone subscribed keeps it,
   * renews on it and can switch away. Keep a retired plan in the catalog —
   * its ids stay in the generated map, so a subscriber's plan still reads
   * back by its key.
   */
  retired?: boolean
  /**
   * How many of each quota (keys from {@link BillingCatalog.quotas}) the
   * plan allows: a whole number, or `'unlimited'`. A quota the plan leaves
   * out allows none. `billing sync` pushes them as one feature-flag benefit
   * on the plan's products, `<plan>-quotas`, and pushes a change to them;
   * a plan that drops them all keeps the benefit, its limits cleared.
   *
   * @experimental
   */
  quotas?: Record<string, number | 'unlimited'>
}

/** A one-time credit pack. */
export interface CatalogPack {
  name: string
  description?: string
  /**
   * Price in cents, in the catalog's {@link BillingCatalog.currency}; or per
   * currency, `{ usd: 2000, eur: 1800 }`. A pack's gift twin carries every
   * one of them.
   */
  price: number | CatalogPackPrices
  /** Credits granted once at purchase. */
  credits: CatalogCreditGrant
  /** Tax treatment of the price. Defaults to the organization's setting. */
  taxBehavior?: CatalogTaxBehavior
  /** Checkout field keys (from {@link BillingCatalog.customFields}) to collect. */
  customFields?: string[]
}

/**
 * A feature benefit, gated by its key: in a function with
 * `billing.requireFeature(ctx, key)` or the `withFeature(key)` tier, in the
 * UI with `useFeatures().has(key)` and `<Gate feature>`. Pushed
 * as the provider's native feature-flag benefit; the catalog key rides along
 * in the benefit metadata, which is what every gate matches on.
 */
export interface CatalogFeature {
  description: string
}

/** What a feature gate reads off a benefit: its id at the provider and its metadata. */
export interface FeatureBenefit {
  /** The benefit's id at the provider: a benefit's, never a grant's. */
  benefitId: string
  metadata?: Readonly<Record<string, unknown>> | null
}

/**
 * The one name a feature gate knows a benefit by: the `key` in its
 * metadata (the catalog key `billing sync` writes, or one set in the
 * provider's dashboard), else its benefit id. A benefit with a key is never
 * matched by its id, its type, a grant's id or another metadata value: one
 * benefit, one name, on the server and in the browser alike.
 */
export function featureKeyOf(benefit: FeatureBenefit): string {
  const key = benefit.metadata?.key
  return typeof key === 'string' && key !== '' ? key : benefit.benefitId
}

/**
 * Whether a benefit is the feature `feature` names ({@link featureKeyOf}):
 * the match `billing.requireFeature`, `withFeature`, `useFeatures().has()`
 * and `<Gate feature>` all make, so the server's gate and the UI's
 * never disagree.
 */
export function grantsFeature(benefit: FeatureBenefit, feature: string): boolean {
  return feature !== '' && featureKeyOf(benefit) === feature
}

/**
 * A quota: how many of a thing a billing entity may hold at once — projects,
 * boards, sites — counted where the thing is made and given back where it
 * is removed. It never resets on a billing period: an allowance per period
 * is what credits and meters are for. Each plan says how many it allows
 * ({@link CatalogPlan.quotas}); one it does not name allows none. Never
 * people: a quota on members, seats, users, teammates, collaborators,
 * guests or people is refused, since a plan here is never priced per seat.
 *
 * @experimental
 */
export interface CatalogQuota {
  /**
   * What it counts, as a sentence names it: `'projects'`, `'team boards'`.
   * `billing sync` writes it to the generated map, `getFeatures` reports it
   * with the quota, `<Gate quota>` says it ("You have used 3 of 3
   * projects") unless given a `name`, and DevTools shows it.
   */
  description: string
}

/**
 * The metadata a benefit carries each quota under: `quota_<key>`, a whole
 * number or `'unlimited'`. `billing sync` writes them on a plan's
 * `<plan>-quotas` benefit; a benefit made in the dashboard may carry them too.
 *
 * @internal
 */
export const QUOTA_METADATA_PREFIX = 'quota_'

/**
 * What a quota key may be: a letter, then letters, digits, `_` or `-`, at
 * most 34 in all, so `quota_<key>` fits the provider's 40-character
 * metadata keys.
 *
 * @internal
 */
export const QUOTA_KEY = /^[a-z][\w-]{0,33}$/i

/**
 * The people a quota never counts, as the docs list them: a plan here is
 * never priced per seat.
 *
 * @internal
 */
export const SEAT_WORDS = ['members', 'seats', 'users', 'teammates', 'collaborators', 'guests', 'people'] as const

/** A word that names people: one of {@link SEAT_WORDS}, singular or plural, or a membership. */
const PERSON_WORD = /^(?:members?|memberships?|seats?|users?|teammates?|collaborators?|guests?|people|persons?)$/

/**
 * Words that say how a count is held or whose it is, never what it counts:
 * `seat_limit`, `max_users_allowed` and `users_per_workspace` still count
 * people.
 */
const COUNT_WORDS = new Set([
  'count', 'counts', 'limit', 'limits', 'max', 'maximum', 'min', 'minimum', 'total', 'cap', 'quota', 'num', 'number',
  'allowed', 'included', 'available', 'extra', 'additional', 'active', 'slot', 'slots', 'per', 'each', 'in', 'of',
  'workspace', 'workspaces', 'org', 'orgs', 'organization', 'organizations', 'team', 'teams', 'account', 'accounts', 'plan',
])

/**
 * A quota that counts people: once the words that only say how the count is
 * held (`count`, `limit`, `max`, `per`, `workspace`, …) are dropped from
 * its end, its last word names people (`members`, `seats`, `users`, …), in
 * any case or separator: `seat_count`, `memberLimit`, `users_per_workspace`
 * and `people` are refused, `user_projects` and `seating_charts` are not.
 * Refused by `billing sync` and by every quota check, since a plan here is
 * never priced per seat.
 *
 * @internal
 */
export function isSeatLikeQuota(key: string): boolean {
  const words = key.replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
  let last = words.length - 1
  while (last >= 0 && COUNT_WORDS.has(words[last]!)) last--
  return last >= 0 && PERSON_WORD.test(words[last]!)
}

/**
 * The limit one metadata value grants: a whole number, `Infinity` for
 * `'unlimited'`, and nothing (`0`) for anything else, so a value the
 * package cannot read fails closed.
 */
function quotaLimitOf(value: unknown): number {
  if (value === 'unlimited') return Number.POSITIVE_INFINITY
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/**
 * The quotas a set of granted benefits allows, by key: for each key, the
 * most any of them grants (`Infinity` for unlimited). A key no benefit names
 * is absent, and allows none.
 *
 * @internal
 */
export function grantedQuotas(benefits: ReadonlyArray<Pick<FeatureBenefit, 'metadata'>>): Map<string, number> {
  const limits = new Map<string, number>()
  for (const benefit of benefits) {
    for (const [name, value] of Object.entries(benefit.metadata ?? {})) {
      if (!name.startsWith(QUOTA_METADATA_PREFIX)) continue
      const key = name.slice(QUOTA_METADATA_PREFIX.length)
      if (!QUOTA_KEY.test(key)) continue
      limits.set(key, Math.max(limits.get(key) ?? 0, quotaLimitOf(value)))
    }
  }
  return limits
}

/**
 * A quota's limit as the API answers it: a whole number, or `'unlimited'`.
 *
 * @internal
 */
export function quotaLimit(limit: number): number | 'unlimited' {
  return limit === Number.POSITIVE_INFINITY ? 'unlimited' : limit
}

/**
 * The key of the feature-flag benefit carrying a plan's quotas.
 *
 * @internal
 */
export function planQuotasKey(plan: string): string {
  return `${plan}-quotas`
}

/**
 * How long a discount takes money off: the first payment only (`'once'`),
 * every payment while the subscription lasts (`'forever'`), or the payments
 * of the first `months` months. A one-time pack is paid once whatever the
 * duration. On a yearly price `once` covers the whole first year, and
 * `months` must be a whole number of years (12, 24, …).
 */
export type CatalogDiscountDuration = 'once' | 'forever' | { months: number }

/**
 * What a discount applies to: the catalog's plans and packs, by key. Never
 * every product: one the discount does not list is never discounted, and
 * a product created later is not either.
 */
export interface CatalogDiscountProducts {
  /** Plan keys. Their prices at every interval, or at `interval` only. */
  plans?: string[]
  /** Only the plans' prices at this interval. */
  interval?: CatalogInterval
  /** Pack keys. */
  packs?: string[]
}

/** What every catalog discount says beside its amount (see {@link CatalogDiscount}). */
export interface CatalogDiscountTerms {
  /** The name the customer sees at checkout and on the invoice. */
  name: string
  /** How long it takes money off (see {@link CatalogDiscountDuration}). */
  duration: CatalogDiscountDuration
  /**
   * A code customers type at checkout and a campaign link carries: 3 to 64
   * letters and digits, unique among the catalog's discounts. A discount
   * with a code is public: anyone who knows the code can use it, and a
   * client may name it by key (`useBilling().checkout(id, { discount })`).
   * One without a code is the server's alone: `billing.checkout(ctx, {
   * discount })` or the `checkoutDiscount` hook applies it.
   */
  code?: string
  /** How many times it may be redeemed in all. */
  maxRedemptions?: number
  /** How many times one customer may redeem it. */
  perCustomer?: number
  /** When it can first be redeemed: an ISO date-time (a date alone is the start of that day, UTC). */
  startsAt?: string | Date
  /**
   * When it can no longer be redeemed: the real end of the offer, which
   * `<PricingTable>` shows as a date. Customers who redeemed it keep it
   * for its duration.
   */
  endsAt?: string | Date
  /** The plans and packs it applies to: at least one. */
  products: CatalogDiscountProducts
  /**
   * Retire it: `billing sync` ends it now and frees its code, so nobody new
   * redeems it, while everyone who did keeps it for its duration. A
   * changed amount or duration after the first redemption is published
   * this way: retire the key and declare the new terms under another.
   */
  retired?: boolean
}

/**
 * A promotion: a discount declared in the catalog and pushed by `billing
 * sync` as the provider's own discount, found again by its key. A
 * percentage of the price (`percentOff`, up to two decimals), or a fixed
 * amount in cents (`amountOff`) — one per currency the catalog prices in,
 * or a number in the catalog's {@link BillingCatalog.currency}.
 *
 * @example
 * ```ts
 * discounts: {
 *   launch: {
 *     name: 'Launch offer', percentOff: 20, duration: { months: 3 },
 *     code: 'LAUNCH20', maxRedemptions: 500, perCustomer: 1, endsAt: '2027-01-31T23:59:59Z',
 *     products: { plans: ['pro'], interval: 'month' },
 *   },
 * }
 * ```
 */
export type CatalogDiscount = CatalogDiscountTerms & (
  | { percentOff: number, amountOff?: never }
  | { amountOff: number | Record<string, number>, percentOff?: never }
)

/**
 * What a discount code may be, here and in a campaign link: 3 to 64
 * letters and digits. The provider takes longer ones; a campaign link's
 * reader (`useCampaign`) does not.
 */
export const DISCOUNT_CODE = /^[a-z0-9]{3,64}$/i

/**
 * The months a discount's duration covers: its `months`, else none.
 *
 * @internal
 */
export function discountMonths(duration: CatalogDiscountDuration): number | undefined {
  return typeof duration === 'object' && duration !== null ? duration.months : undefined
}

/**
 * The product keys a discount applies to, as the generated map names
 * them: each plan's price at every interval it is priced at (or at the
 * discount's `interval` only), then each pack.
 *
 * @internal
 */
export function discountProductKeys(discount: Pick<CatalogDiscount, 'products'>, catalog: Pick<BillingCatalog, 'plans'>): string[] {
  const { plans = [], packs = [], interval } = discount.products ?? {}
  const prices = plans.flatMap((key) => {
    const plan = catalog.plans?.[key]
    if (!plan) return []
    return pricedIntervals(plan).filter(at => !interval || at === interval).map(at => planProductKey(key, at))
  })
  return [...prices, ...packs]
}

export interface BillingCatalog {
  /**
   * ISO 4217 currency every single-currency `price` is created in,
   * lowercase (`'usd'`, `'eur'`), and the one a visitor pays in when the
   * catalog does not price their own. Defaults to the organization's default
   * presentment currency, which the provider requires on every product: a
   * per-currency price names it too.
   */
  currency?: string
  meters?: Record<string, CatalogMeter>
  plans?: Record<string, CatalogPlan>
  packs?: Record<string, CatalogPack>
  features?: Record<string, CatalogFeature>
  /**
   * The quotas plans set, keyed by what `billing.requireQuota`,
   * `useFeatures().quota()` and `<Gate quota>` name them by.
   *
   * @experimental
   */
  quotas?: Record<string, CatalogQuota>
  /** Checkout fields plans and packs can collect, keyed by catalog key. */
  customFields?: Record<string, CatalogCustomField>
  /**
   * Promotions: the provider's own discounts, declared here and kept in
   * line by `billing sync`, keyed by what checkout names them by
   * (`billing.checkout(ctx, { discount: 'launch' })`).
   */
  discounts?: Record<string, CatalogDiscount>
}

/**
 * Declare the billing catalog (typed identity: its keys stay literal, so
 * `keyof typeof catalog.discounts` names its promotions). Push it with
 * `npx nuxt-backend billing sync`.
 *
 * @example
 * ```ts
 * export default defineBillingCatalog({
 *   meters: { credits: {} },
 *   plans: {
 *     pro: { name: 'Pro', prices: { month: 2900, year: 29000 },
 *       credits: { meter: 'credits', units: 500 }, features: ['priority_support'],
 *       trial: { interval: 'day', count: 14 },
 *       usage: [{ meter: 'credits', unitAmount: 5 }] },
 *   },
 *   packs: {
 *     credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
 *   },
 *   features: { priority_support: { description: 'Priority support' } },
 * })
 * ```
 */
export function defineBillingCatalog<Catalog extends BillingCatalog>(catalog: Catalog): Catalog {
  return catalog
}

/**
 * The key a plan's product goes by in the generated id map: the plan's own
 * key for its monthly price, `<plan>:year` for its yearly one — so
 * `products.pro` keeps naming the monthly Pro product.
 *
 * @internal
 */
export function planProductKey(plan: string, interval: CatalogInterval): string {
  return interval === 'month' ? plan : `${plan}:${interval}`
}

/**
 * Whether a plan's `prices` are one currency's intervals (`{ month, year }`)
 * rather than a per-currency map.
 */
function isIntervalPrices(prices: CatalogPlan['prices'] | undefined): prices is CatalogPlanPrices {
  return prices !== undefined && CATALOG_INTERVALS.some(interval => interval in prices)
}

/**
 * A plan's prices by currency: one entry per currency it names, or one for
 * `currency` (the catalog's, `undefined` for the provider's default) when it
 * is priced in one.
 *
 * @internal
 */
export function planPricesByCurrency(plan: Pick<CatalogPlan, 'prices'>, currency: string | undefined): Array<[string | undefined, CatalogPlanPrices]> {
  if (!plan.prices) return []
  if (isIntervalPrices(plan.prices)) return [[currency, plan.prices]]
  return Object.entries(plan.prices).map(([code, prices]) => [code.toLowerCase(), prices ?? {}])
}

/**
 * A pack's prices by currency, as {@link planPricesByCurrency} reads a plan's.
 *
 * @internal
 */
export function packPricesByCurrency(pack: Pick<CatalogPack, 'price'>, currency: string | undefined): Array<[string | undefined, number]> {
  if (typeof pack.price === 'number') return [[currency, pack.price]]
  return Object.entries(pack.price ?? {}).map(([code, price]) => [code.toLowerCase(), price])
}

/**
 * The intervals a plan is priced at, monthly first: those any of its
 * currencies prices.
 *
 * @internal
 */
export function pricedIntervals(plan: Pick<CatalogPlan, 'prices'>): CatalogInterval[] {
  const priced = planPricesByCurrency(plan, undefined).map(([, prices]) => prices)
  return CATALOG_INTERVALS.filter(interval => priced.some(prices => typeof prices[interval] === 'number'))
}

/**
 * Whether a plan is the free plan: priced, and at nothing in every
 * currency and at every interval.
 *
 * @internal
 */
export function isFreePlan(plan: Pick<CatalogPlan, 'prices'>): boolean {
  const amounts = planPricesByCurrency(plan, undefined).flatMap(([, prices]) => CATALOG_INTERVALS.flatMap(interval => typeof prices[interval] === 'number' ? [prices[interval]] : []))
  return amounts.length > 0 && amounts.every(amount => amount === 0)
}

/**
 * The catalog's free plan, its key and its plan, or `undefined` when it
 * sells none. A retired plan is never it.
 *
 * @internal
 */
export function freePlanOf(catalog: Pick<BillingCatalog, 'plans'>): [string, CatalogPlan] | undefined {
  return Object.entries(catalog.plans ?? {}).find(([, plan]) => !plan.retired && isFreePlan(plan))
}

/**
 * The credits a plan grants per cycle at `interval`: the interval's own
 * figure, else twelve months' worth of the monthly one for a year.
 *
 * @internal
 */
export function planCreditUnits(grant: CatalogPlanCreditGrant, interval: CatalogInterval): number | undefined {
  if (typeof grant.units === 'number') return interval === 'year' ? grant.units * 12 : grant.units
  return grant.units[interval] ?? (interval === 'year' && grant.units.month !== undefined ? grant.units.month * 12 : undefined)
}

/**
 * The webhook event set `billing sync --webhook` subscribes the provider
 * endpoint to: the provider's full live catalog — the composed handler map
 * covers every one of these (logging, dedupe, consumer dispatch), and
 * anything newer lands in `onUnknownEvent` with a 202. Lives here —
 * dependency-free — so the CLI can import it without pulling Convex runtime
 * code. A unit test pins it against the runtime's refresh set.
 */
export const BILLING_WEBHOOK_PROVISION_EVENTS = [
  'checkout.created',
  'checkout.updated',
  'checkout.expired',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.state_changed',
  'customer_seat.assigned',
  'customer_seat.claimed',
  'customer_seat.revoked',
  'member.created',
  'member.updated',
  'member.deleted',
  'order.created',
  'order.updated',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
  'refund.created',
  'refund.updated',
  'product.created',
  'product.updated',
  'benefit.created',
  'benefit.updated',
  'benefit_grant.created',
  'benefit_grant.cycled',
  'benefit_grant.updated',
  'benefit_grant.revoked',
  'organization.updated',
] as const
