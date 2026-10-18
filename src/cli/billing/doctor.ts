import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Polar } from '@polar-sh/sdk'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { membersListMembers } from '@polar-sh/sdk/funcs/membersListMembers.js'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import type { BillingCatalog } from '../../convex/catalog'
import { finding, type PreflightFinding } from '../../findings'
import { resolveFunctionsDir } from '../../scaffold'
import { listAllPages, MANAGED_BY, type Environment } from './provider'

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
   * Managed catalog key → the product's visibility, its one live fixed price
   * (amount and currency; absent when it has none or several), and how many
   * benefits it carries, for the gift twin checks.
   */
  productByKey: Record<string, { visibility?: string, price?: number, currency?: string, benefits?: number }>
}

/** The managed products by catalog key: each one's visibility, its one live fixed price and its benefit count. */
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
    const fixed = (prices ?? []).filter(price => price.amountType === 'fixed' && !price.isArchived)
    const only = fixed.length === 1 ? fixed[0]! : undefined
    productByKey[metadata.key] = {
      visibility: typeof visibility === 'string' ? visibility : '',
      ...(typeof only?.priceAmount === 'number' ? { price: only.priceAmount } : {}),
      ...(only?.priceCurrency ? { currency: only.priceCurrency } : {}),
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
    const polar = client ?? new Polar({ accessToken: options.accessToken, server: options.environment })
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

/** A product's live fixed price as doctor shows it: its amount, and its currency when the provider names one. */
function showPrice(product: { price?: number, currency?: string }): string {
  return product.price === undefined ? 'unknown' : [product.price, product.currency].filter(part => part !== undefined).join(' ')
}

/** What is wrong with one pack's gift twin, if anything. */
function giftTwinProblem(key: string, state: BillingOrganizationState): string | undefined {
  const twin = state.productByKey[`${key}-gift`]
  if (!twin) return `${key} has no gift product`
  if (twin.visibility !== 'private') return `${key}'s gift product is not private`
  if ((twin.benefits ?? 0) > 0) return `${key}'s gift product carries benefits, which its purchaser would receive`
  const pack = state.productByKey[key]
  // A price that can't be read (none, or several live fixed prices) is not a match.
  if (pack?.price === undefined || twin.price === undefined) return `${key}'s gift price can't be checked: the pack or its gift product has no single live fixed price`
  if (twin.price !== pack.price || twin.currency !== pack.currency) return `${key}'s gift product is priced ${showPrice(twin)}, the pack ${showPrice(pack)}`
  return undefined
}

/**
 * Whether every pack has its gift twin as `billing sync` makes it: there,
 * private, with no benefits, and at the pack's price in its currency. A
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
        'Run `npx nuxt-backend billing sync`: it creates a missing gift product, moves one to its pack\'s price and currency, and detaches its benefits. Make a public one private, and keep each pack at one fixed price, in the provider dashboard.',
      )
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

  if (!state) {
    // No token here is the designed degradation `billing-access` already
    // reports — a second warning would be noise. A token that was refused is
    // worth its own finding: the checks below silently did not run.
    if (tokenPresent) {
      findings.push(finding(
        'billing-organization',
        'warn',
        'BILLING_ACCESS_TOKEN is set here but the provider would not answer with it (expired, revoked, or issued for the other environment) — the catalog cross-checks were skipped.',
        'Issue a fresh organization access token for the active BILLING_ENVIRONMENT, put it in .env.local, and run `npx nuxt-backend env push`.',
      ))
    }
    return findings
  }

  findings.push(state.allowMultipleSubscriptions && plans.length > 1
    ? finding(
        'billing-multiple-subscriptions',
        'warn',
        `The organization lets a customer hold several subscriptions at once while the catalog offers ${plans.length} plans — someone can end up on two of them, and useBilling() reports only the first.`,
        'Turn multiple subscriptions off in the provider dashboard, or keep a single plan in billing.catalog.ts.',
      )
    : finding('billing-multiple-subscriptions', 'pass', state.allowMultipleSubscriptions
        ? 'Multiple subscriptions are allowed, and the catalog offers at most one plan.'
        : 'A customer holds one subscription at a time.'))

  findings.push(plans.length > 1 && state.prorationBehavior === 'next_period'
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

  const trialPlans = plans.filter(([, plan]) => plan.trial)
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
  findings.push(plans.length > 1 && !state.portal.updatePlan
    ? finding(
        'billing-portal',
        'warn',
        `The customer portal cannot change plan while the catalog offers ${plans.length} of them — upgrades and downgrades have to go through a fresh checkout (${pause}).`,
        'Enable plan updates in the provider\'s customer portal settings, or drive upgrades through your own checkout.',
      )
    : finding('billing-portal', 'pass', state.portal.updatePlan
        ? `The customer portal offers plan changes (${pause}).`
        : `The customer portal does not offer plan changes, and the catalog offers at most one plan (${pause}).`))

  findings.push(teamCustomersFinding(state))
  if (packs.length > 0) findings.push(giftTwinsFinding(packs.map(([key]) => key), state))

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
