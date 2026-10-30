import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Polar } from '@polar-sh/sdk'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { membersListMembers } from '@polar-sh/sdk/funcs/membersListMembers.js'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { type BillingCatalog, freePlanOf, planProductKey, pricedIntervals } from '../../convex/catalog'
import { providerClientOptions } from '../../convex/integrations/billing/provider-client'
import { finding, type PreflightFinding } from '../../findings'
import { resolveFunctionsDir } from '../../scaffold'
import { scopedForeverDiscounts } from './discounts'
import { loadGenerated } from './generated'
import { giftablePlans, passProductKey, passPurchaseKey } from './passes'
import { listAllPages, MANAGED_BY, type CatalogIds, type Environment } from './provider'

// --- doctor: catalog ↔ provider cross-checks ---

/** Load the app's `billing.catalog.ts` via native TS import. */
export async function loadCatalog(rootDir: string): Promise<{ catalog: BillingCatalog, path: string } | null> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const path = join(rootDir, functionsDir, 'billing.catalog.ts')
  if (!existsSync(path)) return null
  const module = await import(pathToFileURL(path).href) as { default?: BillingCatalog }
  return { catalog: module.default ?? {}, path }
}

/**
 * The provider-side state `doctor` reads once and cross-checks against the
 * catalog: the organization's subscription + customer-portal settings, plus
 * the benefit type behind every managed catalog key. Flattened out of the
 * provider payloads so {@link collectBillingFindings} stays pure.
 */
export interface BillingOrganizationState {
  slug: string
  /** A customer may hold several subscriptions at the same time. */
  allowMultipleSubscriptions: boolean
  /** How a mid-cycle plan change is charged (`invoice` | `prorate` | `next_period` | …). */
  prorationBehavior: string
  /** How long benefits stay granted after a subscription ends (provider units; 0 = immediately). */
  benefitRevocationGracePeriod: number
  /** One trial per customer, enforced by the provider. */
  preventTrialAbuse: boolean
  /**
   * The provider's own customer emails the organization turned off, among
   * the ones the inbox leans on to tell a person of a charge, a failed payment
   * or an ended subscription (the organization's customer email settings).
   */
  customerEmailsOff: string[]
  /** Customer-portal toggles. */
  portal: { updatePlan: boolean, pause: boolean }
  /** Managed catalog key → benefit type (`custom` is the legacy feature shape). */
  benefitTypeByKey: Record<string, string>
  /**
   * Customers have members: what a workspace's team customer and its
   * member-scoped portal sessions stand on.
   */
  memberModel: boolean
  /** The token may read customer members, the read half of the `members` scopes. */
  membersReadable: boolean
  /**
   * Managed catalog key → the product's visibility, its live fixed prices
   * (currency → amount, `''` for one that names no currency; absent when it
   * has none), and how many benefits it carries, for the gift twin checks.
   */
  productByKey: Record<string, { visibility?: string, prices?: Record<string, number>, benefits?: number }>
}

/**
 * The provider's customer emails billing leans on: the app tells a person of
 * these events in the inbox alone, never by email of its own, so the provider's
 * email is the only one that reaches an inbox. The renewal and trial
 * reminders are the provider's too: the package's own reminders fill only
 * the cycles they leave out.
 */
const RELIED_ON_CUSTOMER_EMAILS = [
  'orderConfirmation',
  'subscriptionConfirmation',
  'subscriptionCycled',
  'subscriptionPastDue',
  'subscriptionCancellation',
  'subscriptionRevoked',
  'subscriptionRenewalReminder',
  'subscriptionTrialConversionReminder',
] as const

/** The names of the customer emails the organization turned off, among the ones billing relies on. */
function customerEmailsOff(settings: Record<string, unknown> | undefined): string[] {
  // A setting the provider does not report is not read as off.
  return RELIED_ON_CUSTOMER_EMAILS.filter(name => settings?.[name] === false)
}

