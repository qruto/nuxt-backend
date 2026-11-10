<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, type Ref } from 'vue'
import { useRoute } from '#imports'
import { formatBillingAmount, formatBillingDate, formatUnitPrice } from '../../composables/billing-format'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useBilling } from '../../composables/use-billing'
import { useCampaign } from '../../composables/use-campaign'
import { useCredits } from '../../composables/use-credits'
import { useExperimentDiscount } from '../../composables/use-experiment'
import { refusalText, useLabels, type BackendLabels, type LabelKey, type LabelOverrides } from '../../composables/use-labels'
import { usePricing, type PricedOffer, type PricedPlan, type PricingInterval, type PricingSuccessUrls, type UsePricingReturn } from '../../composables/use-pricing'
import { busyAttributes } from '../../a11y'
import { useAuthSession } from '../../utils/auth-session'
import { getBackendError } from '../../utils/backend-error'
import { createCancelConfirm } from '../../utils/cancel-confirm'
import { CONFIRMED_PRORATION, createPlanChangeConfirm, type PlanChangeTarget } from '../../utils/plan-change-confirm'
import { returnFocus } from '../../utils/focus-return'
import { useMeterUnit } from '../../utils/meter-unit'
import { pricingBindings, shownInterval } from '../../utils/pricing-bindings'
import type { CreditPack, PricingContact, PricingPlan } from '../../../config'
import { providePricingView, type PlanAction, type PlanTrial, type PricingSlotContext, type PricingTableSlots, type ResolvedPack, type ResolvedPlan } from './pricing-table'

/**
 * A complete pricing table, rendered on the server: plan cards from the
 * live pricing (`usePricing`, the scaffolded `getPricing`), a monthly /
 * yearly switch with what a year saves, subscribe / switch / cancel
 * actions, credit packs compared credit for credit, a contact card, and a
 * customer-portal link. The app's copy — which plans, their blurbs and
 * features, the highlight — comes from `appConfig.backend.billing` or the
 * `plans` / `packs` props; names, prices, trials and credits always come
 * live from billing, so the page cannot drift from what checkout charges.
 *
 * Built from parts (`PricingPeriodSwitch`, `PricingCurrencySelect`,
 * `PricingPlanCard`, `PricingPackCard`, `PricingCancelConfirm`) that a
 * same-named component of the app's replaces; every element carries a
 * `data-pricing` attribute, and each region has its slot.
 *
 * A subscriber's switch to another plan or billing period asks first, in
 * one step: the price it moves to, when the switch happens (a yearly price
 * left for a monthly one waits for the paid year's end) and how the
 * period's difference is settled (`useBilling().changeOf`), then switches
 * settling it at once (`proration: 'invoice'`), whatever the provider's
 * default. The price it states is in the subscription's own currency,
 * which the provider keeps on a switch, and a plan with no price in it is
 * offered no switch. A gifted plan's holder is asked too: their switch is
 * a checkout of the new plan, which ends the gift in its place. The address
 * picks what shows: `?interval=year` the yearly prices, `?plan=<key>`
 * the card it marks and scrolls into view. A promotion runs by the
 * server's clock while the page hydrates, so its window reads the same in
 * the HTML and the browser, then by the browser's from the moment the page
 * is on screen or is entered again.
 *
 * Signed-out visitors get a sign-in link that returns to this very address
 * (a campaign link's discount and UTM included) instead of checkout
 * actions, a checkout carries the address's campaign (`useCampaign`), a
 * promotion says its real terms and end date on each price it applies to,
 * and a workspace member who manages none of its billing sees the plans and
 * packs without their buttons, with one note (`data-pricing="managed"`).
 */
defineOptions({ name: 'PricingTable' })

