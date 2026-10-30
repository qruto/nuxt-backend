import type { Deliveries } from './deliver'
import { invalid, notFound } from './errors'
import { activeGrants, cycleGrant, grantBenefit, revokeGrant } from './ledger'
import { discountAmounts, discountOff, type Models } from './models'
import { type CheckoutRecord, type CustomerRecord, type DiscountRecord, type GrantRecord, type Metadata, newId, type OrderRecord, type ProductRecord, type FakeState, type SubscriptionRecord } from './state'

// What the provider does when money moves: a paid checkout becomes an order,
// a subscription and benefit grants; a plan changes, cancels, renews or ends
// its trial; a refund takes money back and, when asked, the benefits. Each
// one emits the provider's own event sequence to the app's endpoints.

const DAY_MS = 24 * 60 * 60 * 1000

/** A time plus `count` intervals, calendar months and years as the provider counts them. */
export function addInterval(time: number, interval: 'day' | 'week' | 'month' | 'year', count = 1): number {
  if (interval === 'day') return time + count * DAY_MS
  if (interval === 'week') return time + count * 7 * DAY_MS
  const next = new Date(time)
  if (interval === 'month') next.setUTCMonth(next.getUTCMonth() + count)
  else next.setUTCFullYear(next.getUTCFullYear() + count)
  return next.getTime()
}

/**
 * A product's live fixed price in `currency`, its native presentment price,
 * else its first (the organization's default currency): its amount and
 * currency.
 */
export function priceOf(product: ProductRecord, currency?: string | null): { amount: number, currency: string } {
  const live = product.prices.filter(price => !price.isArchived && price.amountType === 'fixed')
  const fixed = (currency ? live.find(price => price.priceCurrency === currency) : undefined) ?? live[0]
  return { amount: fixed?.priceAmount ?? 0, currency: fixed?.priceCurrency ?? product.prices[0]?.priceCurrency ?? 'usd' }
}

/** Whether a product is free: recurring, and priced at nothing in every currency. */
export function isFreeProduct(product: ProductRecord): boolean {
  const fixed = product.prices.filter(price => !price.isArchived && price.amountType === 'fixed')
  return product.recurringInterval !== null && fixed.length > 0 && fixed.every(price => (price.priceAmount ?? 0) === 0)
}

/**
 * Why a discount can't apply to this product for this customer, or `null`
 * when it can: deleted, not started, ended, used up, for other products, a
 * fixed one with no amount in the currency, or redeemed by the customer as
 * often as its per-customer limit allows. A subscription's discount change
 * skips that limit (`perCustomer: false`), as the provider's does.
 */
export function discountRefusal(discount: DiscountRecord, { productId, customerId, currency, now, perCustomer = true }: { productId: string, customerId: string | null, currency?: string, now: number, perCustomer?: boolean }): string | null {
  if (discount.deleted) return 'This discount does not exist.'
  if (discount.startsAt !== null && discount.startsAt > now) return 'This discount has not started yet.'
  if (discount.endsAt !== null && discount.endsAt <= now) return 'This discount has ended.'
  if (discount.maxRedemptions !== null && discount.redemptionsCount >= discount.maxRedemptions) return 'This discount has been redeemed the maximum number of times.'
  if (discount.productIds.length > 0 && !discount.productIds.includes(productId)) return 'This discount does not apply to this product.'
  if (discount.type === 'fixed' && currency && !(currency.toLowerCase() in discountAmounts(discount))) return 'This discount does not apply to this currency.'
  const limit = discount.maxRedemptionsPerCustomer ?? null
  const redeemed = customerId === null ? 0 : discount.redeemedBy.filter(id => id === customerId).length
  if (perCustomer && limit !== null && redeemed >= limit) return 'This customer already redeemed this discount.'
  return null
}

/**
 * Whether a subscription's discount has run its course at `time`: a
 * `once` one after the payment it took money off, a `repeating` one
 * after its months, counted from that first payment. A `forever` one
 * never; nor one that has not taken money off yet.
 */
function discountExpired(discount: DiscountRecord, appliedAt: number | null, time: number): boolean {
  if (appliedAt === null || discount.duration === 'forever') return false
  if (discount.duration === 'once') return true
  return addInterval(appliedAt, 'month', discount.durationInMonths ?? 1) <= time
}