/** The managed products by catalog key: each one's visibility, its live fixed prices and its benefit count. */
async function readManagedProducts(polar: Polar): Promise<BillingOrganizationState['productByKey']> {
  const productByKey: BillingOrganizationState['productByKey'] = {}
  for (const product of await listAllPages(page => productsList(polar, { metadata: { managedBy: MANAGED_BY }, limit: 100, page }))) {
    const { metadata, prices, visibility, benefits } = product as {
      metadata?: Record<string, unknown>
      prices?: Array<{ amountType?: string, priceAmount?: number, priceCurrency?: string, isArchived?: boolean }>
      visibility?: unknown
      benefits?: unknown[]
    }
    if (typeof metadata?.key !== 'string') continue
    const fixed = (prices ?? []).filter(price => price.amountType === 'fixed' && !price.isArchived && typeof price.priceAmount === 'number')
    // A plan's yearly product shares its key: it goes by the generated map's `<plan>:year`.
    productByKey[metadata.interval === 'year' ? planProductKey(metadata.key, 'year') : metadata.key] = {
      visibility: typeof visibility === 'string' ? visibility : '',
      ...(fixed.length > 0 ? { prices: Object.fromEntries(fixed.map(price => [price.priceCurrency ?? '', price.priceAmount!])) } : {}),
      benefits: benefits?.length ?? 0,
    }
  }
  return productByKey
}

/**
 * Read {@link BillingOrganizationState}. Returns `null` when the provider
 * cannot be read at all — an expired or wrong-environment token, a missing
 * scope, or no network — so every check built on it degrades to a skip
 * instead of failing the doctor run.
 *
 * @internal
 */
export async function readBillingOrganizationState(
  options: { accessToken: string, environment: Environment },
  client?: Polar,
): Promise<BillingOrganizationState | null> {
  try {
    const polar = client ?? new Polar(providerClientOptions(options))
    // An organization access token scopes the list to its own organization.
    const organizations = await organizationsListOrganizations(polar, { limit: 1 })
    const organization = organizations.ok ? organizations.value?.result.items[0] : undefined
    if (!organization) return null

    const benefitTypeByKey: Record<string, string> = {}
    for (const benefit of await listAllPages(page => benefitsList(polar, { limit: 100, page }))) {
      const metadata = (benefit as { metadata?: Record<string, unknown> }).metadata
      if (metadata?.managedBy !== MANAGED_BY || typeof metadata.key !== 'string') continue
      benefitTypeByKey[metadata.key] = (benefit as { type?: string }).type ?? ''
    }

    const { subscriptionSettings: subscription, customerPortalSettings: portal } = organization
    const productByKey = await readManagedProducts(polar)
    // A token without the members scopes is refused here; nothing is written.
    const members = await membersListMembers(polar, { limit: 1 })
    return {
      slug: organization.slug,
      allowMultipleSubscriptions: subscription.allowMultipleSubscriptions,
      prorationBehavior: String(subscription.prorationBehavior),
      benefitRevocationGracePeriod: subscription.benefitRevocationGracePeriod,
      preventTrialAbuse: subscription.preventTrialAbuse,
      customerEmailsOff: customerEmailsOff(organization.customerEmailSettings as unknown as Record<string, unknown> | undefined),
      portal: { updatePlan: portal.subscription.updatePlan, pause: portal.subscription.pause ?? false },
      benefitTypeByKey,
      memberModel: organization.featureSettings?.memberModelEnabled === true,
      membersReadable: members.ok,
      productByKey,
    }
  }
  catch {
    return null
  }
}

/**
 * Whether workspaces can bill as team customers: the organization has the
 * member model, and the token reads customer members. Writing members and
 * opening member portal sessions need `members:write` and
 * `customer_sessions:write`, which no read can prove without writing, so
 * the pass names them.
 */