const props = withDefaults(defineProps<{
  /** The plan cards, in order, with their copy. Default: `appConfig.backend.billing.plans`, else every plan on sale. */
  plans?: PricingPlan[]
  /** The credit packs, in order. Default: `appConfig.backend.billing.packs`, else every pack on sale. */
  packs?: CreditPack[]
  /** A contact card after the plans; `null` hides the configured one. Default: `appConfig.backend.billing.contact`. */
  contact?: PricingContact | null
  /** The interval the plans show (`v-model:interval`). Default: the address's `?interval=` when a plan sells at it, else monthly, when a plan is priced by the month. */
  interval?: PricingInterval
  /** A heading above the table; none by default. The shipped page passes the `pricing.title` label. */
  title?: string
  /**
   * The element the title renders as. The shipped `/pricing` page passes
   * `'h1'` — there the table is the page; embedded in an app page it stays
   * the `'h2'` default under the page's own heading.
   */
  heading?: 'h1' | 'h2'
  showPacks?: boolean
  showPortal?: boolean
  /** Same-tab redirect checkout (billing returns here). Default `true`. */
  redirect?: boolean
  /**
   * A public promotion of the catalog to offer, by its key (`'launch'`):
   * each price it applies to says its terms ("20% off for 3 months, then
   * $10/mo") and its real end date, from its start to its end, and its
   * checkout applies it. Not shown to a paying subscriber, whose plan
   * change takes no discount. Default: the campaign link's code
   * (`?discount=`), when it is a promotion's, else the promotion a price
   * test shows the person (an experiment's `discounts`).
   */
  discount?: string
  /**
   * Where a checkout returns once paid, per kind: `{ plan: '/welcome', pack:
   * '/credits' }`, or a function of the plan or pack bought. A path is on the site.
   * Default: back to this page.
   */
  successUrl?: PricingSuccessUrls
  /** Copy for this table, over `appConfig.backend.labels.pricing` and the translations. */
  labels?: LabelOverrides<BackendLabels['pricing']>
}>(), {
  plans: undefined,
  packs: undefined,
  contact: undefined,
  interval: undefined,
  title: undefined,
  heading: 'h2',
  showPacks: true,
  showPortal: true,
  redirect: true,
  discount: undefined,
  successUrl: undefined,
  labels: undefined,
})

const emit = defineEmits({
  'update:interval': (_interval: PricingInterval) => true,
  'checkout': (_url: string) => true,
  'plan-changed': (_key: string) => true,
  'canceled': () => true,
  'uncanceled': () => true,
  'topped-up': (_key: string) => true,
  'error': (_message: string) => true,
})
const slots = defineSlots<PricingTableSlots>()

const billing = useBilling()
const credits = useCredits()
const campaign = useCampaign()
// A price test's promotion for the person's variant, when the address carries no campaign code.
const experimentDiscount = useExperimentDiscount()
const pricing = usePricing({
  discount: () => props.discount ?? campaign.discountCode.value ?? experimentDiscount.value,
  actions: false,
  // Read when a checkout starts, so a changed prop counts.
  successUrl: {
    get plan() { return props.successUrl?.plan },
    get pack() { return props.successUrl?.pack },
  },
})
// A subscriber's switch keeps the subscription's currency (the provider's
// rule), so its confirmation states the price in it: read apart, in the
// browser, only while the page shows another one.
const subscriptionCurrency = computed(() => {
  const currency = billing.subscription.value?.currency
  return typeof currency === 'string' && currency !== '' ? currency.toLowerCase() : undefined
})
const switchPricing = usePricing({
  server: false,
  actions: false,
  currency: () => subscriptionCurrency.value,
  enabled: () => billing.isSubscribed.value && billing.pass.value === null && subscriptionCurrency.value !== undefined
    && pricing.currency.value !== undefined && subscriptionCurrency.value !== pricing.currency.value,
})
const route = useRoute()
const { isAuthenticated } = useAuthSession()
const config = useBackendConfig()
const labels = useLabels('pricing', () => props.labels)
const { t, locale } = labels
const unit = useMeterUnit()
const login = useBackendPagePath('login')
const uid = useId()

const pending: Ref<string | null> = ref(null)
// What the running action waits for, announced by the status region.
const progress: Ref<(() => string) | null> = ref(null)
// How to word the last action's failure: read when it renders, so a locale switch rewords it.
const error: Ref<(() => string) | null> = ref(null)

// The interval shown: the parent's (`v-model:interval`), else the one
// picked here, else the address's (`?interval=year`) when a plan sells at
// it, else monthly when a plan is priced by the month.
const picked = ref<PricingInterval | null>(null)
const interval = computed<PricingInterval>(() => props.interval ?? picked.value ?? pricing.interval.value)
const setInterval = (next: PricingInterval) => {
  picked.value = next
  emit('update:interval', next)
}

// The app's copy decides which cards and in which order; without any,
// every plan and pack on sale, in catalog order.
const planCards = computed(() => props.plans ?? (config.billing.plans.length > 0 ? config.billing.plans : (pricing.plans.value ?? []).map(plan => ({ key: plan.key }))))
const packCards = computed(() => props.packs ?? (config.billing.packs.length > 0 ? config.billing.packs : (pricing.packs.value ?? []).map(pack => ({ key: pack.key }))))
const contact = computed(() => (props.contact === undefined ? config.billing.contact ?? null : props.contact))