export interface FlowContext {
  state: FakeState
  models: Models
  deliveries: Deliveries
  now: () => number
}

/** The provider's lifecycle flows over one fake's state. */
export function createFlows({ state, models, deliveries, now }: FlowContext) {
  const { emit } = deliveries

  const product = (id: string): ProductRecord => {
    const found = state.products[id]
    if (!found) throw notFound('Product')
    return found
  }

  const customerOf = (id: string): CustomerRecord => {
    const found = state.customers[id]
    if (!found) throw notFound('Customer')
    return found
  }

  const stateChanged = (customerId: string) => emit('customer.state_changed', models.customerState(customerOf(customerId)))

  const emitSubscription = (subscription: SubscriptionRecord, ...types: Array<'subscription.created' | 'subscription.updated' | 'subscription.active' | 'subscription.canceled' | 'subscription.uncanceled' | 'subscription.revoked' | 'subscription.past_due'>) => {
    for (const type of types) emit(type, models.subscription(subscription))
  }

  /** Grant a product's benefits to a customer, for a subscription or a one-time order. */
  const grantProduct = (customerId: string, productRecord: ProductRecord, owner: { subscriptionId: string | null, orderId: string | null }): GrantRecord[] =>
    productRecord.benefitIds
      .filter(benefitId => state.benefits[benefitId])
      .map(benefitId => grantBenefit(state, { benefitId, customerId, ...owner }, now()))

  /** Revoke grants and say so, one event each. */
  const revoke = (grants: GrantRecord[]) => {
    for (const grant of grants) {
      if (revokeGrant(state, grant, now())) emit('benefit_grant.revoked', models.benefitGrant(grant))
    }
  }

  const subscriptionGrants = (subscriptionId: string) => Object.values(state.grants).filter(grant => grant.subscriptionId === subscriptionId && grant.revokedAt === null)

  const createOrder = (input: Omit<OrderRecord, 'id' | 'refundedAmount' | 'isInvoiceGenerated' | 'invoiceNumber' | 'createdAt' | 'modifiedAt' | 'status'>): OrderRecord => {
    const order: OrderRecord = { ...input, id: newId(), status: 'paid', refundedAmount: 0, isInvoiceGenerated: false, invoiceNumber: null, createdAt: now(), modifiedAt: null }
    state.orders[order.id] = order
    return order
  }

  /** The customer a checkout already names: its own, or the one its external id names; none when it is new. */
  const knownCheckoutCustomer = (checkout: CheckoutRecord): CustomerRecord | undefined => {
    if (checkout.customerId) return customerOf(checkout.customerId)
    const external = checkout.externalCustomerId
    return external ? Object.values(state.customers).find(entry => entry.externalId === external) : undefined
  }

  /** The customer a checkout pays for: the one it names, created when new. */
  const checkoutCustomer = (checkout: CheckoutRecord): CustomerRecord => {
    const known = knownCheckoutCustomer(checkout)
    if (known) return known
    const external = checkout.externalCustomerId
    const created: CustomerRecord = { id: newId(), type: 'individual', email: checkout.customerEmail ?? `${external ?? 'customer'}@fake.invalid`, name: checkout.customerName, externalId: external, metadata: {}, createdAt: now(), modifiedAt: null }
    state.customers[created.id] = created
    emit('customer.created', models.customer(created))
    return created
  }

  /** When a checkout's trial of a product ends, from now; `null` when it offers none. */
  const trialEndOf = (checkout: CheckoutRecord, productRecord: ProductRecord, time: number): number | null => {
    const trialInterval = checkout.allowTrial ? checkout.trialInterval ?? productRecord.trialInterval : null
    return trialInterval ? addInterval(time, trialInterval, checkout.trialIntervalCount ?? productRecord.trialIntervalCount ?? 1) : null
  }

  /** A new subscription for a paid checkout: trialing when the checkout offers the product's trial. */
  const startSubscription = (checkout: CheckoutRecord, customer: CustomerRecord, productRecord: ProductRecord): SubscriptionRecord => {
    const time = now()
    const interval = productRecord.recurringInterval ?? 'month'
    const trialEnd = trialEndOf(checkout, productRecord, time)
    const subscription: SubscriptionRecord = {
      id: newId(),
      customerId: customer.id,
      productId: productRecord.id,
      status: trialEnd ? 'trialing' : 'active',
      ...priceOf(productRecord, checkout.currency),
      recurringInterval: interval,
      recurringIntervalCount: productRecord.recurringIntervalCount ?? 1,
      currentPeriodStart: time,
      currentPeriodEnd: trialEnd ?? addInterval(time, interval, productRecord.recurringIntervalCount ?? 1),
      trialStart: trialEnd ? time : null,
      trialEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      startedAt: time,
      endsAt: null,
      endedAt: null,
      pauseAtPeriodEnd: false,
      pausedAt: null,
      resumesAt: null,
      discountId: checkout.discountId,
      // The checkout's payment takes it off first; a trial's end does, after a trial.
      discountAppliedAt: checkout.discountId && !trialEnd ? time : null,
      checkoutId: checkout.id,
      customerCancellationReason: null,
      customerCancellationComment: null,
      pendingUpdate: null,
      metadata: checkout.metadata,
      createdAt: time,
      modifiedAt: null,
    }
    state.subscriptions[subscription.id] = subscription
    return subscription
  }

  /**
   * A paid checkout that acts on a subscription it names (a free one): the
   * subscription moves to the checkout's product, on a new period that
   * starts now — with the trial the checkout offers, as a first checkout
   * of the product would.
   */
  const upgradeThroughCheckout = (checkout: CheckoutRecord, productRecord: ProductRecord): SubscriptionRecord => {
    const subscription = state.subscriptions[checkout.subscriptionId!]
    if (!subscription) throw notFound('Subscription')
    revoke(subscriptionGrants(subscription.id))
    const time = now()
    const interval = productRecord.recurringInterval ?? 'month'
    const trialEnd = trialEndOf(checkout, productRecord, time)
    Object.assign(subscription, {
      productId: productRecord.id,
      ...priceOf(productRecord, checkout.currency),
      status: trialEnd ? 'trialing' : 'active',
      recurringInterval: interval,
      recurringIntervalCount: productRecord.recurringIntervalCount ?? 1,
      currentPeriodStart: time,
      currentPeriodEnd: trialEnd ?? addInterval(time, interval, productRecord.recurringIntervalCount ?? 1),
      trialStart: trialEnd ? time : null,
      trialEnd,
      checkoutId: checkout.id,
      discountId: checkout.discountId,
      discountAppliedAt: checkout.discountId && !trialEnd ? time : null,
      modifiedAt: time,
    })
    return subscription
  }

  /**
   * A subscription to a free product, made through the API rather than a
   * checkout: active at once, its benefits granted, and no order — the
   * provider creates none for it, nor sends a confirmation.
   */
  const startFreeSubscription = (customer: CustomerRecord, productRecord: ProductRecord, metadata: Metadata): SubscriptionRecord => {
    const time = now()
    const interval = productRecord.recurringInterval ?? 'month'
    const subscription: SubscriptionRecord = {
      id: newId(),
      customerId: customer.id,
      productId: productRecord.id,
      status: 'active',
      ...priceOf(productRecord),
      recurringInterval: interval,
      recurringIntervalCount: productRecord.recurringIntervalCount ?? 1,
      currentPeriodStart: time,
      currentPeriodEnd: addInterval(time, interval, productRecord.recurringIntervalCount ?? 1),
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      startedAt: time,
      endsAt: null,
      endedAt: null,
      pauseAtPeriodEnd: false,
      pausedAt: null,
      resumesAt: null,
      discountId: null,
      checkoutId: null,
      customerCancellationReason: null,
      customerCancellationComment: null,
      pendingUpdate: null,
      metadata,
      createdAt: time,
      modifiedAt: null,
    }
    state.subscriptions[subscription.id] = subscription
    emitSubscription(subscription, 'subscription.created')
    for (const grant of grantProduct(customer.id, productRecord, { subscriptionId: subscription.id, orderId: null })) emit('benefit_grant.created', models.benefitGrant(grant))
    emitSubscription(subscription, 'subscription.active')
    stateChanged(customer.id)
    return subscription
  }

  /** Count a redemption of the checkout's discount, for its customer. */
  const redeem = (checkout: CheckoutRecord, customerId: string) => {
    const discount = checkout.discountId ? state.discounts[checkout.discountId] : undefined
    if (!discount) return
    discount.redemptionsCount += 1
    discount.redeemedBy.push(customerId)
    discount.modifiedAt = now()
  }

  /**
   * Refuse a checkout whose discount can no longer be redeemed: the provider
   * checks it again at confirmation, so two checkouts opened on one
   * single-use discount can't both redeem it.
   */
  const requireRedeemableDiscount = (checkout: CheckoutRecord) => {
    const discount = checkout.discountId ? state.discounts[checkout.discountId] : undefined
    const currency = checkout.currency ?? priceOf(product(checkout.productId)).currency
    const refusal = discount ? discountRefusal(discount, { productId: checkout.productId, customerId: knownCheckoutCustomer(checkout)?.id ?? null, currency, now: now() }) : null
    if (refusal) throw invalid('discount_id', refusal)
  }

  /** The subscription a paid checkout starts, or the plan change it asks for, announced; `null` for a one-time product. */
  const checkoutSubscription = (checkout: CheckoutRecord, customer: CustomerRecord, productRecord: ProductRecord): SubscriptionRecord | null => {
    if (productRecord.recurringInterval === null) return null
    const changes = Boolean(checkout.subscriptionId)
    const subscription = changes ? upgradeThroughCheckout(checkout, productRecord) : startSubscription(checkout, customer, productRecord)
    emitSubscription(subscription, changes ? 'subscription.updated' : 'subscription.created')
    return subscription
  }

  /** A paid checkout's order: nothing is charged while its subscription is trialing. */
  const checkoutOrder = (checkout: CheckoutRecord, customer: CustomerRecord, productRecord: ProductRecord, subscription: SubscriptionRecord | null, amounts: ReturnType<Models['checkoutAmounts']>): OrderRecord => {
    const trialing = subscription?.status === 'trialing'
    const subscriptionReason = checkout.subscriptionId ? 'subscription_update' : 'subscription_create'
    return createOrder({
      customerId: customer.id,
      productId: productRecord.id,
      subscriptionId: subscription?.id ?? null,
      checkoutId: checkout.id,
      discountId: checkout.discountId,
      billingReason: subscription ? subscriptionReason : 'purchase',
      subtotalAmount: trialing ? 0 : amounts.amount,
      discountAmount: trialing ? 0 : amounts.discountAmount,
      currency: amounts.currency,
      label: productRecord.name,
      metadata: checkout.metadata,
      customFieldData: checkout.customFieldData,
    })
  }

  /**
   * Pay a checkout: the provider's sequence from confirmation to success —
   * the checkout confirmed, the subscription (or the plan change it asks for)
   * and the order, the benefits granted, the order paid, the checkout
   * succeeded and the customer's state changed. A discount that can no
   * longer be redeemed refuses it, before anything changes.
   */
  const completeCheckout = (checkout: CheckoutRecord): { order: OrderRecord, subscription: SubscriptionRecord | null } => {
    const productRecord = product(checkout.productId)
    requireRedeemableDiscount(checkout)
    const customer = checkoutCustomer(checkout)
    const amounts = models.checkoutAmounts(checkout)
    Object.assign(checkout, { status: 'confirmed', customerId: customer.id, modifiedAt: now() })
    emit('checkout.updated', models.checkout(checkout))
    redeem(checkout, customer.id)
    const subscription = checkoutSubscription(checkout, customer, productRecord)
    const order = checkoutOrder(checkout, customer, productRecord, subscription, amounts)
    emit('order.created', models.order(order))
    const grants = grantProduct(customer.id, productRecord, subscription ? { subscriptionId: subscription.id, orderId: null } : { subscriptionId: null, orderId: order.id })
    for (const grant of grants) emit('benefit_grant.created', models.benefitGrant(grant))
    emit('order.paid', models.order(order))
    if (subscription?.status === 'active') emitSubscription(subscription, 'subscription.active')
    Object.assign(checkout, { status: 'succeeded', modifiedAt: now() })
    emit('checkout.updated', models.checkout(checkout))
    stateChanged(customer.id)
    return { order, subscription }
  }

  /**
   * What the subscription's discount takes off a period's charge, at the
   * start of that period: a discount that has run its course comes off the
   * subscription first, as the provider clears an expired one; the first
   * payment it takes money off starts its months.
   */
  const periodDiscount = (subscription: SubscriptionRecord, amount: number): { discountId: string | null, discountAmount: number } => {
    const discount = subscription.discountId ? state.discounts[subscription.discountId] : undefined
    if (!discount) return { discountId: null, discountAmount: 0 }
    const time = now()
    if (discountExpired(discount, subscription.discountAppliedAt ?? null, time)) {
      Object.assign(subscription, { discountId: null, discountAppliedAt: null, modifiedAt: time })
      return { discountId: null, discountAmount: 0 }
    }
    const discountAmount = discountOff(discount, amount, subscription.currency)
    if (discountAmount > 0 && subscription.discountAppliedAt == null) subscription.discountAppliedAt = time
    return { discountId: discount.id, discountAmount }
  }

  /** A charge for a subscription's new period or its first paid one, with the order events: its discount taken off. */
  const chargePeriod = (subscription: SubscriptionRecord, billingReason: OrderRecord['billingReason'], amount = subscription.amount) => {
    const { discountId, discountAmount } = periodDiscount(subscription, amount)
    const order = createOrder({
      customerId: subscription.customerId,
      productId: subscription.productId,
      subscriptionId: subscription.id,
      checkoutId: null,
      discountId,
      billingReason,
      subtotalAmount: amount,
      discountAmount,
      currency: subscription.currency,
      label: state.products[subscription.productId]?.name ?? 'Subscription',
      metadata: subscription.metadata,
      customFieldData: {},
    })
    emit('order.created', models.order(order))
    emit('order.paid', models.order(order))
  }

  /** Move a subscription to another product now: its benefits follow, an upgrade is charged the difference. */
  const switchProduct = (subscription: SubscriptionRecord, next: ProductRecord) => {
    const before = subscription.amount
    revoke(subscriptionGrants(subscription.id))
    Object.assign(subscription, { productId: next.id, ...priceOf(next), pendingUpdate: null, modifiedAt: now() })
    for (const grant of grantProduct(subscription.customerId, next, { subscriptionId: subscription.id, orderId: null })) emit('benefit_grant.created', models.benefitGrant(grant))
    if (subscription.amount > before) chargePeriod(subscription, 'subscription_update', subscription.amount - before)
  }

  /**
   * A product's benefits changed: as the provider does, every subscription
   * still running on it is granted what was attached and loses what was
   * detached, one event each, then its customer's state changed.
   */
  const regrantSubscribers = (productRecord: ProductRecord) => {
    const attached = new Set(productRecord.benefitIds.filter(benefitId => state.benefits[benefitId]))
    const running = Object.values(state.subscriptions).filter(subscription => subscription.productId === productRecord.id && subscription.endedAt === null)
    for (const subscription of running) {
      const held = subscriptionGrants(subscription.id)
      const heldIds = new Set(held.map(grant => grant.benefitId))
      const detached = held.filter(grant => !attached.has(grant.benefitId))
      revoke(detached)
      const owner = { subscriptionId: subscription.id, orderId: null }
      const added = [...attached].filter(benefitId => !heldIds.has(benefitId)).map(benefitId => grantBenefit(state, { benefitId, customerId: subscription.customerId, ...owner }, now()))
      for (const grant of added) emit('benefit_grant.created', models.benefitGrant(grant))
      if (detached.length > 0 || added.length > 0) stateChanged(subscription.customerId)
    }
  }

  /** A plan change: now, or at the period's end with `next_period`. */
  const changePlan = (subscription: SubscriptionRecord, productId: string, proration: string | null) => {
    const next = product(productId)
    if (next.recurringInterval === null || next.isArchived) throw invalid('product_id', 'The product is not a subscription product.')
    if (proration === 'next_period') {
      subscription.pendingUpdate = { id: newId(), productId, appliesAt: subscription.currentPeriodEnd, createdAt: now() }
      subscription.modifiedAt = now()
    }
    else switchProduct(subscription, next)
    emitSubscription(subscription, 'subscription.updated')
    stateChanged(subscription.customerId)
  }

  /** Cancel at the period's end (`cancel`) or undo it. */
  const setCancelAtPeriodEnd = (subscription: SubscriptionRecord, cancel: boolean, churn: { reason: string | null, comment: string | null }) => {
    Object.assign(subscription, cancel
      ? { cancelAtPeriodEnd: true, canceledAt: now(), endsAt: subscription.currentPeriodEnd, customerCancellationReason: churn.reason, customerCancellationComment: churn.comment, modifiedAt: now() }
      : { cancelAtPeriodEnd: false, canceledAt: null, endsAt: null, customerCancellationReason: null, customerCancellationComment: null, modifiedAt: now() })
    emitSubscription(subscription, 'subscription.updated', cancel ? 'subscription.canceled' : 'subscription.uncanceled')
  }

  /** End a subscription now: its benefits revoked. */
  const revokeSubscription = (subscription: SubscriptionRecord, churn: { reason: string | null, comment: string | null } = { reason: null, comment: null }) => {
    const time = now()
    Object.assign(subscription, { status: 'canceled', cancelAtPeriodEnd: false, canceledAt: subscription.canceledAt ?? time, endsAt: time, endedAt: time, customerCancellationReason: churn.reason ?? subscription.customerCancellationReason, customerCancellationComment: churn.comment ?? subscription.customerCancellationComment, modifiedAt: time })
    revoke(subscriptionGrants(subscription.id))
    emitSubscription(subscription, 'subscription.updated', 'subscription.canceled', 'subscription.revoked')
    stateChanged(subscription.customerId)
  }

  /** Start a new period now and charge it: a renewal, a recovered payment, a resumed pause. */
  const startPeriod = (subscription: SubscriptionRecord) => {
    const time = now()
    Object.assign(subscription, { status: 'active', currentPeriodStart: time, currentPeriodEnd: addInterval(time, subscription.recurringInterval, subscription.recurringIntervalCount), modifiedAt: time })
  }

  /**
   * Pause at the period's end, or resume. A paused subscription resumes now,
   * on a new period that is charged; one only set to pause stays active.
   */
  const setPaused = (subscription: SubscriptionRecord, pause: boolean, resumesAt: number | null) => {
    if (pause) {
      Object.assign(subscription, { pauseAtPeriodEnd: true, resumesAt, modifiedAt: now() })
      emitSubscription(subscription, 'subscription.updated')
      return
    }
    const paused = subscription.status === 'paused'
    Object.assign(subscription, { pauseAtPeriodEnd: false, pausedAt: null, resumesAt: null, modifiedAt: now() })
    if (paused) startPeriod(subscription)
    emitSubscription(subscription, 'subscription.updated')
    if (!paused) return
    chargePeriod(subscription, 'subscription_cycle')
    stateChanged(subscription.customerId)
  }

  /**
   * The renewal's payment fails: the subscription is past due, keeping its
   * benefits while the provider retries. The next renewal recovers it.
   */
  const failPayment = (subscription: SubscriptionRecord): boolean => {
    if (subscription.status !== 'active') return false
    Object.assign(subscription, { status: 'past_due', modifiedAt: now() })
    emitSubscription(subscription, 'subscription.updated', 'subscription.past_due')
    stateChanged(subscription.customerId)
    return true
  }

  /** A period's end that pauses the subscription: it bills nothing until it resumes. */
  const pauseNow = (subscription: SubscriptionRecord) => {
    Object.assign(subscription, { status: 'paused', pauseAtPeriodEnd: false, pausedAt: now(), modifiedAt: now() })
    emitSubscription(subscription, 'subscription.updated')
    stateChanged(subscription.customerId)
  }

  /** End a trial now: the subscription turns active and its first period is charged. */
  const endTrial = (subscription: SubscriptionRecord) => {
    if (subscription.status !== 'trialing') return false
    const time = now()
    Object.assign(subscription, { status: 'active', trialEnd: time, currentPeriodStart: time, currentPeriodEnd: addInterval(time, subscription.recurringInterval, subscription.recurringIntervalCount), modifiedAt: time })
    emitSubscription(subscription, 'subscription.updated', 'subscription.active')
    chargePeriod(subscription, 'subscription_cycle')
    stateChanged(subscription.customerId)
    return true
  }

  /**
   * Renew now, as if its period had just ended: a trial ends, a subscription
   * set to cancel ends, one set to pause pauses, a past-due one is paid at
   * last, anything else starts a new period — a scheduled plan change
   * applied, the period charged, meter credits renewed.
   */
  const renew = (subscription: SubscriptionRecord): boolean => {
    if (subscription.status === 'trialing') return endTrial(subscription)
    if (subscription.status !== 'active' && subscription.status !== 'past_due') return false
    if (subscription.cancelAtPeriodEnd) {
      revokeSubscription(subscription)
      return true
    }
    if (subscription.pauseAtPeriodEnd && subscription.status === 'active') {
      pauseNow(subscription)
      return true
    }
    const pending = subscription.pendingUpdate
    if (pending) switchProduct(subscription, product(pending.productId))
    startPeriod(subscription)
    const time = now()
    for (const grant of subscriptionGrants(subscription.id)) {
      cycleGrant(state, grant, time)
      emit('benefit_grant.cycled', models.benefitGrant(grant))
    }
    emitSubscription(subscription, 'subscription.updated')
    chargePeriod(subscription, 'subscription_cycle')
    stateChanged(subscription.customerId)
    return true
  }

  /**
   * Refund an order: the money back, and with `revokeBenefits` what a
   * one-time order granted. The provider refuses `revokeBenefits` on a
   * subscription's order: its benefits go when the subscription is revoked.
   */
  const refundOrder = (order: OrderRecord, input: { amount: number, reason: string, revokeBenefits: boolean, metadata: Metadata }) => {
    if (input.revokeBenefits && order.subscriptionId) {
      throw invalid('revoke_benefits', 'Benefits can only be revoked for one-time purchase orders: a subscription\'s benefits are revoked with the subscription.')
    }
    const paid = order.subtotalAmount - order.discountAmount
    const refundable = paid - order.refundedAmount
    if (!(input.amount > 0) || input.amount > refundable) throw invalid('amount', `The amount must be above zero and at most ${refundable}.`)
    const refund = { id: newId(), orderId: order.id, subscriptionId: order.subscriptionId, customerId: order.customerId, amount: input.amount, currency: order.currency, reason: input.reason, revokeBenefits: input.revokeBenefits, metadata: input.metadata, createdAt: now() }
    state.refunds[refund.id] = refund
    order.refundedAmount += input.amount
    order.status = order.refundedAmount >= paid ? 'refunded' : 'partially_refunded'
    order.modifiedAt = now()
    emit('refund.created', models.refund(refund))
    emit('order.updated', models.order(order))
    emit('order.refunded', models.order(order))
    if (input.revokeBenefits) revoke(activeGrants(state, order.customerId).filter(grant => grant.orderId === order.id))
    stateChanged(order.customerId)
    return refund
  }

  /**
   * A subscription's discount changed through the API: it takes money off
   * from the next period's payment, replacing any it had; `null` removes
   * it. Checked as the provider checks it: the dates, the total cap, the
   * subscription's product and currency, but never the per-customer limit.
   * The redemption counts towards the cap.
   */
  const setDiscount = (subscription: SubscriptionRecord, discountId: string | null) => {
    if (discountId !== null) {
      const discount = state.discounts[discountId]
      if (!discount) throw invalid('discount_id', 'Discount does not exist.')
      if (subscription.discountId === discountId) throw invalid('discount_id', 'This discount is already applied to the subscription.')
      const refusal = discountRefusal(discount, { productId: subscription.productId, customerId: subscription.customerId, currency: subscription.currency, now: now(), perCustomer: false })
      if (refusal) throw invalid('discount_id', refusal)
      discount.redemptionsCount += 1
      discount.redeemedBy.push(subscription.customerId)
      discount.modifiedAt = now()
    }
    Object.assign(subscription, { discountId, discountAppliedAt: null, modifiedAt: now() })
    emitSubscription(subscription, 'subscription.updated')
  }

  return { completeCheckout, startFreeSubscription, setDiscount, changePlan, setCancelAtPeriodEnd, revokeSubscription, setPaused, failPayment, endTrial, renew, refundOrder, regrantSubscribers, stateChanged }
}

export type Flows = ReturnType<typeof createFlows>