function teamCustomersFinding(state: BillingOrganizationState): PreflightFinding {
  if (!state.memberModel) {
    return finding(
      'billing-team-customers',
      'warn',
      'The provider organization does not have customer members on, so a workspace can\'t bill as a team customer with its owner as a member, and the billing portal can\'t open as the member who asked.',
      'Turn on customer members (the member model) for the organization in the provider\'s settings, or ask the provider to.',
    )
  }
  if (!state.membersReadable) {
    return finding(
      'billing-team-customers',
      'warn',
      'BILLING_ACCESS_TOKEN can\'t read customer members — workspace checkouts and the billing portal will be refused at the provider.',
      'Issue a new organization access token with the members:write and customer_sessions:write scopes (besides the ones it has), put it in .env.local, and run `npx nuxt-backend env push`.',
    )
  }
  return finding('billing-team-customers', 'pass', 'Workspaces bill as team customers; the token reads customer members (it also needs members:write and customer_sessions:write, which a read can\'t check).')
}

/**
 * The provider's own customer emails, which the app leans on. A billing,
 * gift or referral event reaches a person in the app only (the inbox), since
 * the provider emails its customers their receipts, renewals and failed
 * payments; with those emails off, a failed payment reaches no inbox at all.
 */
function customerEmailsFinding(state: BillingOrganizationState): PreflightFinding {
  if (state.customerEmailsOff.length === 0) return finding('billing-customer-emails', 'pass', 'The provider\'s customer emails for a confirmed order, a renewal, a failed payment and a cancelled or ended subscription, and its renewal and trial reminders, are on.')
  return finding(
    'billing-customer-emails',
    'warn',
    `The provider's ${state.customerEmailsOff.map(name => name.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)).join(', ')} customer email${state.customerEmailsOff.length === 1 ? ' is' : 's are'} off. Billing events reach people in the app only, so a renewal charge, a failed payment or an ended subscription would reach no inbox at all while the person is away, and a renewal or a trial's end would come without a reminder.`,
    'Turn the provider\'s customer emails back on in its dashboard (Settings, Customer notifications); the app never sends a copy of them.',
  )
}

/** What stacked subscriptions risk, beside the free plan when the catalog has one. */
function stackedSubscriptionsMessage(catalog: BillingCatalog, offered: number): string {
  const free = freePlanOf(catalog)
  return free
    ? `The organization lets a customer hold several subscriptions at once beside the free plan (${free[0]}) — every billing entity holds it, so a checkout outside the package, which does not upgrade it in place, leaves the customer on two plans, and useBilling() reports only the first.`
    : `The organization lets a customer hold several subscriptions at once while the catalog offers ${offered} plan prices — someone can end up on two of them, and useBilling() reports only the first.`
}

/** The way out of stacked subscriptions: beside the free plan, one paid plan already makes two, so only the setting helps. */
function stackedSubscriptionsFix(catalog: BillingCatalog): string {
  return freePlanOf(catalog)
    ? 'Turn multiple subscriptions off in the provider dashboard (or set `multipleSubscriptions` in setupBilling on purpose).'
    : 'Turn multiple subscriptions off in the provider dashboard, or keep a single plan in billing.catalog.ts.'
}

/** A product's live fixed prices as doctor shows them: each amount, and its currency when the provider names one. */
function showPrices(prices: Record<string, number>): string {
  return Object.entries(prices).map(([currency, amount]) => [amount, currency].filter(part => part !== '').join(' ')).join(', ')
}

/** Whether two products are priced the same amounts in the same currencies. */
function samePrices(a: Record<string, number>, b: Record<string, number>): boolean {
  const entries = (prices: Record<string, number>) => Object.entries(prices).map(([currency, amount]) => `${currency}:${amount}`).sort().join('|')
  return entries(a) === entries(b)
}