// The promotion that runs now, by the page's clock: the server's while
// hydrating, so the HTML and the hydrated page agree on it, then the browser's.
const promotion = computed(() => pricing.activePromotion.value)

const subscribedId = computed(() => billing.subscription.value?.productId)
// The plan a link asked for (`?plan=<key>`, as `<UpgradePrompt>` sends it): its card is marked.
const requested = computed(() => (typeof route.query.plan === 'string' ? route.query.plan : undefined))

// What the customer pays per month today, so a plan card can say whether
// switching to it is a step up or down rather than an unlabelled "switch".
const currentMonthly = computed(() => {
  if (!subscribedId.value) return undefined
  for (const plan of pricing.plans.value ?? []) {
    for (const price of Object.values(plan.prices)) if (price?.productId === subscribedId.value) return price.monthly
  }
  return undefined
})

function resolvePlan(card: PricingPlan, offer: PricedPlan): ResolvedPlan | null {
  // The interval the card shows: an archived price only to its subscriber.
  const at = shownInterval(offer, interval.value, subscribedId.value)
  if (!at) return null
  const priceAt = offer.prices[at]!
  const isCurrent = Object.values(offer.prices).some(price => price?.productId === subscribedId.value)
  const comparable = !isCurrent && currentMonthly.value !== undefined
  const scheduled = billing.pendingChange.value
  const scheduledFor = scheduled?.productId === priceAt.productId ? scheduled.appliesAt : undefined
  // The free plan is free in every currency: in the page's, whatever its product's.
  const priceCurrency = offer.free ? pricing.currency.value ?? priceAt.currency : priceAt.currency
  return {
    ...card,
    offer,
    name: offer.name,
    interval: at,
    priceAt,
    price: formatBillingAmount(priceAt.amount, priceCurrency, locale.value),
    ...(priceAt.credits ? { credits: priceAt.credits } : {}),
    ...(priceAt.savings === undefined ? {} : { savings: priceAt.savings }),
    ...(priceAt.trial ? { trial: priceAt.trial } : {}),
    features: card.features ?? offer.features,
    isCurrent,
    isCurrentPrice: priceAt.productId === subscribedId.value,
    ...(scheduledFor ? { scheduledFor } : {}),
    isRetired: offer.retired,
    isFree: offer.free === true,
    isRequested: requested.value === card.key,
    isUpgrade: comparable && priceAt.monthly > currentMonthly.value!,
    isDowngrade: comparable && priceAt.monthly < currentMonthly.value!,
    // Offered only where a checkout would take it: never on a paying
    // subscriber's cards, whose plan change goes through without one.
    ...(promotion.value && priceAt.promotion && !isCurrent && !billing.isSubscribed.value ? { promotion: priceAt.promotion } : {}),
  }
}

const resolvedPlans = computed<ResolvedPlan[]>(() => {
  const offers = new Map((pricing.plans.value ?? []).map(plan => [plan.key, plan]))
  return planCards.value.flatMap((card) => {
    const offer = offers.get(card.key)
    const plan = offer ? resolvePlan(card, offer) : null
    // A retired plan is its subscribers' alone.
    return plan && (!plan.isRetired || plan.isCurrent) ? [plan] : []
  })
})
// While billing is not launched on the deployment, nothing is on sale: no switch, no pack, a "Plans open soon" status.
const onSale = computed(() => pricing.launched.value !== false)
const switchesInterval = computed(() => onSale.value && pricing.intervals.value.length >= 2)
const switchesCurrency = computed(() => onSale.value && pricing.currencies.value.length >= 2)
const resolvedPacks = computed<ResolvedPack[]>(() => {
  const offers = new Map((pricing.packs.value ?? []).map(pack => [pack.key, pack]))
  return packCards.value.flatMap((card) => {
    const offer = offers.get(card.key)
    if (!offer) return []
    return [{
      ...card,
      offer,
      name: offer.name,
      price: formatBillingAmount(offer.amount, offer.currency, locale.value),
      ...(offer.credits ? { credits: offer.credits.units } : {}),
      ...(offer.perCredit === undefined ? {} : { perCredit: formatUnitPrice(offer.perCredit, offer.currency, locale.value) }),
      ...(offer.lessPerCredit === undefined ? {} : { lessPerCredit: offer.lessPerCredit }),
      isBestValue: offer.isBestValue,
      ...(promotion.value && offer.promotion ? { promotion: offer.promotion } : {}),
    }]
  })
})
const currentPlan = computed(() => resolvedPlans.value.find(plan => plan.isCurrent) ?? null)
// Whether the entity has a plan is not known yet (loading), or could not be
// read: nothing may offer a first subscription or a trial until it is, or a
// subscriber could start a second one.
const unknownPlan = computed(() => billing.subscription.value === undefined)
// Why the pricing could not be read, else why the subscription could not.
const readError = computed(() => {
  if (pricing.error.value) return pricing.error.value
  return unknownPlan.value && !billing.isLoading.value ? billing.error.value : null
})
const shownError = computed(() => error.value?.() ?? (readError.value ? labels.errorMessage(readError.value) : null))

/**
 * Run one action, one at a time. A second press of a busy button does
 * nothing: the button stays focusable (`aria-disabled`) rather than
 * `disabled`, which would drop focus to the page. Nor does any other press
 * while an action runs: `pending` holds one key, and the first action's end
 * would clear the second's.
 */
async function run(key: string, busy: () => string, action: () => Promise<unknown>) {
  if (pending.value !== null) return
  error.value = null
  pending.value = key
  progress.value = busy
  try {
    await action()
  }
  catch (e) {
    error.value = () => refusalText(labels, e)
    emit('error', error.value())
  }
  finally {
    pending.value = null
    progress.value = null
  }
}

const planByKey = (key: string) => resolvedPlans.value.find(plan => plan.key === key)

/**
 * The currency a card's price shows in, for its checkout to pay in it: a
 * product the catalog prices in one currency only shows, and is paid, in
 * that one whatever the page's. Named only where the catalog prices more
 * than one; a single-currency checkout keeps the provider's own.
 */
const payIn = (currency: string | undefined): { currency?: string } =>
  currency && pricing.currencies.value.length > 1 ? { currency } : {}

/** A refusal of a checkout's discount: an expired, used-up or unknown campaign code, or a promotion no longer redeemed. */
function refusedCode(failure: unknown): boolean {
  const refusal = getBackendError(failure)
  const field = (refusal?.data as { field?: unknown } | undefined)?.field
  return refusal?.code === 'invalid_input' && (field === 'discountCode' || field === 'discount')
}

/**
 * A checkout with the address's campaign: its discount code and UTM. The
 * table's own promotion (`discount`, else a price test's for a link with
 * no code) goes in the code's place on a product it is offered on (one
 * discount per checkout); elsewhere the campaign's code still goes. A discount the server refuses never blocks the purchase:
 * the checkout opens again without it, the attribution kept.
 */
async function withCampaign<T>(offered: boolean, start: (campaignOptions: { discountCode?: string, discount?: string, utm?: typeof campaign.checkoutOptions.value.utm }) => Promise<T>): Promise<T> {
  const { discountCode, ...attribution } = campaign.checkoutOptions.value
  const promotion = props.discount ?? (discountCode ? undefined : experimentDiscount.value)
  const options = promotion && offered
    ? { ...attribution, discount: promotion }
    : { ...attribution, ...(discountCode ? { discountCode } : {}) }
  try {
    return await start(options)
  }
  catch (failure) {
    if (!('discountCode' in options || 'discount' in options) || !refusedCode(failure)) throw failure
    return start(attribution)
  }
}

// The EU soft opt-in's box, under the checkout buttons while a topic takes it: ticked, the paid order joins no topic.
const emailOptOut = ref(false)
const showsEmailOptOut = computed(() => billing.softOptIn?.value === true && isAuthenticated.value && billing.canManage.value)
/** What a checkout says of the box: only where it showed. */
const optOut = () => (showsEmailOptOut.value ? { emailOptOut: emailOptOut.value } : {})

const subscribe = (key: string) => run(key, () => t('checkingOut'), async () => {
  const plan = planByKey(key)
  if (!plan) return
  const url = await withCampaign(Boolean(plan.promotion), options => billing.checkout(plan.priceAt.productId, { redirect: props.redirect, ...payIn(plan.priceAt.currency), ...optOut(), ...returnTo('plan', key), ...options }))
  if (!props.redirect && url) emit('checkout', url)
})
/** A gifted plan's holder moves to another plan by checking it out: the checkout replaces the pass in place. */
async function checkOutFromPass(key: string): Promise<void> {
  await subscribe(key)
  if (error.value === null) change.settle()
}
const switchTo = (key: string) => run(key, () => t('changing'), async () => {
  const plan = planByKey(key)
  if (!plan) return
  await billing.changePlan(plan.priceAt.productId, { proration: CONFIRMED_PRORATION })
  change.settle()
  emit('plan-changed', key)
  // The step went with the switch: focus moves to the card's action, else the current plan's.
  void nextTick(() => returnFocus(root.value?.querySelector<HTMLElement>(`[aria-labelledby="${uid}-plan-${key}"] [data-pricing="plan-action"]`)
    ?? root.value?.querySelector<HTMLElement>('[data-pricing="plan"][data-current] [data-pricing="plan-action"]')))
})