/** What is wrong with one pack's gift twin, if anything. */
function giftTwinProblem(key: string, state: BillingOrganizationState): string | undefined {
  const twin = state.productByKey[`${key}-gift`]
  if (!twin) return `${key} has no gift product`
  if (twin.visibility !== 'private') return `${key}'s gift product is not private`
  if ((twin.benefits ?? 0) > 0) return `${key}'s gift product carries benefits, which its purchaser would receive`
  const pack = state.productByKey[key]
  // A price that can't be read (no live fixed price) is not a match.
  if (!pack?.prices || !twin.prices) return `${key}'s gift price can't be checked: the pack or its gift product has no live fixed price`
  if (!samePrices(twin.prices, pack.prices)) return `${key}'s gift product is priced ${showPrices(twin.prices)}, the pack ${showPrices(pack.prices)}`
  return undefined
}

/**
 * Whether every pack has its gift twin as `billing sync` makes it: there,
 * private, with no benefits, and at the pack's prices in every currency. A
 * missing or public twin, one that grants credits, or one at another price
 * sells gifts the catalog does not describe; a price that can't be read
 * can't be vouched for.
 */
function giftTwinsFinding(packKeys: string[], state: BillingOrganizationState): PreflightFinding {
  const problems = packKeys.flatMap(key => giftTwinProblem(key, state) ?? [])
  return problems.length === 0
    ? finding('billing-gift-twins', 'pass', 'Every pack has a private gift product at its price, with no benefits.')
    : finding(
        'billing-gift-twins',
        'warn',
        `${problems.join('; ')} — gifts of ${problems.length === 1 ? 'that pack' : 'those packs'} may be refused, sold at the wrong price, or grant their purchaser credits.`,
        'Run `npx nuxt-backend billing sync`: it creates a missing gift product, moves one to its pack\'s prices in every currency, and detaches its benefits. Make a public one private in the provider dashboard.',
      )
}

/** What is wrong with one plan's pass products, if anything: the free pass product and a purchase product per length. */
function passProblem(key: string, months: readonly number[], state: BillingOrganizationState): string | undefined {
  const pass = state.productByKey[passProductKey(key)]
  if (!pass) return `${key} has no pass product`
  if (pass.visibility !== 'private') return `${key}'s pass product is not private`
  if (!pass.prices || !Object.values(pass.prices).every(amount => amount === 0)) return `${key}'s pass product is not free, so claiming it would charge a card`
  if ((pass.benefits ?? 0) === 0) return `${key}'s pass product carries no benefits, so a workspace on it would hold nothing`
  for (const length of months) {
    const purchase = state.productByKey[passPurchaseKey(key, length)]
    if (!purchase) return `${key} has no ${length}-month gift product`
    if (purchase.visibility !== 'private') return `${key}'s ${length}-month gift product is not private`
    if ((purchase.benefits ?? 0) > 0) return `${key}'s ${length}-month gift product carries benefits, which its purchaser would receive`
  }
  return undefined
}

/**
 * Whether every plan offered as a gift has its pass products as `billing
 * sync` makes them: a free, private pass product that carries the plan's
 * benefits, and a private one-time purchase product per length with none. A
 * missing or public one, a pass that charges, or a purchase that grants the
 * plan to its purchaser sells gifts the catalog does not describe.
 */
function passProductsFinding(plans: Array<[string, readonly number[]]>, state: BillingOrganizationState): PreflightFinding {
  const problems = plans.flatMap(([key, months]) => passProblem(key, months, state) ?? [])
  return problems.length === 0
    ? finding('billing-pass-products', 'pass', 'Every plan offered as a gift has a free pass product with its benefits, and a private purchase product per length.')
    : finding(
        'billing-pass-products',
        'warn',
        `${problems.join('; ')} — gifts of ${problems.length === 1 ? 'that plan' : 'those plans'} may be refused, charge the recipient, or grant nothing.`,
        'Run `npx nuxt-backend billing sync`: it creates the missing products. Make a public one private in the provider dashboard.',
      )
}