/** Where a checkout of this kind returns, when the `successUrl` prop names it. */
function returnTo(kind: 'plan' | 'pack', key: string): { successUrl?: string } {
  const url = pricing.successUrlFor(kind, key)
  return url ? { successUrl: url } : {}
}

/**
 * The price a switch to a card's plan is about. A subscriber's is in the
 * subscription's currency: `null` while that price is read, `undefined`
 * when the plan has none in it, which no switch can move to. A gifted
 * plan's holder checks out, in the card's own.
 */
function changeTarget(plan: ResolvedPlan): PlanChangeTarget | null | undefined {
  const price = billing.pass.value === null ? priceInSubscriptionCurrency(plan) : plan.price
  if (price === null) return null
  if (price === '') return undefined
  // Their own plan at the other period is named with it: "Pro, billed yearly".
  const name = plan.isCurrent ? t(`billedAt.${plan.interval}` as LabelKey<BackendLabels['pricing']>, { plan: plan.name }) : plan.name
  return { key: plan.key, productId: plan.priceAt.productId, plan: name, price: `${price}${t(`period.${plan.interval}` as LabelKey<BackendLabels['pricing']>)}` }
}

/** A card's price in the subscription's currency, formatted: `null` while it is read, `''` when the product has no price in it. */
function priceInSubscriptionCurrency(plan: ResolvedPlan): string | null {
  const currency = subscriptionCurrency.value
  if (!currency || plan.priceAt.currency === currency) return plan.price
  const offers = switchPricing.plans.value
  if (offers === undefined) return null
  const at = offers.find(entry => entry.key === plan.key)?.prices[plan.interval]
  // A product with no price in it comes back in the catalog's currency.
  return at?.productId === plan.priceAt.productId && at.currency === currency ? formatBillingAmount(at.amount, at.currency, locale.value) : ''
}
const root = ref<HTMLElement | null>(null)
// Cancelling the current plan takes one step: its button opens what ends
// when and the one button that cancels, nothing else.
const confirm = createCancelConfirm({
  family: 'pricing',
  titleTag: 'p',
  partId: part => `${uid}-cancel-${part}`,
  isBusy: () => pending.value !== null && pending.value === currentPlan.value?.key,
  confirm: () => currentPlan.value && cancelPlan(currentPlan.value.key),
  t,
  endsOn: () => formatBillingDate(billing.subscription.value?.currentPeriodEnd, { dateStyle: 'medium' }, locale.value) || null,
})
// A subscriber's switch takes one step too: the price it moves to, when,
// and how the period's difference is settled, then the button that switches.
// A gifted plan's holder reads that theirs is a checkout that ends the gift.
const change = createPlanChangeConfirm({
  family: 'pricing',
  titleTag: 'p',
  partId: part => `${uid}-change-${part}`,
  isBusy: () => pending.value !== null && pending.value === change.target.value?.key,
  preview: productId => billing.changeOf(productId),
  confirm: target => (billing.pass.value === null ? switchTo(target.key) : checkOutFromPass(target.key)),
  t,
  date: value => formatBillingDate(value, { dateStyle: 'medium' }, locale.value) || null,
  gifted: target => (billing.pass.value === null ? null : t('changeGifted', { price: target.price })),
})
function cancelPlan(key: string): Promise<void> {
  return run(key, () => t('canceling'), async () => {
    await billing.cancel()
    confirm.settle()
    emit('canceled')
    // The button pressed went with the step: focus moves to the current plan's button.
    void nextTick(() => returnFocus(root.value?.querySelector<HTMLElement>('[data-pricing="plan"][data-current] [data-pricing="plan-action"]')))
  })
}
const uncancelPlan = (key: string) => run(key, () => t('uncanceling'), async () => {
  await billing.uncancel()
  emit('uncanceled')
})
const buyPack = (key: string) => run(key, () => t('checkingOut'), async () => {
  const pack = resolvedPacks.value.find(item => item.key === key)
  if (!pack) return
  const url = await withCampaign(Boolean(pack.promotion), options => credits.topUp(pack.offer.productId, { redirect: props.redirect, ...payIn(pack.offer.currency), ...optOut(), ...returnTo('pack', key), ...options }))
  if (!props.redirect && url) emit('checkout', url)
  emit('topped-up', key)
})
const openPortal = () => run('portal', () => t('openingPortal'), async () => {
  await billing.portal({ redirect: true })
})

// Back to this very address after signing in: a campaign's discount and
// UTM, and a deep link's `?plan=`, ride along in the query.
const loginPath = computed(() => `${login.value ?? ''}?redirect=${encodeURIComponent(route.fullPath)}`)

// A member who manages none of the workspace's billing gets no button the
// server would refuse: one note instead.
const manages = () => !isAuthenticated.value || billing.canManage.value

/** The pricing the parts receive: the live pricing, the interval shown, and the table's own bindings. */
const table: UsePricingReturn = {
  ...pricing,
  interval,
  setInterval,
  pending,
  bind: pricingBindings({
    interval,
    setInterval,
    pending,
    manages,
    act: (plan) => {
      const resolved = planByKey(plan.key)
      if (!resolved) return
      // A gifted plan is no subscription the provider switches: its holder checks the plan out.
      return billing.isSubscribed.value && billing.pass.value === null ? switchTo(resolved.key) : subscribe(resolved.key)
    },
    planLabel: plan => planByKey(plan.key)?.name ?? plan.name,
  }),
}

const context = computed<PricingSlotContext>(() => ({
  billing,
  credits,
  pricing: table,
  plans: resolvedPlans.value,
  packs: resolvedPacks.value,
  currentPlan: currentPlan.value,
  contact: contact.value,
  interval: interval.value,
  intervals: pricing.intervals.value,
  setInterval,
  currency: pricing.currency.value,
  currencies: pricing.currencies.value,
  promotion: promotion.value,
  setCurrency: pricing.setCurrency,
  pending: pending.value,
  error: shownError.value,
  isAuthenticated: isAuthenticated.value,
  loginPath: loginPath.value,
  subscribe,
  switchTo,
  cancelPlan,
  uncancelPlan,
  buyPack,
  openPortal,
}))

/** `'7-day free trial'` — the length comes from the live product, the words from `pricing.trial.<interval>`. */
const trialText = (trial: PlanTrial): string =>
  t(`trial.${trial.interval}` as LabelKey<BackendLabels['pricing']>, { count: trial.count })

/** What a plan card's action area shows: the app's slot, a sign-in link, a note, or the plan's own button. */
function planAction(plan: ResolvedPlan): PlanAction {
  if (slots['plan-action']) return { kind: 'slot' }
  if (!isAuthenticated.value) return { kind: 'sign-in', href: loginPath.value, text: t(plan.isFree ? 'signInFree' : 'signIn') }
  if (!manages()) return { kind: 'none' }
  // The free plan's card has no button: the workspace is on it until it
  // buys a plan, and back on it when that one ends — which a paid
  // subscriber's card says.
  if (plan.isFree) return billing.isSubscribed.value && !plan.isCurrent ? { kind: 'note', hook: 'plan-returns', text: t('returnsToFree') } : { kind: 'none' }
  if (plan.isCurrentPrice) {
    return billing.cancelAtPeriodEnd.value
      ? { kind: 'button', intent: 'uncancel', idle: t('uncancel'), busy: t('uncanceling'), run: () => uncancelPlan(plan.key) }
      : { kind: 'cancel' }
  }
  // The subscription moves here when its period ends: say when, rather than
  // offer the same change again.
  if (plan.scheduledFor) return { kind: 'note', hook: 'plan-scheduled', text: t('scheduled', { date: formatBillingDate(plan.scheduledFor, { dateStyle: 'medium' }, locale.value) }) }
  if (billing.isSubscribed.value) {
    // Their own plan at the other interval is a switch of billing period; a
    // retired one is never switched to. A switch asks first: a subscriber's
    // what `changeOf` previews, a gifted plan's holder's that it is a
    // checkout; one the preview cannot describe goes at once. One to a plan
    // with no price in the subscription's currency is none the provider
    // makes; one whose price in it is still being read waits.
    const target = changeTarget(plan)
    if (target === undefined) return { kind: 'none' }
    const asks = billing.pass.value !== null || billing.changeOf(plan.priceAt.productId) !== null
    const switching = (intent: string, idle: string): PlanAction => target === null
      ? { kind: 'button', intent, idle, busy: t('changing'), run: () => {}, unavailable: true }
      : asks
        ? { kind: 'change', intent, idle, busy: t('changing'), target }
        : { kind: 'button', intent, idle, busy: t('changing'), run: () => switchTo(plan.key) }
    if (plan.isCurrent) return plan.isRetired ? { kind: 'none' } : switching('switch', t(`switchInterval.${plan.interval}` as LabelKey<BackendLabels['pricing']>))
    // Name the direction when the prices say which way it goes; fall back
    // to a neutral "switch" when the current price is unknown.
    const intent = plan.isUpgrade ? 'upgrade' : plan.isDowngrade ? 'downgrade' : 'switch'
    return switching(intent, t(intent, { plan: plan.name }))
  }
  const trial = unknownPlan.value ? null : plan.trial
  // Unavailable, not busy, while the plan is unknown: nothing may start a plan until the current one is known.
  return { kind: 'button', intent: 'subscribe', idle: trial ? trialText(trial) : t('subscribe'), busy: t('checkingOut'), run: () => subscribe(plan.key), trial: Boolean(trial), unavailable: unknownPlan.value }
}