/** The plan pass finding, for a catalog that offers a plan as a gift. */
function passFindings(catalog: BillingCatalog, state: BillingOrganizationState): PreflightFinding[] {
  const giftable = giftablePlans(catalog).map(([key, , months]) => [key, months] as [string, readonly number[]])
  return giftable.length > 0 ? [passProductsFinding(giftable, state)] : []
}

/**
 * A package as `require` resolves it: its directory and version, read off its
 * own manifest — through `<name>/package.json` where the package exports it,
 * else its entry point and up to the nearest manifest of that name. `null`
 * when it does not resolve.
 */
function resolvePackage(require: NodeJS.Require, name: string): { dir: string, version: string } | null {
  for (const request of [`${name}/package.json`, name]) {
    try {
      let dir = dirname(require.resolve(request))
      while (dir !== dirname(dir)) {
        const manifest = join(dir, 'package.json')
        // Read, not required: a require is cached for the life of the process.
        const parsed = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string, version?: string } : null
        if (parsed?.name === name && parsed.version) return { dir, version: parsed.version }
        dir = dirname(dir)
      }
    }
    catch {
      // Not resolvable this way (an exports map without it, no entry for require): try the next.
    }
  }
  return null
}

/**
 * Whether the provider SDK the billing component runs on is the line it is
 * built on: `@convex-dev/polar` 0.9 needs the 0.x SDK, which 1.0 rewrote.
 * The SDK is resolved where the component resolves it (its peer, from the
 * component's own location, reached through the app or through
 * nuxt-backend), else from the app. No finding when it does not resolve.
 */
export function providerSdkFindings(rootDir: string): PreflightFinding[] {
  const requireFrom = (dir: string) => createRequire(join(dir, 'package.json'))
  const app = requireFrom(rootDir)
  const backend = resolvePackage(app, 'nuxt-backend')
  const component = resolvePackage(app, '@convex-dev/polar') ?? (backend ? resolvePackage(requireFrom(backend.dir), '@convex-dev/polar') : null)
  const sdk = resolvePackage(component ? requireFrom(component.dir) : app, '@polar-sh/sdk') ?? (component ? resolvePackage(app, '@polar-sh/sdk') : null)
  if (!sdk) return []
  const { version } = sdk
  return [Number.parseInt(version, 10) >= 1
    ? finding('billing-provider-sdk', 'warn', `The billing component (@convex-dev/polar 0.9) resolves @polar-sh/sdk ${version}, but it is built on the 0.x SDK, which 1.0 rewrote: checkout, the portal and webhook parsing break on it.`, 'Pin "@polar-sh/sdk": "^0.49.0" in package.json and reinstall, until nuxt-backend supports the 1.x SDK.')
    : finding('billing-provider-sdk', 'pass', `The billing component resolves @polar-sh/sdk ${version}, the line it is built on.`)]
}

/**
 * Doctor's billing findings: the code-declared catalog against the provider's
 * organization settings. Pure — `state` is `null` whenever the provider could
 * not be read, and each check then degrades to a skip (no finding at all when
 * there is no token to try, one warning when a token was tried and refused).
 * The meter check needs no provider at all: it is a catalog-only truth.
 *
 * @internal
 */