/** What a promotion takes off one payment: its percentage, else its amount in the price's currency. */
function promotionOff(offer: PricedOffer, currency: string): string {
  const percent = promotion.value?.percentOff
  if (percent === undefined) return formatBillingAmount(offer.off, currency, locale.value)
  try {
    return new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 2 }).format(percent / 100)
  }
  catch {
    return `${percent}%`
  }
}

providePricingView({
  labels,
  context,
  slots,
  uid,
  nameId: (kind, key) => `${uid}-${kind}-${key}`,
  planAction,
  trialText,
  // A plan price's promotion: its terms and then the regular price ("20% off
  // for 3 months, then $10 /mo"). No struck-through price and no countdown.
  planPromotion: (plan) => {
    const offer = plan.promotion
    const terms = promotion.value
    if (!offer || !terms) return null
    const off = promotionOff(offer, plan.priceAt.currency)
    const price = `${plan.price}${t(`period.${plan.interval}` as LabelKey<BackendLabels['pricing']>)}`
    return terms.duration === 'forever'
      ? t('promotion.forever', { off })
      : terms.duration === 'repeating' && terms.months !== undefined
        ? t('promotion.months', { off, count: terms.months, price })
        : t('promotion.once', { off, price })
  },
  packPromotion: (pack) => {
    const offer = pack.promotion
    if (!offer || !promotion.value) return null
    return t('promotion.pack', { off: promotionOff(offer, pack.offer.currency), price: formatBillingAmount(offer.amount, pack.offer.currency, locale.value) })
  },
  promotionEnds: () => {
    const ends = promotion.value?.endsAt
    return ends ? t('promotion.ends', { date: formatBillingDate(ends, { dateStyle: 'medium' }, locale.value) }) : null
  },
  manages,
  confirm,
  change,
  offersTrial: plan => plan.trial != null && !plan.isCurrent && billing.isFree.value,
})

// The card a link asked for (`?plan=<key>`) comes into view, gently unless motion is reduced.
onMounted(() => {
  if (!requested.value) return
  void nextTick(() => {
    const card = root.value?.querySelector<HTMLElement>('[data-pricing="plan"][data-requested]')
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  })
})

const listsPacks = computed(() => onSale.value && props.showPacks && resolvedPacks.value.length > 0)
// Busy while the pricing loads, while an action (checkout, switch, cancel,
// portal) is in flight, and while a return from checkout reads the new plan.
const busy = computed(() => billing.isLoading.value || pricing.isLoading.value || pending.value !== null || billing.isFinishingCheckout.value)
/** What the status announces: what an action waits for, else that a purchase is being finished. */
const statusText = computed(() => progress.value?.() ?? (billing.isFinishingCheckout.value ? t('finishingPurchase') : ''))
</script>

<template>
  <div
    ref="root"
    data-backend
    data-pricing="table"
    :aria-busy="busy ? 'true' : undefined"
    :data-loading="pricing.isLoading.value ? '' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <component
        :is="heading"
        v-if="title"
        data-pricing="header"
      >
        {{ title }}
      </component>
    </slot>
    <p
      v-if="billing.isFinishingCheckout.value"
      data-pricing="finishing"
    >
      {{ t('finishingPurchase') }}
    </p>
    <template v-if="switchesInterval">
      <slot
        name="interval"
        v-bind="context"
      >
        <PricingPeriodSwitch :pricing="table" />
      </slot>
    </template>
    <template v-if="switchesCurrency">
      <slot
        name="currency"
        v-bind="context"
      >
        <PricingCurrencySelect :pricing="table" />
      </slot>
    </template>
    <!-- The loading and empty notes are polite statuses; a failed read has no plans to show, and the alert below says why. -->
    <slot
      v-if="pricing.isLoading.value"
      name="loading"
      v-bind="context"
    >
      <p
        data-pricing="loading"
        role="status"
        aria-live="polite"
      >
        {{ t('loading') }}
      </p>
    </slot>
    <!-- Billing not launched on this deployment: nothing is on sale yet, and the table says so. -->
    <slot
      v-else-if="!onSale"
      name="soon"
      v-bind="context"
    >
      <p
        data-pricing="soon"
        role="status"
        aria-live="polite"
      >
        {{ t('soon') }}
      </p>
    </slot>
    <template v-else-if="pricing.plans.value !== undefined">
      <slot
        v-if="resolvedPlans.length === 0 && !contact"
        name="empty"
        v-bind="context"
      >
        <p
          data-pricing="empty"
          role="status"
          aria-live="polite"
        >
          {{ t('empty') }}
        </p>
      </slot>
      <div
        v-else
        data-pricing="plans"
      >
        <template
          v-for="plan in resolvedPlans"
          :key="plan.key"
        >
          <slot
            name="plan"
            v-bind="{ ...context, plan }"
          >
            <PricingPlanCard
              :pricing="table"
              :plan="plan"
            />
          </slot>
        </template>
        <template v-if="contact">
          <slot
            name="contact"
            v-bind="{ ...context, contact }"
          >
            <!-- The card for what is sold in person: a link, never a checkout. -->
            <article
              data-pricing="contact"
              :aria-labelledby="`${uid}-contact-card`"
            >
              <div
                :id="`${uid}-contact-card`"
                data-pricing="plan-name"
              >
                {{ contact.name }}
              </div>
              <p
                v-if="contact.blurb"
                data-pricing="plan-blurb"
              >
                {{ contact.blurb }}
              </p>
              <ul data-pricing="plan-features">
                <li
                  v-for="feature in contact.features ?? []"
                  :key="feature"
                  data-pricing="plan-feature"
                >
                  {{ feature }}
                </li>
              </ul>
              <a
                data-pricing="contact-action"
                :href="contact.href"
                :aria-describedby="`${uid}-contact-card`"
              >{{ contact.label ?? t('contact') }}</a>
            </article>
          </slot>
        </template>
      </div>
    </template>
    <p
      v-if="!manages()"
      data-pricing="managed"
      role="note"
    >
      {{ t('managed', { unit: unit.word(credits.unit.value ?? resolvedPacks[0]?.offer.credits?.unit) }) }}
    </p>
    <template v-if="listsPacks">
      <slot
        name="packs"
        v-bind="context"
      >
        <div data-pricing="packs">
          <template
            v-for="pack in resolvedPacks"
            :key="pack.key"
          >
            <slot
              name="pack"
              v-bind="{ ...context, pack }"
            >
              <PricingPackCard
                :pricing="table"
                :pack="pack"
              />
            </slot>
          </template>
        </div>
      </slot>
    </template>
    <PricingEmailOptOut
      v-if="showsEmailOptOut"
      v-model="emailOptOut"
    />
    <template v-if="showPortal && billing.isSubscribed.value && manages()">
      <slot
        name="portal"
        v-bind="context"
      >
        <button
          data-pricing="portal"
          type="button"
          v-bind="busyAttributes(pending === 'portal')"
          @click="openPortal"
        >
          {{ pending === 'portal' ? t('openingPortal') : t('portal') }}
        </button>
      </slot>
    </template>
    <slot
      v-if="shownError"
      name="error"
      v-bind="context"
    >
      <p
        data-pricing="error"
        role="alert"
      >
        {{ shownError }}
      </p>
    </slot>
    <slot
      name="footer"
      v-bind="context"
    />
    <!-- One status, always there, so what an action waits for is announced as it starts (the busy button keeps focus and says it too). -->
    <p
      data-pricing="status"
      role="status"
      aria-live="polite"
    >
      {{ statusText }}
    </p>
  </div>
</template>