export function collectBillingFindings(
  catalog: BillingCatalog | null,
  state: BillingOrganizationState | null,
  { tokenPresent }: { tokenPresent: boolean },
): PreflightFinding[] {
  // No catalog declared: nothing to cross-check, and every finding would be
  // about a file the app never wrote.
  if (!catalog) return []

  const findings: PreflightFinding[] = []
  const plans = Object.entries(catalog.plans ?? {})
  // What a customer can still choose between: every price of a plan that
  // is not retired — a monthly and a yearly price switch like two plans.
  const sold = plans.filter(([, plan]) => !plan.retired)
  const offered = sold.reduce((count, [, plan]) => count + pricedIntervals(plan).length, 0)
  const packs = Object.entries(catalog.packs ?? {})
  const meters = Object.keys(catalog.meters ?? {})
  const features = Object.keys(catalog.features ?? {})
  const grantsCredits = [...plans, ...packs].some(([, product]) => product.credits)

  // A meter nothing grants and nothing prices is dead weight: spends against
  // it draw on a balance that never gets funded and never gets invoiced.
  if (meters.length > 0) {
    const referenced = new Set([
      ...[...plans, ...packs].flatMap(([, product]) => product.credits ? [product.credits.meter] : []),
      ...plans.flatMap(([, plan]) => (plan.usage ?? []).map(price => price.meter)),
    ])
    const orphans = meters.filter(meter => !referenced.has(meter))
    findings.push(orphans.length === 0
      ? finding('billing-meter-usage', 'pass', `Every catalog meter is funded by a credit grant or billed by a usage price (${meters.join(', ')}).`)
      : finding(
          'billing-meter-usage',
          'warn',
          `No plan or pack grants credits on ${orphans.join(', ')}, and no plan prices usage against ${orphans.length === 1 ? 'it' : 'them'} — spends draw on a balance nothing funds and nothing invoices.`,
          'Give a plan or pack `credits: { meter: … }`, add a `usage` price for it, or drop the meter from billing.catalog.ts.',
        ))
  }

  findings.push(...promotionLimitsFinding(catalog))

  if (!state) {
    // No token here is the designed degradation `billing-access` already
    // reports — a second warning would be noise. A token that was refused is
    // worth its own finding: the checks below silently did not run.
    if (tokenPresent) {
      findings.push(finding(
        'billing-organization',
        'warn',
        'BILLING_ACCESS_TOKEN is set here but the provider would not answer with it (expired, revoked, or issued for the other environment) — the catalog cross-checks were skipped.',
        'Issue a fresh organization access token for the billing environment BACKEND_ENVIRONMENT names (the provider sandbox unless it is production), put it in .env.local, and run `npx nuxt-backend env push`.',
      ))
    }
    return findings
  }

  findings.push(state.allowMultipleSubscriptions && offered > 1
    ? finding(
        'billing-multiple-subscriptions',
        'warn',
        stackedSubscriptionsMessage(catalog, offered),
        stackedSubscriptionsFix(catalog),
      )
    : finding('billing-multiple-subscriptions', 'pass', state.allowMultipleSubscriptions
        ? 'Multiple subscriptions are allowed, and the catalog offers at most one plan.'
        : 'A customer holds one subscription at a time.'))

  findings.push(offered > 1 && state.prorationBehavior === 'next_period'
    ? finding(
        'billing-proration',
        'warn',
        `Plan changes are settled as '${state.prorationBehavior}' — an upgrade grants the new plan's credits and features immediately but is not charged until the next cycle.`,
        'Set the organization\'s proration behaviour to `invoice` or `prorate` if an upgrade should be charged when it happens.',
      )
    : finding('billing-proration', 'pass', `Plan changes are settled as '${state.prorationBehavior}'.`))

  findings.push(state.benefitRevocationGracePeriod > 0 && (features.length > 0 || grantsCredits)
    ? finding(
        'billing-benefit-grace',
        'warn',
        `Benefits stay granted for a grace period (${state.benefitRevocationGracePeriod}) after a subscription ends — useFeatures().has() keeps returning true and granted credits stay spendable for that long.`,
        'Set the benefit revocation grace period to 0 in the provider dashboard if access must stop the moment a subscription ends.',
      )
    : finding('billing-benefit-grace', 'pass', state.benefitRevocationGracePeriod > 0
        ? `A benefit revocation grace period (${state.benefitRevocationGracePeriod}) is set, and the catalog grants no benefits.`
        : 'Benefits are revoked as soon as a subscription ends.'))

  const trialPlans = sold.filter(([, plan]) => plan.trial && !plan.trial.pass)
  findings.push(trialPlans.length > 0 && !state.preventTrialAbuse
    ? finding(
        'billing-trial-abuse',
        'warn',
        `${trialPlans.map(([key]) => key).join(', ')} offer${trialPlans.length === 1 ? 's' : ''} a trial but the organization does not prevent trial abuse — the same customer can start the trial again and again.`,
        'Turn on trial abuse prevention in the provider dashboard.',
      )
    : finding('billing-trial-abuse', 'pass', trialPlans.length === 0
        ? 'No plan declares a trial.'
        : 'Trials are limited to one per customer.'))

  const pause = `pause: ${state.portal.pause ? 'on' : 'off'}`
  findings.push(offered > 1 && !state.portal.updatePlan
    ? finding(
        'billing-portal',
        'warn',
        `The customer portal cannot change plan while the catalog offers ${offered} plan prices — upgrades, downgrades and a switch to yearly have to go through a fresh checkout (${pause}).`,
        'Enable plan updates in the provider\'s customer portal settings, or drive upgrades through your own checkout.',
      )
    : finding('billing-portal', 'pass', state.portal.updatePlan
        ? `The customer portal offers plan changes (${pause}).`
        : `The customer portal does not offer plan changes, and the catalog offers at most one plan (${pause}).`))

  findings.push(customerEmailsFinding(state))
  findings.push(...promotionPortalFinding(catalog, state))
  findings.push(teamCustomersFinding(state))
  if (packs.length > 0) findings.push(giftTwinsFinding(packs.map(([key]) => key), state))
  findings.push(...passFindings(catalog, state))

  if (features.length > 0) {
    const legacy = features.filter(key => state.benefitTypeByKey[key] === 'custom')
    findings.push(legacy.length === 0
      ? finding('billing-feature-benefits', 'pass', 'Feature benefits use the provider\'s native feature-flag type.')
      : finding(
          'billing-feature-benefits',
          'warn',
          `Feature benefit${legacy.length === 1 ? '' : 's'} ${legacy.join(', ')} still ${legacy.length === 1 ? 'is' : 'are'} the generic custom type — the customer portal lists ${legacy.length === 1 ? 'it' : 'them'} as a note rather than a feature.`,
          'Delete them in the provider dashboard (or drop their managed tag) and re-run `npx nuxt-backend billing sync` to recreate them as feature flags — gating matches on the metadata key either way, so useFeatures() keeps working meanwhile.',
        ))
  }

  return findings
}

/** The catalog's promotions that still run: every discount it does not retire. */
function runningPromotions(catalog: BillingCatalog): Array<[string, NonNullable<BillingCatalog['discounts']>[string]]> {
  return Object.entries(catalog.discounts ?? {}).filter(([, discount]) => !discount.retired)
}

/**
 * Public promotions that can run without limit: a code with no
 * per-customer limit, no total cap or no end. Coupon sites list codes, so
 * a public one is redeemed by whoever finds it. No finding without a
 * promotion.
 */
function promotionLimitsFinding(catalog: BillingCatalog): PreflightFinding[] {
  const promotions = runningPromotions(catalog)
  if (promotions.length === 0) return []
  const open = promotions.flatMap(([key, discount]) => {
    if (!discount.code) return []
    const missing = [discount.perCustomer === undefined && 'perCustomer', discount.maxRedemptions === undefined && 'maxRedemptions', discount.endsAt === undefined && 'endsAt'].filter(Boolean)
    return missing.length > 0 ? [`${key} (no ${missing.join(', ')})`] : []
  })
  return [open.length === 0
    ? finding('billing-promotion-limits', 'pass', 'Every public promotion has a per-customer limit, a total cap and an end date.')
    : finding(
        'billing-promotion-limits',
        'warn',
        `Public promotion${open.length === 1 ? '' : 's'} ${open.join('; ')} can run without that limit: anyone who finds the code redeems it.`,
        'Give each discount with a `code` a `perCustomer` limit, a `maxRedemptions` cap and an `endsAt` in billing.catalog.ts, then run `npx nuxt-backend billing sync`.',
      )]
}

/**
 * A forever discount scoped to some plans while the portal changes plans:
 * the provider keeps a subscription's discount across any plan change, so
 * the portal carries it onto plans it was never for. No finding without a
 * promotion.
 */
function promotionPortalFinding(catalog: BillingCatalog, state: BillingOrganizationState): PreflightFinding[] {
  if (runningPromotions(catalog).length === 0) return []
  const scoped = scopedForeverDiscounts(catalog)
  if (scoped.length === 0 || !state.portal.updatePlan) {
    return [finding('billing-promotion-portal', 'pass', scoped.length === 0
      ? 'No forever promotion is limited to some plans.'
      : 'The customer portal does not change plans, so a forever promotion stays on the plans it is for.')]
  }
  return [finding(
    'billing-promotion-portal',
    'warn',
    `${scoped.join(', ')} ${scoped.length === 1 ? 'takes' : 'take'} money off forever on some plans only, while the customer portal changes plans: the provider keeps a subscription's discount across any plan change, so a customer moves it onto a plan it was never for.`,
    'Turn off plan changes in the provider\'s customer portal settings and change plans through your own checkout, or make the discount once or { months }.',
  )]
}

// --- doctor --prod: the catalog against its production ids ---

/**
 * The catalog keys the production ids lack: every price of a plan still
 * sold (`pro`, `pro:year`), every pack, every meter and every promotion,
 * as `billing sync --env production` writes them into
 * `billing.generated.ts`. A retired plan or promotion sells nothing new,
 * so it is not asked for.
 */
export function missingProductionIds(catalog: BillingCatalog, ids: Partial<CatalogIds> | undefined): string[] {
  const products = ids?.products ?? {}
  const plans = Object.entries(catalog.plans ?? {})
    .filter(([, plan]) => !plan.retired)
    .flatMap(([key, plan]) => pricedIntervals(plan)
      .filter(interval => !ids?.plans?.[key]?.[interval] && !products[planProductKey(key, interval)])
      .map(interval => planProductKey(key, interval)))
  const packs = Object.keys(catalog.packs ?? {}).filter(key => !products[key])
  const meters = Object.keys(catalog.meters ?? {}).filter(key => !ids?.meters?.[key]).map(key => `meter ${key}`)
  const discounts = Object.entries(catalog.discounts ?? {}).filter(([key, discount]) => !discount.retired && !ids?.discounts?.[key]).map(([key]) => `discount ${key}`)
  return [...plans, ...packs, ...meters, ...discounts]
}

/**
 * Whether production can sell the catalog: every plan price, pack, meter
 * and promotion has its production id. A gap fails once production bills in the
 * production environment (checkout of it is refused there), and warns
 * while it bills elsewhere, on purpose or by default. No finding without a
 * catalog, or when the id map does not load (`billing sync` reports that).
 */
export async function productionCatalogFindings(rootDir: string, environment: 'sandbox' | 'production' | 'unset' | 'unread'): Promise<PreflightFinding[]> {
  let catalog: BillingCatalog | undefined
  let ids: Partial<CatalogIds> | undefined
  try {
    catalog = (await loadCatalog(rootDir))?.catalog
    if (!catalog) return []
    ids = (await loadGenerated(rootDir)).production
  }
  catch {
    return []
  }
  const missing = missingProductionIds(catalog, ids)
  if (missing.length === 0) return [finding('billing-catalog-production', 'pass', 'Every plan price, pack, meter and promotion of the catalog has its production id.')]
  const gap = `The catalog has no production id for ${missing.join(', ')}`
  const hint = 'Run npx nuxt-backend billing sync --env production, and commit the billing.generated.ts it writes.'
  return [environment === 'production'
    ? finding('billing-catalog-production', 'fail', `${gap}: production refuses their checkout.`, hint)
    : finding('billing-catalog-production', 'warn', `${gap}: once production bills in the production environment, their checkout is refused.`, hint)]
}
